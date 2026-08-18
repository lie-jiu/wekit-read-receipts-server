import { Hono } from "hono";
import { CSP, isAdmin } from "../config";
import { audit, hashPassword, requireAdmin } from "../auth";
import { sqlite } from "../db";
import { clientIp } from "../rate-limit";
import {
  LEVEL_ENV_KEYS,
  persistedLevelConfigs,
  previewValues,
  saveLevelFormulas,
  validateFormula,
} from "../levels";
import { escapeLike, isValidId, isValidWxId, utcNow } from "../utils";
import { adminOr, clampLimit, readRow, type ReadRow } from "../http-helpers";
import { adminPage } from "../pages";

/** 管理后台（统一受 /admin/* 30/分 限流，仅 ADMIN 列表内账号；中间件由 app.ts 顶层控制） */
export const adminApp = new Hono();

const LEVEL_DIMS = ["message", "geo", "retentionMonths"] as const;

function levelConfigJson(): Record<string, unknown> {
  const cfg = persistedLevelConfigs();
  const out: Record<string, unknown> = {};
  for (const dim of LEVEL_DIMS) {
    out[dim] = { formula: cfg[dim].formula, source: cfg[dim].source, values: cfg[dim].values.slice(1, 21) };
  }
  return out;
}

adminApp.get("/admin", (c) => {
  const user = requireAdmin(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(adminPage({ wxId: user.wxId }));
});

adminApp.get("/admin/users", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;

  // 分页参数
  const pageSize = clampLimit(Number(c.req.query("pageSize") ?? 20), 1, 100);
  const page = Math.max(Math.floor(Number(c.req.query("page") ?? 1)) || 1, 1);
  const offset = (page - 1) * pageSize;

  // 按微信 ID 模糊搜索（支持精确匹配后回退）
  const q = (c.req.query("q") ?? "").trim();
  const where = q ? "WHERE u.wx_id LIKE ? ESCAPE '\\'" : "";
  const likeParams = q ? [`%${escapeLike(q)}%`] : [];

  const totalRow = sqlite
    .query(`SELECT COUNT(*) AS n FROM users u ${where}`)
    .get(...likeParams) as { n: number };
  const total = totalRow.n;

  const rows = sqlite
    .query(
      `SELECT u.wx_id AS wxId, u.level, u.created_at AS createdAt, u.message_count AS messageCount,
              (SELECT MAX(timestamp) FROM messages WHERE wx_id = u.wx_id) AS lastMsgAt,
              (SELECT COALESCE(SUM(count), 0) FROM registration_stats WHERE wx_id = u.wx_id) AS totalRegMsgs
       FROM users u ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...likeParams, pageSize, offset) as Array<{
    wxId: string;
    level: number;
    createdAt: string;
    messageCount: number;
    lastMsgAt: string | null;
    totalRegMsgs: number;
  }>;

  return c.json({ rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

adminApp.post("/admin/users", async (c) => {
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
    .run(wxId, await hashPassword(password), level, utcNow());
  audit(wxId, "admin_create_user", null, clientIp(c));
  return c.json({ ok: true });
});

adminApp.post("/admin/level", async (c) => {
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
  sqlite.query("UPDATE users SET level = ? WHERE wx_id = ?").run(level, wxId);
  audit(wxId, "admin_set_level", String(level), clientIp(c));
  return c.json({ ok: true });
});

adminApp.post("/admin/password", async (c) => {
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
  // 重置密码后失效该用户全部会话（与 manage user pass 行为一致）
  sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
  audit(wxId, "admin_set_password", null, clientIp(c));
  return c.json({ ok: true });
});

adminApp.delete("/admin/users/:wxId", (c) => {
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

adminApp.get("/admin/messages", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const q = (c.req.query("q") ?? "").trim();
  const fwx = (c.req.query("wxId") ?? "").trim();
  // 分页参数：pageSize 优先，兼容旧的 limit 参数（用户详情"查看最新消息"仍传 limit=5）
  const pageSize = clampLimit(Number(c.req.query("pageSize") ?? c.req.query("limit") ?? 20), 1, 100);
  const page = Math.max(Math.floor(Number(c.req.query("page") ?? 1)) || 1, 1);
  const offset = (page - 1) * pageSize;
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
  const totalRow = sqlite
    .query(`SELECT COUNT(*) AS n FROM messages m ${where}`)
    .get(...params) as { n: number };
  const total = totalRow.n;
  const rows = sqlite
    .query(
      `SELECT m.id, m.wx_id AS wxId, m.content, m.timestamp,
              (SELECT COUNT(DISTINCT r.ip) FROM reads r WHERE r.id = m.id) AS reads
       FROM messages m ${where} ORDER BY m.timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as Array<{ id: string; wxId: string; content: string; timestamp: string; reads: number }>;
  return c.json({ rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

adminApp.delete("/admin/messages", (c) => {
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
    // 全库删除为不可逆高危操作：要求显式二次确认，防止误触 / CSRF / 被劫持会话一键清库
    if ((c.req.query("confirm") ?? "") !== "DELETE ALL") {
      return c.json({ error: "confirm=DELETE ALL required to wipe all messages" }, 400);
    }
    sqlite.transaction(() => {
      sqlite.query("DELETE FROM reads").run();
      sqlite.query("DELETE FROM messages").run();
    })();
    audit(null, "admin_delete_all_messages", null, clientIp(c));
  }
  return c.json({ ok: true });
});

adminApp.delete("/admin/messages/:id", (c) => {
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

/* ---- 等级权益设置（公式存于 .env，重启后生效） ---- */

adminApp.get("/admin/levels", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  return c.json(levelConfigJson());
});

adminApp.get("/admin/levels/preview", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const formula = (c.req.query("formula") ?? "").trim();
  if (!formula) return c.json({ valid: false, error: "formula required" });
  const error = validateFormula(formula);
  if (error) return c.json({ valid: false, error });
  return c.json({ valid: true, values: previewValues(formula) });
});

adminApp.post("/admin/levels", async (c) => {
  const user = requireAdmin(c);
  if (!user) return c.json({ error: "forbidden" }, 403);
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const updates: Record<string, string> = {};
  let changed = false;
  for (const dim of LEVEL_DIMS) {
    const raw = body[dim];
    if (raw === undefined) continue;
    if (typeof raw !== "string") return c.json({ error: "invalid payload" }, 400);
    const formula = raw.trim();
    if (formula.length > 200) return c.json({ error: "formula too long" }, 400);
    if (formula === "") {
      updates[LEVEL_ENV_KEYS[dim]] = "";
      changed = true;
      continue;
    }
    const error = validateFormula(formula);
    if (error) return c.json({ error: `公式无效：${error}` }, 400);
    updates[LEVEL_ENV_KEYS[dim]] = formula;
    changed = true;
  }
  if (!changed) return c.json({ error: "nothing to save" }, 400);
  saveLevelFormulas(updates);
  audit(
    user.wxId,
    "admin_set_level_formula",
    Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(" "),
    clientIp(c),
  );
  return c.json({ ok: true, restart: true });
});

adminApp.get("/admin/reads/:id", (c) => {
  const denied = adminOr(c);
  if (denied) return denied;
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  const rows = sqlite
    .query(
      "SELECT ip, timestamp, user_agent, country, region, city, isp, country_en, region_en, city_en, isp_en FROM reads WHERE id = ? ORDER BY timestamp DESC LIMIT 1000",
    )
    .all(id) as ReadRow[];
  return c.json({ id, count: rows.length, reads: rows.map(readRow) });
});
