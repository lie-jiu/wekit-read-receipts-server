export type JsonObject = Record<string, unknown>;

/** UTC 时间，格式 `YYYY-MM-DD HH:MM:SS`（数据库统一时间标准） */
let _utcNowCache: { sec: number; s: string } | null = null;

export function utcNow(): string {
  const ms = Date.now();
  const sec = Math.floor(ms / 1000);
  if (_utcNowCache && _utcNowCache.sec === sec) return _utcNowCache.s;
  const s = new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  _utcNowCache = { sec, s };
  return s;
}

/** 取 UTC 自然日 `YYYY-MM-DD` */
export function utcDate(): string {
  return utcNow().slice(0, 10);
}

/** UTC 时间往前推 months 个月（按公历月边界）；超大月数导致日期溢出时返回最早时间（视为不裁剪） */
export function utcMonthsAgo(months: number): string {
  const d = new Date(Date.now());
  d.setUTCMonth(d.getUTCMonth() - months);
  if (Number.isNaN(d.getTime())) return "0000-00-00 00:00:00";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * SHA-256(wxId + 0x00 + content + 0x00 + String(createTime)) 小写 hex。
 * 与客户端算法严格一致：createTime 必须原样十进制字符串拼接，不得数值化丢失精度。
 * 使用 Bun.CryptoHasher 同步实现，避免 WebCrypto 异步开销。
 */
export function computeId(wxId: string, content: string, createTime: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(wxId)
    .update(new Uint8Array([0]))
    .update(content)
    .update(new Uint8Array([0]))
    .update(createTime)
    .digest("hex");
}

/** 同步 SHA-256 hex（Bun 内置哈希） */
export function sha256Hex(input: string): string {
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

/**
 * 内联 <script> 安全序列化：JSON.stringify 不转义 `</script>`、`<!--`、U+2028/U+2029，
 * 攻击者可控字符串拼入内联脚本时可逃逸出字符串字面量。将 `<`/`>`/`&` 转义为 JS 等价
 * Unicode 序列（\u003c/\u003e/\u0026），在 JS 字符串内语义不变，但可阻断 HTML 解析层面的逃逸。
 */
export function safeJson(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
