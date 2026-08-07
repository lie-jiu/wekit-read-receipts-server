import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ADMINS, SESSION_COOKIE_NAME, SESSION_TTL_DAYS, SESSION_TTL_MS, isProd } from "./config";
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

export function createSession(c: Context, wxId: string): void {
  const token = randomToken();
  sqlite
    .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256HexSync(token), wxId, chinaNow(), chinaNowPlus(SESSION_TTL_DAYS));
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function destroySession(c: Context): void {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    sqlite.query("DELETE FROM sessions WHERE token_hash = ?").run(sha256HexSync(token));
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

export function getSessionUser(c: Context): SessionUser | null {
  const token = getCookie(c, SESSION_COOKIE_NAME);
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
    isAdmin: ADMINS.has(row.wx_id),
  };
}

export function requireUser(c: Context): SessionUser | null {
  return getSessionUser(c);
}

export function requireAdmin(c: Context): SessionUser | null {
  const user = getSessionUser(c);
  return user && user.isAdmin ? user : null;
}
