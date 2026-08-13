export const isProd = process.env.NODE_ENV === "production";

export const PORT = Number(process.env.PORT ?? 3000);
/** 监听地址：默认仅回环（反代/隧道同机场景）；公网直连或反代在其它机器时设 0.0.0.0 */
export const BIND_HOST = process.env.BIND_HOST ?? "127.0.0.1";
/** 内置 HTTPS：PEM 证书与私钥路径，两者同时设置才启用（公网直连免反代） */
export const TLS_CERT = process.env.TLS_CERT?.trim() || "";
export const TLS_KEY = process.env.TLS_KEY?.trim() || "";
export const DB_PATH = process.env.DB_PATH ?? (isProd ? "/var/lib/read-receipts.db" : "./data.db");

/** 逗号分隔的 wxid 列表，这些账号具备管理员权限（惰性读取，避免模块加载时 env 未就绪） */
export function isAdmin(wxId: string): boolean {
  return (process.env.ADMIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(wxId);
}

/** 可选邀请码；设置后新注册必须携带正确邀请码 */
export const INVITE_CODE = process.env.INVITE_CODE?.trim() || "";

/** 可信代理网段（逗号分隔 CIDR），配置后从 X-Forwarded-For 取真实 IP */
export const TRUSTED_PROXY: string[] = (process.env.TRUSTED_PROXY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 3600 * 1000;

/** 等级配额：level >= 100 时视为无上限（CHECK 约束限 0-99，故 99 为最高档） */
export function quotaFor(level: number): number {
  if (level <= 0) return 0;
  if (level === 1) return 20;
  if (level === 2) return 50;
  if (level === 3) return 100;
  if (level <= 5) return 250;
  if (level <= 8) return 500;
  return 1000;
}

/** 等级定位配额：按需 IP 定位（/reads/:id/geo）累计可用次数，随等级递增 */
export function geoQuotaFor(level: number): number {
  if (level <= 0) return 0;
  if (level === 1) return 50;
  if (level === 2) return 100;
  if (level === 3) return 200;
  if (level <= 5) return 500;
  if (level <= 8) return 1000;
  return 2000;
}

export const MAX_CONTENT_LENGTH = 10_000;
export const MAX_REGISTER_BATCH = 50;

/** 按需 IP 定位开关：0/off/false 关闭后隐藏定位按钮并拒绝 geo 端点 */
export const ENABLE_GEO = !["0", "off", "false", "no"].includes((process.env.ENABLE_GEO ?? "1").trim().toLowerCase());
/** 定位外呼超时（每个接口）与缓存 TTL：成功 24h / 失败 1h */
export const GEO_TIMEOUT_MS = 3000;
export const GEO_CACHE_SUCCESS_MS = 24 * 3600 * 1000;
export const GEO_CACHE_FAILURE_MS = 3600 * 1000;
export const GEO_CACHE_MAX = 10_000;

/** 限流档位：per-IP 固定窗口（毫秒） */
export const RATE_LIMITS = {
  pixel: { limit: 200, windowMs: 60_000, failOpen: true },
  count: { limit: 60, windowMs: 60_000, failOpen: true },
  register: { limit: 30, windowMs: 60_000, failOpen: true },
  auth: { limit: 5, windowMs: 60_000, failOpen: false },
  admin: { limit: 30, windowMs: 60_000, failOpen: false },
  geo: { limit: 30, windowMs: 60_000, failOpen: false },
} as const;

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export const CSP = {
  LOGIN: [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; "),
  DASHBOARD: [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; "),
};

/** 登录失败随机延迟 250-750ms，缓解枚举 */
export function loginDelayMs(): number {
  return 250 + Math.floor(Math.random() * 500);
}

/** 追踪像素响应：禁用一切缓存，防止代理/浏览器吞掉打点 */
export const PIXEL_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x00,
  0x00, 0x00, 0x05, 0x00, 0x01, 0x5c, 0x30, 0x8b,
  0x2d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);
