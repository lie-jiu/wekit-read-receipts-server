import { Hono } from "hono";
import { CSP, ENABLE_GEO, geoQuotaFor } from "../config";
import { getSessionUser, requireUser } from "../auth";
import { sqlite } from "../db";
import { lookupIpLocation } from "../geo";
import { isValidId, utcDate } from "../utils";
import {
  clampLimit,
  emptyReadRow,
  geoUsedToday,
  readRow,
  readsMessageOr,
  type ReadRow,
} from "../http-helpers";
import { readDetailsPage } from "../pages";

/** 已读详情页 / 分页 JSON / 按需 IP 定位（POST /reads/:id/geo 受 /reads/:id/geo 30/分 限流，由 app.ts 顶层中间件控制） */
export const readsApp = new Hono();

readsApp.get("/reads/:id", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.redirect("/login");
  const id = c.req.param("id");
  const msg = sqlite
    .query("SELECT wx_id, content FROM messages WHERE id = ?")
    .get(id) as { wx_id: string; content: string } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  if (msg.wx_id !== user.wxId) return c.json({ error: "forbidden" }, 403);
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(
    readDetailsPage(
      {
        wxId: user.wxId,
        level: user.level,
        geo: ENABLE_GEO,
        geoQuota: geoQuotaFor(user.level),
        geoRemaining: Math.max(0, geoQuotaFor(user.level) - geoUsedToday(user)),
      },
      { id, content: msg.content },
    ),
  );
});

/** 已读详情分页 JSON 接口：默认每页 50 条，上限 200（与 /messages 一致） */
readsApp.get("/reads/:id/data", (c) => {
  const id = c.req.param("id");
  const denied = readsMessageOr(c, id);
  if (denied) return denied;
  const user = requireUser(c)!;
  const page = Math.max(Math.floor(Number(c.req.query("page") ?? 1)) || 1, 1);
  const pageSize = clampLimit(Number(c.req.query("pageSize") ?? 50), 1, 200);
  const offset = (page - 1) * pageSize;
  const { total } = sqlite
    .query("SELECT COUNT(*) AS total FROM reads WHERE id = ?")
    .get(id) as { total: number };
  const rows = sqlite
    .query(
      "SELECT ip, timestamp, user_agent, country, region, city, isp, country_en, region_en, city_en, isp_en FROM reads WHERE id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
    )
    .all(id, pageSize, offset) as ReadRow[];
  const msg = sqlite
    .query("SELECT content FROM messages WHERE id = ?")
    .get(id) as { content: string };
  return c.json({
    id,
    content: msg.content,
    total,
    page,
    pageSize,
    reads: rows.map(readRow),
  });
});

/** 按需 IP 定位：为指定已读记录补全省市/运营商（幂等，成功结果缓存 24h） */
readsApp.post("/reads/:id/geo", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!ENABLE_GEO) return c.json({ error: "geo disabled" }, 403);
  const quota = geoQuotaFor(user.level);
  const used = geoUsedToday(user);
  if (quota <= 0 || used >= quota) {
    return c.json({ error: "geo_quota_exceeded", remaining: 0, quota }, 429);
  }
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  let body: { ip?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const ip = typeof body.ip === "string" ? body.ip : "";
  // 严格 IPv4 校验：四段 0-255，阻断路径注入（URL 拼接）与任意字符串外呼
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m || m.slice(1).some((o) => Number(o) > 255)) {
    return c.json({ error: "invalid ip" }, 400);
  }

  const msg = sqlite.query("SELECT wx_id FROM messages WHERE id = ?").get(id) as { wx_id: string } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  if (msg.wx_id !== user.wxId && !user.isAdmin) return c.json({ error: "forbidden" }, 403);

  const row = sqlite
    .query(
      "SELECT country, region, city, isp, country_en, region_en, city_en, isp_en FROM reads WHERE id = ? AND ip = ?",
    )
    .get(id, ip) as
    | { country: string; region: string; city: string; isp: string; country_en: string; region_en: string; city_en: string; isp_en: string }
    | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  const located = row.country !== "" || row.region !== "" || row.city !== "" || row.isp !== "";
  const enMissing =
    row.country_en === "" && row.region_en === "" && row.city_en === "" && row.isp_en === "";
  if (located && !enMissing) {
    return c.json({
      ...readRow({ ip, timestamp: "", user_agent: "", ...row }),
      remaining: quota - used,
      quota,
    });
  }

  // 原子占额（合并跨天惰性归零）：在 WHERE 内原子判断，消除「检查→外呼→累加」的 TOCTOU 竞态。
  // 外呼失败也占额（与旧语义一致）：失败结果有 1h 失败缓存，避免用户无成本反复触发外呼。
  const today = utcDate();
  const claim = sqlite
    .query(
      "UPDATE users SET geo_count = geo_count + 1, geo_date = ? WHERE wx_id = ? AND (geo_date != ? OR geo_count < ?)",
    )
    .run(today, user.wxId, today, quota);
  if (claim.changes === 0) {
    return c.json({ error: "geo_quota_exceeded", remaining: 0, quota }, 429);
  }
  const newCount = (
    sqlite.query("SELECT geo_count FROM users WHERE wx_id = ?").get(user.wxId) as { geo_count: number }
  ).geo_count;

  const info = await lookupIpLocation(ip);
  const remaining = quota - newCount;
  if (!info) {
    if (located) {
      return c.json({
        ...readRow({ ip, timestamp: "", user_agent: "", ...row }),
        remaining,
        quota,
      });
    }
    return c.json(
      {
        ...readRow({ ...emptyReadRow, ip, timestamp: "", user_agent: "" }),
        remaining,
        quota,
      },
      502,
    );
  }
  const zh = info.zh;
  const en = info.en;
  sqlite
    .query(
      "UPDATE reads SET country = ?, region = ?, city = ?, isp = ?, country_en = ?, region_en = ?, city_en = ?, isp_en = ? WHERE id = ? AND ip = ?",
    )
    .run(zh.country, zh.region, zh.city, zh.isp, en.country, en.region, en.city, en.isp, id, ip);
  return c.json({
    ip,
    userAgent: "",
    country: zh.country,
    region: zh.region,
    city: zh.city,
    isp: zh.isp,
    countryEn: en.country,
    regionEn: en.region,
    cityEn: en.city,
    ispEn: en.isp,
    located: true,
    remaining,
    quota,
  });
});
