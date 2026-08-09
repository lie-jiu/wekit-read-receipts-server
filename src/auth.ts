import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isAdmin, SESSION_TTL_DAYS, SESSION_TTL_MS, TRUSTED_PROXY } from "./config";
import { ipInCidr, peerIp } from "./rate-limit";
import { sqlite } from "./db";
import { chinaNow, sha256HexSync } from "./utils";

export type SessionUser = {
  wxId: string;
  level: number;
  messageCount: number;
  isAdmin: boolean;
};

function chinaNowPlus(days: number): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "sess_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function audit(wxId: string | null, action: string, detail: string | null, ip: string | null): void {
  sqlite
    .query("INSERT INTO audit_logs (wx_id, action, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?)")
    .run(wxId, action, detail, ip, chinaNow());
}

export async function login(wxId: string, password: string): Promise<boolean> {
  const row = sqlite
    .query("SELECT password_hash, level FROM users WHERE wx_id = ?")
    .get(wxId) as { password_hash: string; level: number } | undefined;
  if (!row) return false;
  if (row.level <= 0) return false;
  return await Bun.password.verify(password, row.password_hash);
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

/** 请求是否走 TLS：直连 HTTPS，或经受信代理转发（X-Forwarded-Proto） */
function isSecureRequest(c: Context): boolean {
  try {
    if (new URL(c.req.url).protocol === "https:") return true;
  } catch {
    /* fallthrough */
  }
  if (TRUSTED_PROXY.length === 0) return false;
  const peer = peerIp(c);
  if (peer === "unknown" || !TRUSTED_PROXY.some((cidr) => ipInCidr(peer, cidr))) return false;
  return c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

/**
 * 会话 cookie 随实际协议自适应：
 * - HTTPS（含 TLS 反代）→ `__Host-session` + Secure
 * - HTTP 直连（局域网/测试）→ `session` 不带 Secure，否则浏览器不存 cookie 无法登录
 */
function sessionCookie(c: Context): { name: string; secure: boolean } {
  return isSecureRequest(c)
    ? { name: "__Host-session", secure: true }
    : { name: "session", secure: false };
}

export function createSession(c: Context, wxId: string): void {
  const token = randomToken();
  sqlite
    .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256HexSync(token), wxId, chinaNow(), chinaNowPlus(SESSION_TTL_DAYS));
  const { name, secure } = sessionCookie(c);
  setCookie(c, name, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function destroySession(c: Context): void {
  const { name } = sessionCookie(c);
  const token = getCookie(c, name);
  if (token) {
    sqlite.query("DELETE FROM sessions WHERE token_hash = ?").run(sha256HexSync(token));
  }
  deleteCookie(c, name, { path: "/" });
}

export function getSessionUser(c: Context): SessionUser | null {
  const token = getCookie(c, sessionCookie(c).name);
  if (!token) return null;
  const row = sqlite
    .query(
      `SELECT u.wx_id, u.level, u.message_count
       FROM sessions s JOIN users u ON u.wx_id = s.wx_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256HexSync(token), chinaNow()) as { wx_id: string; level: number; message_count: number } | undefined;
  if (!row) return null;
  return {
    wxId: row.wx_id,
    level: row.level,
    messageCount: row.message_count,
    isAdmin: isAdmin(row.wx_id),
  };
}

export function requireUser(c: Context): SessionUser | null {
  return getSessionUser(c);
}

export function requireAdmin(c: Context): SessionUser | null {
  const user = getSessionUser(c);
  return user && user.isAdmin ? user : null;
}
