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

/** UTC 时间戳往前推 days 天，格式 `YYYY-MM-DD HH:MM:SS` */
export function utcDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** UTC 自然日往前推 days 天，格式 `YYYY-MM-DD`（与 registration_stats.date 同格式） */
export function utcDateDaysAgo(days: number): string {
  return utcDaysAgo(days).slice(0, 10);
}

/** UTC 时间往前推 months 个月（按公历月边界）；超大月数导致日期溢出时返回最早时间（视为不裁剪） */
export function utcMonthsAgo(months: number): string {
  const d = new Date(Date.now());
  d.setUTCMonth(d.getUTCMonth() - months);
  if (Number.isNaN(d.getTime())) return "0000-00-00 00:00:00";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/* ────────────── SHA-256（纯 TS 同步实现，跨运行时一致） ──────────────
 * 会话令牌哈希与消息 ID（computeId）要求同步哈希——WebCrypto 异步会把全部调用点变成 async，
 * 而 node:crypto / Bun.CryptoHasher 是运行时专属模块（Workers 构建不可用）。
 * 输入量级为几十字节，纯实现约 1µs/次，开销可忽略。
 * 正确性由 security.test.ts 对照标准测试向量与 Bun.CryptoHasher 双向验证。
 */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_HEX: string[] = [];
for (let i = 0; i < 256; i++) SHA256_HEX.push(i.toString(16).padStart(2, "0"));

function sha256Bytes(msg: Uint8Array): string {
  const len = msg.length;
  const total = (len + 9 + 63) & ~63; // 消息 + 0x80 + 8 字节长度域，补齐到 512 位块
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  const bitLen = len * 8;
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!, y = w[i - 2]!;
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  let hex = "";
  const odv = new DataView(new ArrayBuffer(32));
  odv.setUint32(0, h0); odv.setUint32(4, h1); odv.setUint32(8, h2); odv.setUint32(12, h3);
  odv.setUint32(16, h4); odv.setUint32(20, h5); odv.setUint32(24, h6); odv.setUint32(28, h7);
  const out = new Uint8Array(odv.buffer);
  for (let i = 0; i < 32; i++) hex += SHA256_HEX[out[i]!];
  return hex;
}

const UTF8 = new TextEncoder();

/**
 * SHA-256(wxId + 0x00 + content + 0x00 + String(createTime)) 小写 hex。
 * 与客户端算法严格一致：createTime 必须原样十进制字符串拼接，不得数值化丢失精度。
 */
export function computeId(wxId: string, content: string, createTime: string): string {
  return sha256Bytes(UTF8.encode(wxId + "\x00" + content + "\x00" + createTime));
}

/** 同步 SHA-256 hex（UTF-8 输入） */
export function sha256Hex(input: string): string {
  return sha256Bytes(UTF8.encode(input));
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
