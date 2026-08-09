import type { Context } from "hono";
import { Hono } from "hono";
import {
  CSP,
  INVITE_CODE,
  MAX_CONTENT_LENGTH,
  MAX_REGISTER_BATCH,
  PIXEL_PNG,
  SECURITY_HEADERS,
  isAdmin,
  loginDelayMs,
  quotaFor,
} from "./config";
import {
  audit,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  login,
  requireAdmin,
  requireUser,
  verifyPassword,
} from "./auth";
import { sqlite } from "./db";
import { clientIp, overLimit, rateLimit } from "./rate-limit";
import { chinaDate, chinaNow, computeId, escapeLike, isValidId, isValidWxId, maskContent, maskWxId, timingSafeEqual } from "./utils";
import { LOGIN_HTML, adminPage, htmlPage } from "./pages";

const app = new Hono();

/** 兼容 JSON 与表单提交（登录/注册页复用 CF 版前端，发的是 x-www-form-urlencoded） */
async function parseBody(c: Context): Promise<Record<string, unknown>> {
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await c.req.parseBody();
    return Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
    );
  }
  return await c.req.json();
}

app.use("*", async (c, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  await next();
});

/* ---- 公开端点 ---- */

app.get("/pixel", (c) => {
  const ip = clientIp(c);
  overLimit("pixel", ip);
  const wxId = c.req.query("wxId") ?? "";
  const id = c.req.query("id") ?? "";
  if (isValidId(id) && isValidWxId(wxId)) {
    sqlite
      .query("INSERT OR IGNORE INTO reads (id, ip, timestamp) VALUES (?, ?, ?)")
      .run(id, ip, chinaNow());
  }
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Content-Type", "image/png");
  c.header("Content-Security-Policy", "default-src 'none'");
  return c.body(PIXEL_PNG);
});

app.get("/count", (c) => {
  const id = c.req.query("id") ?? "";
  if (!isValidId(id) || overLimit("count", clientIp(c))) {
    return c.json({ count: 0 });
  }
  const row = sqlite
    .query("SELECT COUNT(DISTINCT ip) AS n FROM reads WHERE id = ?")
    .get(id) as { n: number };
  return c.json({ count: row.n });
});

app.get("/auth/status", (c) => c.json({ auth_required: true, invite_required: !!INVITE_CODE }));

app.post("/register", async (c) => {
  const ip = clientIp(c);
  if (overLimit("register", ip)) return c.json({ error: "rate limited" }, 429);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const items = Array.isArray(body) ? (body as Array<Record<string, unknown>>) : [body as Record<string, unknown>];
  if (items.length === 0 || items.length > MAX_REGISTER_BATCH) {
    return c.json({ error: "invalid batch" }, 400);
  }

  const ids: string[] = [];
  for (const item of items) {
    const wxId = typeof item.wxId === "string" ? item.wxId : "";
    const content = typeof item.content === "string" ? item.content : "";
    const createTime = String(item.createTime ?? "");

    if (
      !isValidWxId(wxId) ||
      content.length === 0 ||
      content.length > MAX_CONTENT_LENGTH ||
      !/^\d{1,16}$/.test(createTime)
    ) {
      return c.json({ error: "invalid payload" }, 400);
    }

    const user = sqlite.query("SELECT level FROM users WHERE wx_id = ?").get(wxId) as
      | { level: number }
      | undefined;
    if (!user || user.level <= 0) return c.json({ error: "not registered" }, 403);

    const id = await computeId(wxId, content, createTime);
    sqlite.transaction(() => {
      const now = chinaNow();
      const res = sqlite
        .query("INSERT OR IGNORE INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
        .run(id, wxId, content, now);
      if (res.changes === 0) return false;

      sqlite.query("UPDATE users SET message_count = message_count + 1 WHERE wx_id = ?").run(wxId);
      sqlite
        .query(
          "INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, 1) ON CONFLICT (date, wx_id) DO UPDATE SET count = count + 1",
        )
        .run(chinaDate(), wxId);

      const quota = quotaFor(user.level);
      const excess = sqlite
        .query("SELECT id FROM messages WHERE wx_id = ? ORDER BY timestamp DESC LIMIT -1 OFFSET ?")
        .all(wxId, quota) as Array<{ id: string }>;
      for (const m of excess) {
        sqlite.query("DELETE FROM reads WHERE id = ?").run(m.id);
        sqlite.query("DELETE FROM messages WHERE id = ?").run(m.id);
      }
      sqlite
        .query("UPDATE users SET message_count = (SELECT COUNT(*) FROM messages WHERE wx_id = ?) WHERE wx_id = ?")
        .run(wxId, wxId);
    })();

    ids.push(id);
  }

  return c.json(Array.isArray(body) ? { ids } : { id: ids[0] ?? "" });
});

/* ---- 认证 ---- */

app.use("/auth/*", rateLimit("auth"));

app.post("/auth/register", async (c) => {
  const ip = clientIp(c);
  let body: { wxId?: unknown; password?: unknown; inviteCode?: unknown; invite?: unknown };
  try {
    body = await parseBody(c);
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const wxId = typeof body.wxId === "string" ? body.wxId : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidWxId(wxId) || password.length < 8 || password.length > 128) {
    return c.json({ error: "invalid credentials" }, 400);
  }
  if (INVITE_CODE) {
    const code = typeof body.inviteCode === "string" ? body.inviteCode : typeof body.invite === "string" ? body.invite : "";
    if (!timingSafeEqual(code, INVITE_CODE)) {
      await new Promise((r) => setTimeout(r, loginDelayMs()));
      return c.json({ error: "invalid invite code" }, 403);
    }
  }
  const exists = sqlite.query("SELECT 1 FROM users WHERE wx_id = ?").get(wxId);
  if (exists) return c.json({ error: "already registered" }, 409);

  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)")
    .run(wxId, await hashPassword(password), chinaNow());
  createSession(c, wxId);
  audit(wxId, "register", null, ip);
  return c.json({ ok: true });
});

