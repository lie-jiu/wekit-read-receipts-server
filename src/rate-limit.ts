import type { Context, Next } from "hono";
import { RATE_LIMITS, TRUSTED_PROXY } from "./config";

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

/** 直连方地址（Bun server.requestIP + ::ffff: 归一化），不信任任何代理头 */
export function peerIp(c: Context): string {
  const env = c.env as { requestIP?: (req: Request) => { address: string } | null };
  return normalizeIp(env.requestIP?.(c.req.raw)?.address ?? "unknown");
}

export function clientIp(c: Context): string {
  if (ipResolver) {
    const ip = ipResolver(c);
    if (ip) return ip;
  }
  const peer = peerIp(c);
  if (TRUSTED_PROXY.length === 0) return peer;
  if (!TRUSTED_PROXY.some((cidr) => ipInCidr(peer, cidr))) return peer;
  // 受信代理后：Cloudflare 覆盖写 CF-Connecting-IP（客户端不可伪造），优先于 X-Forwarded-For
  const cf = c.req.header("cf-connecting-ip");
  if (cf) {
    const ip = normalizeIp(cf.trim());
    if (ip) return ip;
  }
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = normalizeIp(xff.split(",")[0]?.trim() ?? "");
    if (first) return first;
  }
  return peer;
}

/** 计数并判断是否超限。fail-open 档位超限仍返回 true（由路由决定降级响应） */
export function overLimit(bucket: Bucket, ip: string): boolean {
  const cfg = RATE_LIMITS[bucket];
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start >= cfg.windowMs) {
    w = { start: now, count: 0 };
    windows.set(key, w);
  }
  w.count++;
  if (windows.size > 10_000) {
    const cutoff = now - cfg.windowMs;
    for (const [k, v] of windows) if (v.start < cutoff) windows.delete(k);
  }
  return w.count > cfg.limit;
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
