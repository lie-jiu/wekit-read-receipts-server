/*
 * IP 定位（按需触发）：三免费接口自动降级，仅返回省市/运营商，不含经纬度。
 *
 * 实现思路与 ISP 中英映射表借鉴自 read-receipt-tracker
 * (https://github.com/gaigebeckmanChristinaJames/read-receipt-tracker)，
 * MIT License，Copyright (c) 2025 gaigebeckmanChristinaJames。
 * 本项目以 TypeScript 重新实现，沿用其协议约束：
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

import { GEO_CACHE_FAILURE_MS, GEO_CACHE_MAX, GEO_CACHE_SUCCESS_MS, GEO_TIMEOUT_MS } from "./config";

export type GeoInfo = {
  country: string;
  region: string;
  city: string;
  isp: string;
};

const ISP_CN: Record<string, string> = {
  "china mobile": "中国移动",
  "china mobile communications": "中国移动",
  "china unicom": "中国联通",
  "china unicom communications": "中国联通",
  "china telecom": "中国电信",
  "china telecom backbone": "中国电信",
  chinatelecom: "中国电信",
  "china broadband": "中国广电",
  "china education": "教育网",
  "dr peng telecom": "鹏博士",
  "great wall broadband": "长城宽带",
  "beijing telecom": "北京电信",
  "shanghai telecom": "上海电信",
  "shanghai mobile": "上海移动",
};

function cnIsp(isp: string): string {
  if (!isp) return "";
  const key = isp.trim().toLowerCase();
  return ISP_CN[key] ?? isp;
}

function isSkippable(ip: string): boolean {
  return (
    !ip ||
    ip === "unknown" ||
    ip === "0.0.0.0" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1"
  );
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { "User-Agent": "wekit-read-receipts-server/2.0" },
    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`geo provider ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

type Provider = (ip: string) => Promise<GeoInfo | null>;

const PROVIDERS: Provider[] = [
  async (ip) => {
    const d = await fetchJson(
      `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,message,country,regionName,city,isp`,
    );
    if (d.status !== "success") return null;
    return {
      country: String(d.country ?? ""),
      region: String(d.regionName ?? ""),
      city: String(d.city ?? ""),
      isp: cnIsp(String(d.isp ?? "")),
    };
  },
  async (ip) => {
    const d = await fetchJson(`https://ipwho.is/${ip}?lang=zh-CN`);
    if (!d.success) return null;
    const conn = (d.connection ?? {}) as Record<string, unknown>;
    return {
      country: String(d.country ?? ""),
      region: String(d.region ?? ""),
      city: String(d.city ?? ""),
      isp: cnIsp(String(conn.isp ?? "")),
    };
  },
  async (ip) => {
    const d = await fetchJson(`https://ipinfo.io/${ip}/json`);
    if (!d.country) return null;
    const org = String(d.org ?? "");
    return {
      country: String(d.country ?? ""),
      region: String(d.region ?? ""),
      city: String(d.city ?? ""),
      isp: cnIsp(org.split(" ").slice(1).join(" ")),
    };
  },
];

const cache = new Map<string, { info: GeoInfo | null; expiresAt: number }>();
const inFlight = new Map<string, Promise<GeoInfo | null>>();

function cacheGet(ip: string): GeoInfo | null | undefined {
  const e = cache.get(ip);
  if (!e) return undefined;
  if (e.expiresAt <= Date.now()) {
    cache.delete(ip);
    return undefined;
  }
  return e.info;
}

function cacheSet(ip: string, info: GeoInfo | null): void {
  cache.set(ip, {
    info,
    expiresAt: Date.now() + (info ? GEO_CACHE_SUCCESS_MS : GEO_CACHE_FAILURE_MS),
  });
  if (cache.size > GEO_CACHE_MAX) {
    const cutoff = Date.now();
    for (const [k, v] of cache) if (v.expiresAt < cutoff) cache.delete(k);
  }
}

/** 定位查询（含缓存与并发合并）。不可定位/全接口失败返回 null，绝不抛异常。 */
export async function lookupIpLocation(ip: string): Promise<GeoInfo | null> {
  if (isSkippable(ip)) return null;
  const cached = cacheGet(ip);
  if (cached !== undefined) return cached;
  const running = inFlight.get(ip);
  if (running) return running;

  const p = (async (): Promise<GeoInfo | null> => {
    for (const provider of PROVIDERS) {
      try {
        const info = await provider(ip);
        if (info) return info;
      } catch {
        /* 静默降级到下一接口 */
      }
    }
    return null;
  })()
    .then((info) => {
      cacheSet(ip, info);
      return info;
    })
    .finally(() => {
      inFlight.delete(ip);
    });

  inFlight.set(ip, p);
  return p;
}