app.post("/auth/verify", async (c) => {
  const ip = clientIp(c);
  let body: { wxId?: unknown; password?: unknown };
  try {
    body = await parseBody(c);
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const wxId = typeof body.wxId === "string" ? body.wxId : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ok = await login(wxId, password);
  if (!ok) {
    await new Promise((r) => setTimeout(r, loginDelayMs()));
    audit(wxId, "login_failed", null, ip);
    return c.json({ error: "invalid credentials" }, 401);
  }
  createSession(c, wxId);
  audit(wxId, "login", null, ip);
  return c.json({ ok: true });
});

app.post("/auth/logout", (c) => {
  const user = getSessionUser(c);
  destroySession(c);
  if (user) audit(user.wxId, "logout", null, clientIp(c));
  return c.json({ ok: true });
});

app.post("/auth/password", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  let body: { oldPassword?: unknown; newPassword?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8 || newPassword.length > 128) return c.json({ error: "invalid password" }, 400);

  const row = sqlite.query("SELECT password_hash FROM users WHERE wx_id = ?").get(user.wxId) as {
    password_hash: string;
  };
  if (!(await verifyPassword(oldPassword, row.password_hash))) {
    await new Promise((r) => setTimeout(r, loginDelayMs()));
    return c.json({ error: "invalid credentials" }, 401);
  }
  sqlite.query("UPDATE users SET password_hash = ? WHERE wx_id = ?").run(await hashPassword(newPassword), user.wxId);
  audit(user.wxId, "password_change", null, clientIp(c));
  return c.json({ ok: true });
});

/* ---- 登录后 ---- */

function requireUserOr(c: Context): Response | null {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return null;
}

app.get("/login", (c) => {
  if (getSessionUser(c)) return c.redirect("/");
  c.header("Content-Security-Policy", CSP.LOGIN);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(LOGIN_HTML);
});

app.get("/", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(htmlPage({ wxId: user.wxId, level: user.level }));
});

app.get("/messages", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const user = getSessionUser(c)!;
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const base = (cond: string): string =>
    `SELECT m.id, m.content, m.timestamp, (SELECT COUNT(DISTINCT r.ip) FROM reads r WHERE r.id = m.id) AS read_count
     FROM messages m ${cond} ORDER BY m.timestamp DESC LIMIT ? OFFSET ?`;

  let rows: Array<{ id: string; content: string; timestamp: string; read_count: number }>;
  if (q) {
    if (q.length >= 3) {
      const phrase = q.replaceAll('"', '""');
      try {
        rows = sqlite
          .query(
            `${base("WHERE m.wx_id = ? AND m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)")}`,
          )
          .all(user.wxId, `"${phrase}"`, limit, offset) as typeof rows;
      } catch {
        rows = sqlite
          .query(`${base("WHERE m.wx_id = ? AND m.content LIKE ? ESCAPE '\\'")}`)
          .all(user.wxId, `%${escapeLike(q)}%`, limit, offset) as typeof rows;
      }
    } else {
      rows = sqlite
        .query(`${base("WHERE m.wx_id = ? AND m.content LIKE ? ESCAPE '\\'")}`)
        .all(user.wxId, `%${escapeLike(q)}%`, limit, offset) as typeof rows;
    }
  } else {
    rows = sqlite.query(`${base("WHERE m.wx_id = ?")}`).all(user.wxId, limit, offset) as typeof rows;
  }
  return c.json(rows.map((r) => ({ id: r.id, content: r.content, reads: r.read_count, timestamp: r.timestamp })));
});

