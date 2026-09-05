/*
 * IP 定位（按需触发）：免费接口自动降级，仅返回省市/运营商，不含经纬度。
 *
 * 定位结果双语存储（zh/en），供前端 i18n 切换展示：
 *   - zh：ip-api(?lang=zh-CN) → ipwho.is(?lang=zh-CN)
 *   - en：ipwho.is(默认 en) → ipinfo.io(en)
 * 两路并发查询，各接口失败逐级降级；单语言缺失时用另一语言兜底，保证不丢数据。
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

import { GEO_ALLOW_HTTP, GEO_CACHE_FAILURE_MS, GEO_CACHE_MAX, GEO_CACHE_SUCCESS_MS, GEO_TIMEOUT_MS } from "./config";

export type GeoInfo = {
  country: string;
  region: string;
  city: string;
  isp: string;
};

/** 双语定位结果：zh/en 各一组，语言缺失时以另一语言填充。 */
export type GeoResult = { zh: GeoInfo; en: GeoInfo } | null;

const HAS_CJK = /[\u4e00-\u9fff]/;

/** 运营商双语短名分类。命中返回 {cn, en} 短名；未命中 cn 留空、en 保留原始描述 */
export function classifyIsp(isp: string): { cn: string; en: string } {
  if (!isp) return { cn: "", en: "" };
  const s = " " + isp.trim().toLowerCase().replace(/[^a-z0-9]/g, " ") + " ";
  const has = (re: RegExp) => re.test(s);
  if (has(/cmnet|cmcc|china mobile/)) return { cn: "中国移动", en: "China Mobile" };
  if (has(/china unicom|unicom|china169|cnc group|netcom/)) return { cn: "中国联通", en: "China Unicom" };
  if (has(/china telecom|chinatelecom/)) return { cn: "中国电信", en: "China Telecom" };
  if (has(/china broadband|broadnet|中国广电/)) return { cn: "中国广电", en: "China Broadnet" };
  if (has(/china education|ceret|cernet/)) return { cn: "教育网", en: "CERNET" };
  if (has(/dr peng|bocl/)) return { cn: "鹏博士", en: "Dr. Peng" };
  if (has(/great wall|gwbn/)) return { cn: "长城宽带", en: "Great Wall Broadband" };
  if (HAS_CJK.test(isp)) return { cn: isp.trim(), en: "" };
  return { cn: "", en: isp.trim() };
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

/** ipwho.is en 语言下省份名会转成拼音后缀（如 "Henan Sheng"），清理为常用英文省名 */
function cleanEnRegion(region: string): string {
  return region.trim().replace(/\s+(Sheng|Shi|Xianggang)$/i, "");
}

type Provider = (ip: string) => Promise<GeoInfo | null>;

/** 中文来源：优先 HTTPS 的 ipwho.is；ip-api（仅 HTTP）作为可选的明文降级（默认关闭） */
const ZH_PROVIDERS: Provider[] = [
  async (ip) => {
    const d = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN`);
    if (!d.success) return null;
    const conn = (d.connection ?? {}) as Record<string, unknown>;
    return {
      country: String(d.country ?? ""),
      region: String(d.region ?? ""),
      city: String(d.city ?? ""),
      isp: classifyIsp(String(conn.isp ?? "")).cn,
    };
  },
  ...(GEO_ALLOW_HTTP
    ? ([
        async (ip) => {
          const d = await fetchJson(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,message,country,regionName,city,isp`,
          );
          if (d.status !== "success") return null;
          return {
            country: String(d.country ?? ""),
            region: String(d.regionName ?? ""),
            city: String(d.city ?? ""),
            isp: classifyIsp(String(d.isp ?? "")).cn,
          };
        },
      ] satisfies Provider[])
    : []),
];

/** 英文来源：ipwho.is 默认 en；ipinfo.io 仅英文。
 * 追加对服务端/数据中心流量宽容的免费备用源——ipwho.is 与 ipinfo 对共享出口
 * （尤其 Cloudflare Workers）限流严格，常被整源快速拒绝（429/403）。
 * 备用源为英文数据，中文缺失时由 lookupIpLocation 的单语言兜底逻辑回填。 */
