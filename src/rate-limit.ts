import type { Context, Next } from "hono";
import {
  RATE_LIMITS,
  REGISTER_PER_WXID_PER_DAY,
  REGISTER_PER_WXID_PER_MIN,
  TRUSTED_PROXY,
} from "./config";

export type Bucket = keyof typeof RATE_LIMITS;

/** 进程内固定窗口：bucket + ip → {窗口起点, 计数} */
const windows = new Map<string, { start: number; count: number }>();

export function ipInCidr(ip: string, cidr: string): boolean {
  const [net, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  if (!net || !Number.isInteger(prefix)) return false;
  const toBytes = (s: string): number[] | null => {
    if (s.includes(".")) {
      const parts = s.split(".").map(Number);
      return parts.length === 4 && parts.every((p) => p >= 0 && p <= 255) ? parts : null;
    }
    if (s.includes(":")) {
      const full = s.toLowerCase();
      const head = full.includes("::") ? full.replace("::", ":".repeat(Math.max(1, 9 - full.split(":").length))) : full;
      const parts = head.split(":").filter(Boolean);
      const bytes: number[] = [];
      for (const p of parts) {
        if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
        bytes.push(parseInt(p.slice(0, 2), 16), parseInt(p.slice(2) || "0", 16));
      }
      return bytes;
    }
    return null;
  };
  const a = toBytes(ip);
  const b = toBytes(net);
  if (!a || !b || a.length !== b.length) return false;
      const bits = a.length * 8;
      const p = Math.min(prefix, bits);
      for (let i = 0; i < p; i++) {
        const ab = a[i >> 3];
        const bb = b[i >> 3];
        if (ab === undefined || bb === undefined) return false;
        if (((ab >> (7 - (i & 7))) & 1) !== ((bb >> (7 - (i & 7))) & 1)) return false;
      }
      return true;
}

type IpResolver = (c: Context) => string | null;
let ipResolver: IpResolver | null = null;

/** 测试钩子：注入自定义 IP 解析（默认走 Bun server.requestIP + TRUSTED_PROXY） */
export function setIpResolver(fn: IpResolver | null): void {
  ipResolver = fn;
}

/** 去掉 IPv4-mapped IPv6 前缀：::ffff:a.b.c.d → a.b.c.d */
function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/** IPv4/IPv6 格式校验（宽松）：阻断 XFF 注入任意字符串进入限流 key / 审计 IP / reads.ip */
export function isValidIp(ip: string): boolean {
  if (!ip) return false;
  if (ip.includes(".")) {
    const p = ip.split(".");
    return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
  }
  if (ip.includes(":")) {
    const segs = ip.split(":").filter(Boolean);
    return segs.length > 0 && segs.every((x) => /^[0-9a-fA-F]{1,4}$/.test(x));
  }
  return false;
}

/** 从 X-Forwarded-For 解析真实客户端 IP（受信代理场景）：从右往左取第一个不在 trusted 网段的值 */
export function resolveXffIp(xff: string, trusted: string[]): string | null {
  const parts = xff
    .split(",")
    .map((s) => normalizeIp(s.trim()))
    .filter((s) => s && isValidIp(s));
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = parts[i]!;
    if (!trusted.some((cidr) => ipInCidr(ip, cidr))) return ip;
  }
  return parts.length > 0 ? parts[parts.length - 1]! : null;
}

/** 直连方地址（Bun server.requestIP + ::ffff: 归一化），不信任任何代理头 */
export function peerIp(c: Context): string {
  const env = c.env as { requestIP?: (req: Request) => { address: string } | null };
  return normalizeIp(env.requestIP?.(c.req.raw)?.address ?? "unknown");
}

export function clientIp(c: Context): string {
  if (ipResolver) {
    const ip = ipResolver(c);
    if (ip && isValidIp(ip)) return ip;
  }
  const peer = peerIp(c);
  if (TRUSTED_PROXY.length === 0) return peer;
  if (!TRUSTED_PROXY.some((cidr) => ipInCidr(peer, cidr))) return peer;
  // 受信代理后：Cloudflare 覆盖写 CF-Connecting-IP（客户端不可伪造），优先于 X-Forwarded-For
  const cf = c.req.header("cf-connecting-ip");
  if (cf) {
    const ip = normalizeIp(cf.trim());
    if (ip && isValidIp(ip)) return ip;
  }
  // X-Forwarded-For：从右往左取第一个「不在」受信代理网段内的值，
  // 防止反代处于追加模式（nginx $proxy_add_x_forwarded_for）时客户端伪造首值绕过限流。
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const resolved = resolveXffIp(xff, TRUSTED_PROXY);
    if (resolved) return resolved;
  }
  return peer;
}

/** 固定窗口计数并判断是否超限（超过 limit 返回 true）。windows Map 超过阈值时清理过期项。 */
function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    w = { start: now, count: 0 };
    windows.set(key, w);
  }
  w.count++;
  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
  }
  return w.count > limit;
}

/** 计数并判断是否超限。fail-open 档位超限仍返回 true（由路由决定降级响应） */
export function overLimit(bucket: Bucket, ip: string): boolean {
  const cfg = RATE_LIMITS[bucket];
  return hit(`${bucket}:${ip}`, cfg.limit, cfg.windowMs);
}

/** 公开 /register 端点按 wxId 限流：分钟 + 天双窗口（缓解未授权批量伪造消息） */
export function overLimitWxId(wxId: string): boolean {
  const minOver = hit(`regWxMin:${wxId}`, REGISTER_PER_WXID_PER_MIN, 60_000);
  const dayOver = hit(`regWxDay:${wxId}`, REGISTER_PER_WXID_PER_DAY, 24 * 3600 * 1000);
  return minOver || dayOver;
}

/** fail-closed 档位的中间件（auth / admin） */
export function rateLimit(bucket: Bucket) {
  return async (c: Context, next: Next) => {
    if (overLimit(bucket, clientIp(c))) {
      return c.json({ error: "rate limited" }, 429);
    }
    await next();
  };
}
