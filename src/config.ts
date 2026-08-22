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

/** PBKDF2 迭代次数上限：拒绝被污染/恶意构造的哈希（超大 iter 会同步阻塞事件循环） */
export const PBKDF2_MAX_ITER = Number(process.env.PBKDF2_MAX_ITER ?? 1_000_000);

/** 审计日志保留天数（0 = 不清理，长期留存） */
export const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 30);

/** 等级权益：消息保留条数 / IP 定位次数 / 保留时长(月)，由公式配置（见 src/levels.ts） */
export { quotaFor, geoQuotaFor, retentionMonthsFor } from "./levels";

/**
 * 微信单条消息输入框上限约 2000 字符（PC 端 2048 字），真实客户端不可能产生更长载荷；
 * DB 层 CHECK(length(content)<=10000) 保持不动，此处仅拦截伪造的超长请求体。
 */
export const MAX_CONTENT_LENGTH = 2_048;
export const MAX_REGISTER_BATCH = 50;

/**
 * /register 为未授权端点（客户端协议不可变），按 wxId 限流缓解批量伪造消息。
 * 正常客户端逐条 POST、量小，不会触及；定向慢速注入无法完全阻断（协议无鉴权的固有缺陷）。
 */
export const REGISTER_PER_WXID_PER_MIN = Number(process.env.REGISTER_PER_WXID_PER_MIN ?? 30);
export const REGISTER_PER_WXID_PER_DAY = Number(process.env.REGISTER_PER_WXID_PER_DAY ?? 500);

/** 按需 IP 定位开关：0/off/false 关闭后隐藏定位按钮并拒绝 geo 端点 */
export const ENABLE_GEO = !["0", "off", "false", "no"].includes((process.env.ENABLE_GEO ?? "1").trim().toLowerCase());
/** 是否允许明文本地化接口（ip-api.com 仅 HTTP）；默认关闭，中文源缺失时由英文兜底 */
export const GEO_ALLOW_HTTP = !["0", "off", "false", "no"].includes((process.env.GEO_ALLOW_HTTP ?? "0").trim().toLowerCase());
/** 定位外呼超时（每个接口）与缓存 TTL：成功 24h / 失败 1h */
export const GEO_TIMEOUT_MS = 3000;
export const GEO_CACHE_SUCCESS_MS = 24 * 3600 * 1000;
export const GEO_CACHE_FAILURE_MS = 3600 * 1000;
export const GEO_CACHE_MAX = 10_000;

/** 限流档位：per-IP 固定窗口（毫秒）。超限行为由各路由决定（429 或降级） */
export const RATE_LIMITS = {
  pixel: { limit: 200, windowMs: 60_000 },
  count: { limit: 60, windowMs: 60_000 },
  register: { limit: 30, windowMs: 60_000 },
  auth: { limit: 5, windowMs: 60_000 },
  admin: { limit: 30, windowMs: 60_000 },
  geo: { limit: 30, windowMs: 60_000 },
} as const;

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000",
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