const EN_PROVIDERS: Provider[] = [
  async (ip) => {
    const d = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!d.success) return null;
    const conn = (d.connection ?? {}) as Record<string, unknown>;
    return {
      country: String(d.country ?? ""),
      region: cleanEnRegion(String(d.region ?? "")),
      city: String(d.city ?? ""),
      isp: classifyIsp(String(conn.isp ?? "")).en,
    };
  },
  async (ip) => {
    const d = await fetchJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
    if (!d.country) return null;
    const org = String(d.org ?? "");
    return {
      country: String(d.country ?? ""),
      region: String(d.region ?? ""),
      city: String(d.city ?? ""),
      isp: classifyIsp(org.split(" ").slice(1).join(" ")).en,
    };
  },
  async (ip) => {
    const d = await fetchJson(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`);
    if (!d.country && !d.city) return null;
    return {
      country: String(d.country ?? ""),
      region: String(d.region ?? ""),
      city: String(d.city ?? ""),
      isp: classifyIsp(String(d.isp ?? d.organization ?? "")).en,
    };
  },
  async (ip) => {
    const d = await fetchJson(`https://freeipapi.com/api/json/${encodeURIComponent(ip)}`);
    if (!d.countryName) return null;
    return {
      country: String(d.countryName ?? ""),
      region: cleanEnRegion(String(d.regionName ?? "")),
      city: String(d.cityName ?? ""),
      isp: "",
    };
  },
];

async function resolve(ip: string, providers: Provider[]): Promise<GeoInfo | null> {
  for (const provider of providers) {
    try {
      const info = await provider(ip);
      if (info) return info;
      /* 正常响应但解析不出结果（限流 JSON、形状变更等）：留日志便于排查外呼问题 */
      console.warn(`[geo] provider returned no data for ${ip}`);
    } catch (e) {
      /* 静默降级到下一接口；留一行运行日志便于在 Workers 可观测性里定位外呼问题 */
      console.warn(`[geo] provider failed for ${ip}:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

const cache = new Map<string, { info: GeoResult; expiresAt: number }>();
const inFlight = new Map<string, Promise<GeoResult>>();

function cacheGet(ip: string): GeoResult | undefined {
  const e = cache.get(ip);
  if (!e) return undefined;
  if (e.expiresAt <= Date.now()) {
    cache.delete(ip);
    return undefined;
  }
  return e.info;
}

function cacheSet(ip: string, info: GeoResult): void {
  // delete 再 set：把重复写入的 key 刷新到插入序末尾，使下面的淘汰真正按「最久未写入」进行
  cache.delete(ip);
  cache.set(ip, {
    info,
    expiresAt: Date.now() + (info ? GEO_CACHE_SUCCESS_MS : GEO_CACHE_FAILURE_MS),
  });
  if (cache.size > GEO_CACHE_MAX) {
    // 淘汰最久未写入的 excess 项：单次 O(excess)、摊还 O(1)。
    // 原实现遍历全表只删已过期项，若全未过期则一项都删不掉，Map 会无界增长且每次写入都要全表扫描。
    const excess = cache.size - GEO_CACHE_MAX;
    let i = 0;
    for (const k of cache.keys()) {
      if (i++ >= excess) break;
      cache.delete(k);
    }
  }
}

/** 双语定位查询（含缓存与并发合并）。不可定位/全接口失败返回 null，绝不抛异常。 */
export async function lookupIpLocation(ip: string): Promise<GeoResult> {
  if (isSkippable(ip)) return null;
  if (ip.includes(":")) return null;
  const cached = cacheGet(ip);
  if (cached !== undefined) return cached;
  const running = inFlight.get(ip);
  if (running) return running;

  const p = (async (): Promise<GeoResult> => {
    const [zh, en] = await Promise.all([
      resolve(ip, ZH_PROVIDERS),
      resolve(ip, EN_PROVIDERS),
    ]);
    if (!zh && !en) return null;
    // 单语言缺失时以另一语言兜底，保证 zh/en 各有一组值
    return { zh: (zh ?? en)!, en: (en ?? zh)! };
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