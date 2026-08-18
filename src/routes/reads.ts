import { Hono } from "hono";
import { CSP, ENABLE_GEO, geoQuotaFor } from "../config";
import { audit, getSessionUser, requireUser } from "../auth";
import { sqlite } from "../db";
import { lookupIpLocation } from "../geo";
import { clientIp, isValidIp } from "../rate-limit";
import { isValidId, utcDate, utcNow } from "../utils";
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

/** 黑名单并集：全局 ∪ 本消息 ∪ 账户(owner)。返回 Set（内存 O(n) 标记，无逐行 SQL） */
function blockSetFor(id: string, ownerWxId: string | null): Set<string> {
  const set = new Set<string>();
  for (const r of sqlite.query("SELECT ip FROM ip_block_global").all() as Array<{ ip: string }>) {
    set.add(r.ip);
  }
  for (const r of sqlite
    .query("SELECT ip FROM ip_block_message WHERE id = ?")
    .all(id) as Array<{ ip: string }>) {
    set.add(r.ip);
  }
  if (ownerWxId) {
    for (const r of sqlite
      .query("SELECT ip FROM ip_block_account WHERE wx_id = ?")
      .all(ownerWxId) as Array<{ ip: string }>) {
      set.add(r.ip);
    }
  }
  return set;
}

/** 已读详情分页 JSON 接口：默认每页 50 条，上限 200（与 /messages 一致）。
 * 黑名单 IP 行在后端直接过滤，API 响应不返回其任何数据（仅返回 blockedCount 数字）。 */
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
  const msg = sqlite
    .query("SELECT content, wx_id FROM messages WHERE id = ?")
    .get(id) as { content: string; wx_id: string };
  // 账户黑名单仅在查看者为消息 owner 时参与判定（本接口仅 owner 可达，msg.wx_id 即 owner）
  const ownerWxId = msg.wx_id === user.wxId ? user.wxId : null;
  const blockedSet = blockSetFor(id, ownerWxId);
  // blockedCount 基于全量 reads 计算，不能用分页行数推算
  let blockedCount = 0;
  for (const r of sqlite
    .query("SELECT ip FROM reads WHERE id = ?")
    .all(id) as Array<{ ip: string }>) {
    if (blockedSet.has(r.ip)) blockedCount++;
  }
  // SQL 层过滤黑名单行：分页基于可见行数，命中行不出现在响应中
  const rows = sqlite
    .query(
      `SELECT ip, timestamp, user_agent, country, region, city, isp, country_en, region_en, city_en, isp_en
       FROM reads WHERE id = ?
         AND ip NOT IN (SELECT ip FROM ip_block_global)
         AND ip NOT IN (SELECT ip FROM ip_block_message WHERE id = ?)
         ${ownerWxId ? "AND ip NOT IN (SELECT ip FROM ip_block_account WHERE wx_id = ?)" : ""}
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...(ownerWxId ? [id, id, ownerWxId, pageSize, offset] : [id, id, pageSize, offset])) as ReadRow[];
  return c.json({
    id,
    content: msg.content,
    total,
    blockedCount,
    visibleTotal: total - blockedCount,
    page,
    pageSize,
    reads: rows.map(readRow),
  });
});

/* ── 单条消息 IP 黑名单（消息所有者；仅此维度支持一键拉黑当前访问 IP） ── */

readsApp.get("/reads/:id/block", (c) => {
  const id = c.req.param("id");
  const denied = readsMessageOr(c, id);
  if (denied) return denied;
  const rows = sqlite
    .query("SELECT ip, created_at FROM ip_block_message WHERE id = ? ORDER BY created_at DESC")
    .all(id) as Array<{ ip: string; created_at: string }>;
  return c.json({ id, count: rows.length, ips: rows.map((r) => ({ ip: r.ip, createdAt: r.created_at })) });
});

readsApp.post("/reads/:id/block", async (c) => {
  const id = c.req.param("id");
  const denied = readsMessageOr(c, id);
  if (denied) return denied;
  let body: { ip?: unknown; action?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  // 仅消息维度支持 action:"current"（一键拉黑当前访问 IP）
  const ip = body.action === "current" ? clientIp(c) : typeof body.ip === "string" ? body.ip : "";
  if (!isValidIp(ip)) return c.json({ error: "invalid ip" }, 400);
  const res = sqlite
    .query("INSERT OR IGNORE INTO ip_block_message (id, ip, created_at) VALUES (?, ?, ?)")
    .run(id, ip, utcNow());
  if (res.changes === 0) return c.json({ error: "exists" }, 409);
  audit(requireUser(c)!.wxId, "message_block_add", `${id} ${ip}`, clientIp(c));
  return c.json({ ok: true, ip });
});

readsApp.delete("/reads/:id/block", (c) => {
  const id = c.req.param("id");
  const denied = readsMessageOr(c, id);
  if (denied) return denied;
  const ip = c.req.query("ip") ?? "";
  if (!isValidIp(ip)) return c.json({ error: "invalid ip" }, 400);
  const res = sqlite.query("DELETE FROM ip_block_message WHERE id = ? AND ip = ?").run(id, ip);
  if (res.changes === 0) return c.json({ error: "not found" }, 404);
  audit(requireUser(c)!.wxId, "message_block_remove", `${id} ${ip}`, clientIp(c));
  return c.json({ ok: true });
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
  // 黑名单 IP 的定位数据同样不返回（与 /data 过滤策略一致）
  if (blockSetFor(id, msg.wx_id === user.wxId ? user.wxId : null).has(ip)) {
    return c.json({ error: "not found" }, 404);
  }

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
