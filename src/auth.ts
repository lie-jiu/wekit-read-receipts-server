import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  isAdmin,
  PBKDF2_ITERATIONS,
  PBKDF2_KEY_LEN,
  PBKDF2_MAX_ITER,
  PBKDF2_SALT_BYTES,
  SESSION_TTL_DAYS,
  SESSION_TTL_MS,
  TRUSTED_PROXY,
} from "./config";
import { ipInCidr, peerIp } from "./rate-limit";
import { sqlite } from "./db";
import { timingSafeEqual, sha256Hex, utcNow } from "./utils";

export type SessionUser = {
  wxId: string;
  level: number;
  messageCount: number;
  geoCount: number;
  /** 当日日期 YYYY-MM-DD（UTC）：geo_count 的归属自然日，空串表示历史累计库未初始化 */
  geoDate: string;
  isAdmin: boolean;
};

function utcNowPlus(days: number): string {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "sess_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function audit(wxId: string | null, action: string, detail: string | null, ip: string | null): void {
  sqlite
    .query("INSERT INTO audit_logs (wx_id, action, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?)")
    .run(wxId, action, detail, ip, utcNow());
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** PBKDF2-HMAC-SHA256 派生（WebCrypto）：Bun 与 Workers 行为逐位一致 */
async function pbkdf2Hex(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, PBKDF2_KEY_LEN * 8),
  );
  return bytesToHex(bits);
}

/**
 * 密码验证。本项目的规范哈希格式为 pbkdf2$iter$salt_hex$hash_hex
 * （PBKDF2-HMAC-SHA256 / 32 字节输出，双运行时统一，见 config.ts PBKDF2_ITERATIONS）；
 * 兼容分支：argon2id/bcrypt 哈希仅在 Bun 运行时可验证（Bun.password，Workers 上没有），未知格式返回 false。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("pbkdf2$")) {
    const [prefix, iterStr, saltHex, expected] = stored.split("$");
    const iterations = Number(iterStr);
    if (prefix !== "pbkdf2" || !iterStr || !saltHex || !expected) return false;
    if (
      !Number.isInteger(iterations) ||
      iterations < 1000 ||
      iterations > PBKDF2_MAX_ITER ||
      !/^[0-9a-f]+$/i.test(saltHex) ||
      !/^[0-9a-f]+$/i.test(expected)
    ) {
      if (Number.isInteger(iterations) && iterations > PBKDF2_MAX_ITER) {
        console.error(`[auth] PBKDF2 迭代次数 ${iterations} 超出上限 ${PBKDF2_MAX_ITER}，拒绝验证`);
      }
      return false;
    }
    const derived = await pbkdf2Hex(password, hexToBytes(saltHex), iterations);
    return timingSafeEqual(derived, expected.toLowerCase());
  }
  /* argon2id/bcrypt 兼容分支：Bun 运行时专属能力。经 globalThis 探测而非直接引用 Bun 全局，
   * 使本文件可同时通过 Workers 类型环境（那里没有 Bun 类型）——Workers 上安全返回 false。 */
  const bun = (globalThis as { Bun?: { password?: { verify(password: string, hash: string): Promise<boolean> } } })
    .Bun;
  if (bun?.password) {
    try {
      return await bun.password.verify(password, stored);
    } catch {
      return false;
    }
  }
  return false;
}

export async function login(wxId: string, password: string): Promise<boolean> {
  const row = sqlite
    .query("SELECT password_hash, level FROM users WHERE wx_id = ?")
    .get(wxId) as { password_hash: string; level: number } | undefined;
  if (!row) return false;
  if (!(await verifyPassword(password, row.password_hash))) return false;
  /* 存量 argon2id 哈希透明升级为 pbkdf2$（双运行时可验证）：升级仅发生在升级前的一次登录，
   * 失败（如只读库）不影响本次登录结果。 */
  if (!row.password_hash.startsWith("pbkdf2$")) {
    try {
      sqlite
        .query("UPDATE users SET password_hash = ? WHERE wx_id = ?")
        .run(await hashPassword(password), wxId);
    } catch (e) {
      console.error("[auth] 密码哈希升级失败（不影响本次登录）:", e);
    }
  }
  return true;
}

/** 新哈希统一为 pbkdf2$ 格式：WebCrypto 实现，Bun / Workers 产出逐位一致 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${hash}`;
}

/** 请求是否走 TLS：直连 HTTPS，或经受信代理转发（X-Forwarded-Proto） */
export function isSecureRequest(c: Context): boolean {
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
    .run(sha256Hex(token), wxId, utcNow(), utcNowPlus(SESSION_TTL_DAYS));
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
    sqlite.query("DELETE FROM sessions WHERE token_hash = ?").run(sha256Hex(token));
  }
  deleteCookie(c, name, { path: "/" });
}

export function getSessionUser(c: Context): SessionUser | null {
  const token = getCookie(c, sessionCookie(c).name);
  if (!token) return null;
  const row = sqlite
    .query(
      `SELECT u.wx_id, u.level, u.message_count, u.geo_count, u.geo_date
       FROM sessions s JOIN users u ON u.wx_id = s.wx_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256Hex(token), utcNow()) as { wx_id: string; level: number; message_count: number; geo_count: number; geo_date: string } | undefined;
  if (!row) return null;
  return {
    wxId: row.wx_id,
    level: row.level,
    messageCount: row.message_count,
    geoCount: row.geo_count,
    geoDate: row.geo_date,
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
