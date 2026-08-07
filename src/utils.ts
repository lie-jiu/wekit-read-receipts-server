import { sha256 } from "hono/utils/crypto";

export type JsonObject = Record<string, unknown>;

/** UTC+8 中国时间，格式 `YYYY-MM-DD HH:MM:SS`（数据库统一时间标准） */
export function chinaNow(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** 取 UTC+8 自然日 `YYYY-MM-DD` */
export function chinaDate(): string {
  return chinaNow().slice(0, 10);
}

/**
 * SHA-256(wxId + 0x00 + content + 0x00 + String(createTime)) 小写 hex。
 * 与客户端算法严格一致：createTime 必须原样十进制字符串拼接，不得数值化丢失精度。
 */
export async function computeId(wxId: string, content: string, createTime: string): Promise<string> {
  const md = await sha256(wxId + "\0" + content + "\0" + createTime);
  return md;
}

export function sha256Hex(input: string): Promise<string> {
  return sha256(input);
}

/** 同步 SHA-256 hex（Bun 内置哈希，用于会话 token 等同步路径） */
export function sha256HexSync(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

/** 恒定时长比较，防时序侧信道 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isValidId(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id);
}

export function isValidWxId(wxId: string): boolean {
  return typeof wxId === "string" && wxId.length >= 1 && wxId.length <= 64 && /^[\x20-\x7e]+$/.test(wxId);
}

/** LIKE 通配符转义 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

/** wxid 脱敏：wxid_abcd1234 → wxid_ab…34 */
export function maskWxId(wxId: string): string {
  if (wxId.length <= 8) return wxId.slice(0, 2) + "…" + wxId.slice(-2);
  return wxId.slice(0, 6) + "…" + wxId.slice(-2);
}

/** 内容脱敏（与 CF 版一致）：≥5 字只留前后各 2 字，中间星号；不足 5 字全文 */
export function maskContent(content: string): string {
  const s = String(content ?? "");
  if (s.length < 5) return s;
  return s.slice(0, 2) + "***" + s.slice(-2);
}

/** 时间展示：`YYYY-MM-DD HH:MM:SS` 已是 UTC+8，直接截取分钟 */
export function formatTime(t: string): string {
  return t.length >= 16 ? t.slice(0, 16) : t;
}

export function maskIp(ip: string): string {
  return ip.replace(/:\d+$/, ":*").replace(/(\.\d+)$/, ".*");
}