app.delete("/messages", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(user.wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(user.wxId);
  })();
  audit(user.wxId, "delete_all_messages", null, clientIp(c));
  return c.json({ ok: true });
});

app.delete("/messages/:wxId", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const wxId = c.req.param("wxId");
  if (wxId !== user.wxId) return c.json({ error: "forbidden" }, 403);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(user.wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(user.wxId);
  })();
  audit(user.wxId, "delete_all_messages", null, clientIp(c));
  return c.json({ ok: true });
});

app.get("/reads/:id", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  const msg = sqlite.query("SELECT wx_id FROM messages WHERE id = ?").get(id) as { wx_id: string } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  if (msg.wx_id !== user.wxId) return c.json({ error: "forbidden" }, 403);
  const rows = sqlite
    .query("SELECT ip, timestamp FROM reads WHERE id = ? ORDER BY timestamp DESC LIMIT 500")
    .all(id) as Array<{ ip: string; timestamp: string }>;
  return c.json(rows);
});

const LEADERBOARD_TABLES: Record<string, string> = {
  reg: "registration_stats",
  read: "read_stats",
  msg: "message_read_stats",
};

app.get("/leaderboard", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const me = getSessionUser(c)!;
  const metric = c.req.query("metric") ?? "reg";
  const scope = c.req.query("scope") ?? "total";
  if (!["reg", "read", "msg"].includes(metric) || !["day", "total"].includes(scope)) {
    return c.json({ error: "invalid params" }, 400);
  }

  // 注册/已读榜：统计表（按 wx_id 聚合）；消息榜：按消息实时聚合（统计表无消息维度）
  if (metric === "msg") {
    const dayCond = scope === "day" ? "AND r.timestamp >= ? " : "";
    const params: Array<string> = scope === "day" ? [chinaDate() + " 00:00:00"] : [];
    const rows = sqlite
      .query(
        `SELECT m.id, m.wx_id, m.content, COUNT(DISTINCT r.ip) AS total
         FROM messages m LEFT JOIN reads r ON r.id = m.id ${dayCond}
         GROUP BY m.id ORDER BY total DESC, m.wx_id ASC, m.id ASC LIMIT 10`,
      )
      .all(...params) as Array<{ id: string; wx_id: string; content: string; total: number }>;
    return c.json(
      rows.map((r) => ({
        id: r.id,
        wxId: maskWxId(r.wx_id),
        content: maskContent(r.content),
        count: r.total,
        me: r.wx_id === me.wxId,
      })),
    );
  }

  const table = LEADERBOARD_TABLES[metric];
  const where = scope === "day" ? " WHERE date = ?" : "";
  const params: Array<string> = scope === "day" ? [chinaDate()] : [];
  const rows = sqlite
    .query(`SELECT wx_id, SUM(count) AS total FROM ${table}${where} GROUP BY wx_id ORDER BY total DESC LIMIT 10`)
    .all(...params) as Array<{ wx_id: string; total: number }>;

  return c.json(rows.map((r) => ({ wxId: maskWxId(r.wx_id), count: r.total, me: r.wx_id === me.wxId })));
});

/* ---- 管理员 ---- */

app.use("/admin/*", rateLimit("admin"));

function adminOr(c: Context): Response | null {
  const user = requireAdmin(c);
  if (!user) return c.json({ error: "forbidden" }, 403);
  return null;
}

app.get("/admin", (c) => {
  const user = requireAdmin(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(adminPage({ wxId: user.wxId }));
});

app.get("/admin/users", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const rows = sqlite
    .query("SELECT wx_id AS wxId, level, created_at AS createdAt FROM users ORDER BY created_at DESC")
    .all() as Array<{ wxId: string; level: number; createdAt: string }>;
  return c.json(rows);
});

