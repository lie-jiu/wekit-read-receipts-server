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

/**
 * 新哈希参数：PBKDF2-HMAC-SHA256，输出格式 pbkdf2$iter$salt_hex$hash_hex。
 * 这是本项目跨运行时的唯一哈希格式（Bun 与 Cloudflare Workers 共用同一 WebCrypto 实现），
 * iter 内联在格式中可随时间提升而无需改格式；算法与输出长度是该格式的隐式常量，不可单独变更。
 *
 * Workers 免费档单请求 CPU 上限 10ms，PBKDF2 验证约为每次迭代 ~0.3µs CPU，
 * 默认 100k 迭代约需 30-50ms，付费档（30s CPU）无压力；免费档部署应设 PBKDF2_ITERATIONS=20000。
 */
const rawPbkdf2Iter = Number(process.env.PBKDF2_ITERATIONS ?? 100_000);
export const PBKDF2_ITERATIONS = Number.isFinite(rawPbkdf2Iter)
  ? Math.min(PBKDF2_MAX_ITER, Math.max(1000, rawPbkdf2Iter))
  : 100_000;
export const PBKDF2_SALT_BYTES = 16;
export const PBKDF2_KEY_LEN = 32;

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
 * 请求体上限（字节），传给 Bun.serve 的 maxRequestBodySize。
 *
 * /pixel、/count、/register 都是无鉴权公开端点；不设上限时 Bun 会先把请求体完整读进内存
 * 再交给业务校验，可被用于内存/CPU 放大（实测向 /register POST 20MB 会被完整读入并 JSON.parse）。
 * 上限按 /register 的最大合法载荷推导：50 条 × 2048 字符，UTF-8 极端约 300 KB，故取 512 KB。
 */
const rawMaxBody = Number(process.env.MAX_BODY_BYTES ?? 512 * 1024);
export const MAX_BODY_BYTES = Number.isFinite(rawMaxBody) && rawMaxBody > 0 ? rawMaxBody : 512 * 1024;

/** 优雅关闭等待在途请求的上限（毫秒），超时后强制断开剩余连接 */
const rawShutdownMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);
export const SHUTDOWN_TIMEOUT_MS = Number.isFinite(rawShutdownMs) && rawShutdownMs >= 0 ? rawShutdownMs : 10_000;

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
};

/**
 * HSTS 仅在确认是 HTTPS 请求时下发（见 app.ts）。
 *
 * 若在裸 HTTP 响应里也带上它，浏览器会把该主机锁定为「一年内强制 HTTPS」，
 * 之后即使服务本来就是 HTTP 部署（形态 B 裸 HTTP、局域网测试），
 * 也会被浏览器强制跳转到 https 而彻底打不开，且用户侧极难排查。
 */
export const HSTS_HEADER = { "Strict-Transport-Security": "max-age=31536000" } as const;

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
