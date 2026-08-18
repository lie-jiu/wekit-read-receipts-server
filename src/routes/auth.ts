import { Hono } from "hono";
import { CSP, INVITE_CODE, loginDelayMs } from "../config";
import {
  audit,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  login,
  requireUser,
  verifyPassword,
} from "../auth";
import { sqlite } from "../db";
import { clientIp } from "../rate-limit";
import { isValidWxId, timingSafeEqual, utcNow } from "../utils";
import { parseBody } from "../http-helpers";
import { LOGIN_HTML } from "../pages";

/** 认证 / 用户（统一受 /auth/* 5/分 限流，由 app.ts 顶层中间件控制） */
export const authApp = new Hono();

authApp.get("/auth/status", (c) => c.json({ auth_required: true, invite_required: !!INVITE_CODE }));

authApp.post("/auth/register", async (c) => {
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
    .run(wxId, await hashPassword(password), utcNow());
  createSession(c, wxId);
  audit(wxId, "register", null, ip);
  return c.json({ ok: true });
});

authApp.post("/auth/verify", async (c) => {
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

authApp.post("/auth/logout", (c) => {
  const user = getSessionUser(c);
  destroySession(c);
  if (user) audit(user.wxId, "logout", null, clientIp(c));
  return c.json({ ok: true });
});

authApp.post("/auth/password", async (c) => {
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
  // 密码变更后失效该用户全部旧会话（含其它设备），防止已泄露旧会话继续有效
  sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(user.wxId);
  audit(user.wxId, "password_change", null, clientIp(c));
  return c.json({ ok: true });
});

authApp.get("/login", (c) => {
  if (getSessionUser(c)) return c.redirect("/");
  c.header("Content-Security-Policy", CSP.LOGIN);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(LOGIN_HTML);
});