app.post("/admin/users", async (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  let body: { wxId?: unknown; password?: unknown; level?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const wxId = typeof body.wxId === "string" ? body.wxId : "";
  const password = typeof body.password === "string" ? body.password : "";
  const level = Number(body.level ?? 1);
  if (!isValidWxId(wxId) || password.length < 8 || !Number.isInteger(level) || level < 0 || level > 99) {
    return c.json({ error: "invalid payload" }, 400);
  }
  if (sqlite.query("SELECT 1 FROM users WHERE wx_id = ?").get(wxId)) return c.json({ error: "exists" }, 409);
  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(wxId, await hashPassword(password), level, chinaNow());
  audit(wxId, "admin_create_user", null, clientIp(c));
  return c.json({ ok: true });
});

app.post("/admin/level", async (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  let body: { wxId?: unknown; level?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const wxId = typeof body.wxId === "string" ? body.wxId : "";
  const level = Number(body.level);
  if (!isValidWxId(wxId) || !Number.isInteger(level) || level < 0 || level > 99) {
    return c.json({ error: "invalid payload" }, 400);
  }
  if (isAdmin(wxId) && level === 0) return c.json({ error: "protected account" }, 403);
  if (level === 0) {
    sqlite.transaction(() => {
      sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(wxId);
      sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(wxId);
      sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
      sqlite.query("UPDATE users SET level = 0, message_count = 0 WHERE wx_id = ?").run(wxId);
    })();
  } else {
    sqlite.query("UPDATE users SET level = ? WHERE wx_id = ?").run(level, wxId);
  }
  audit(wxId, "admin_set_level", String(level), clientIp(c));
  return c.json({ ok: true });
});

app.post("/admin/password", async (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  let body: { wxId?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const wxId = typeof body.wxId === "string" ? body.wxId : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidWxId(wxId) || password.length < 8 || password.length > 128) {
    return c.json({ error: "invalid payload" }, 400);
  }
  sqlite.query("UPDATE users SET password_hash = ? WHERE wx_id = ?").run(await hashPassword(password), wxId);
  audit(wxId, "admin_set_password", null, clientIp(c));
  return c.json({ ok: true });
});

app.delete("/admin/users/:wxId", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const wxId = c.req.param("wxId");
  if (isAdmin(wxId)) return c.json({ error: "protected account" }, 403);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(wxId);
    sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
    sqlite.query("DELETE FROM users WHERE wx_id = ?").run(wxId);
  })();
  audit(wxId, "admin_delete_user", null, clientIp(c));
  return c.json({ ok: true });
});

app.get("/admin/messages", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const q = (c.req.query("q") ?? "").trim();
  const fwx = (c.req.query("wxId") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const conds: Array<string> = [];
  const params: Array<string> = [];
  if (fwx) {
    conds.push("m.wx_id = ?");
    params.push(fwx);
  }
  if (q) {
    conds.push("m.content LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(q)}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = sqlite
    .query(
      `SELECT m.id, m.wx_id AS wxId, m.content, m.timestamp,
              (SELECT COUNT(DISTINCT r.ip) FROM reads r WHERE r.id = m.id) AS reads
       FROM messages m ${where} ORDER BY m.timestamp DESC LIMIT ?`,
    )
    .all(...params, String(limit)) as Array<{ id: string; wxId: string; content: string; timestamp: string; reads: number }>;
  return c.json(rows);
});

app.delete("/admin/messages", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const wxId = (c.req.query("wxId") ?? "").trim();
  if (wxId) {
    sqlite.transaction(() => {
      sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(wxId);
      sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(wxId);
    })();
    audit(wxId, "admin_wipe_user", null, clientIp(c));
  } else {
    sqlite.transaction(() => {
      sqlite.query("DELETE FROM reads").run();
      sqlite.query("DELETE FROM messages").run();
    })();
    audit(null, "admin_delete_all_messages", null, clientIp(c));
  }
  return c.json({ ok: true });
});

app.delete("/admin/messages/:id", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id = ?").run(id);
    sqlite.query("DELETE FROM messages WHERE id = ?").run(id);
  })();
  audit(null, "admin_delete_message", id, clientIp(c));
  return c.json({ ok: true });
});

app.get("/admin/reads/:id", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  const rows = sqlite
    .query("SELECT ip, timestamp FROM reads WHERE id = ? ORDER BY timestamp DESC LIMIT 1000")
    .all(id) as Array<{ ip: string; timestamp: string }>;
  return c.json({ id, count: rows.length, reads: rows });
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
