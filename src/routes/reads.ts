import { Hono } from "hono";
import { ENABLE_GEO, geoQuotaFor } from "../config";
import { spaHash } from "../spa";
import { audit, requireUser } from "../auth";
import { sqlite, syncMessageCount } from "../db";
import { lookupIpLocation } from "../geo";
import { clientIp, isValidIp, UNKNOWN_IP } from "../rate-limit";
import { UA_KIND_SQL } from "../stats";
import { isValidId, utcDate, utcNow } from "../utils";
import {
  clampLimit,
  emptyReadRow,
  geoUsedToday,
  publicReadOr,
  readRow,
  readsMessageOr,
  type ReadRow,
} from "../http-helpers";

/** 已读详情页 / 分页 JSON / 按需 IP 定位（POST /reads/:id/geo 受 /reads/:id/geo 30/分 限流，由 app.ts 顶层中间件控制） */
export const readsApp = new Hono();

/**
 * 旧的已读详情服务端页面已退役：`/reads/:id` 重定向到 SPA 的 `/#/reads/:id`。
 *
 * 刻意不在这里做 publicReadOr() 访问判定（旧实现会替匿名访客跳去 /login）：
 * SPA 会立刻用 GET /reads/:id/data 问一次，那条判定本来就在服务端做，而且拿得到
 * 更准的原因 —— 401 是"这条没公开/需要登录"，403 是"你没权限"，404 是"没有这条消息"，
 * 旧实现只能笼统地把人推到登录页。
 */
readsApp.get("/reads/:id", (c) => c.redirect(spaHash(`/reads/${c.req.param("id")}`)));

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

/** 一条消息的「可见行」过滤条件：黑名单命中的行既不出现在表格里，也不参与汇总。
 *  表格与图必须同一口径，否则会出现"明细 117 行、地域图加起来 120"这种对不上的数。 */
function visibleFilter(id: string, ownerWxId: string | null): { where: string; params: string[] } {
  const parts = [
    "r.id = ?",
    "r.ip NOT IN (SELECT ip FROM ip_block_global)",
    "r.ip NOT IN (SELECT ip FROM ip_block_message WHERE id = ?)",
  ];
  const params = [id, id];
  if (ownerWxId) {
    parts.push("r.ip NOT IN (SELECT ip FROM ip_block_account WHERE wx_id = ?)");
    params.push(ownerWxId);
  }
  return { where: parts.join(" AND "), params };
}

/**
 * 单条消息的全量汇总（不是当页）。
 *
 * 为什么放到服务器算：明细是分页的，前端手上只有第 N 页；拿页里的行做聚合，
 * 得到的是"最近 50 次已读的分布"，可它在页面上看起来就和"这条消息的分布"一样。
 *
 * hours 保持 UTC 桶，展示时区由前端轮转（最多 24 个桶，成本可忽略，
 * 接口也就不用为了显示偏好多接一个参数）。
 */
function messageSummary(id: string, ownerWxId: string | null, sentAt: string) {
  const vis = visibleFilter(id, ownerWxId);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const hourRows = sqlite
    .query(
      `SELECT CAST(substr(r.timestamp, 12, 2) AS INTEGER) AS hour, COUNT(*) AS count
       FROM reads r WHERE ${vis.where} GROUP BY 1`,
    )
    .all(...vis.params) as Array<{ hour: number; count: number }>;
  for (const h of hourRows) {
    const slot = h.hour >= 0 && h.hour < 24 ? hours[h.hour] : undefined;
    if (slot) slot.count += h.count;
  }
  // 一趟标量聚合拿齐"可见数 / 已定位数 / 首读延迟"，不必再各扫一遍
  const scalars = sqlite
    .query(
      `SELECT COUNT(*) AS visible,
              SUM(CASE WHEN r.country <> '' THEN 1 ELSE 0 END) AS located,
              CAST(strftime('%s', MIN(r.timestamp)) - strftime('%s', ?) AS INTEGER) AS first_seconds
       FROM reads r WHERE ${vis.where}`,
    )
    .get(sentAt, ...vis.params) as {
    visible: number | null;
    located: number | null;
    first_seconds: number | null;
  };
  const visible = scalars.visible ?? 0;
  const located = scalars.located ?? 0;
  return {
    hours,
    regions: sqlite
      .query(
        `SELECT r.country AS country, r.region AS region, COUNT(*) AS count
         FROM reads r WHERE ${vis.where} AND r.country <> ''
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`,
      )
      .all(...vis.params) as Array<{ country: string; region: string; count: number }>,
    isps: sqlite
      .query(
        `SELECT r.isp AS isp, COUNT(*) AS count
         FROM reads r WHERE ${vis.where} AND r.isp <> ''
         GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      )
      .all(...vis.params) as Array<{ isp: string; count: number }>,
    userAgents: sqlite
      .query(
        `SELECT ${UA_KIND_SQL} AS kind, COUNT(*) AS count
         FROM reads r WHERE ${vis.where} GROUP BY 1 ORDER BY 2 DESC`,
      )
      .all(...vis.params) as Array<{ kind: string; count: number }>,
    /** 归属地是按需数据：分部图只是"已定位这部分"的结构，比值先于图给出 */
    located: { count: located, ratio: visible > 0 ? located / visible : null },
    /** 首读延迟按可见行算（被拉黑的访问不该把一个消息"显得"很快被读）；无可见行为 null */
    firstReadSeconds: scalars.first_seconds === null ? null : Math.max(0, scalars.first_seconds),
  };
}

/** 已读详情分页 JSON 接口：默认每页 50 条，上限 200（与 /messages 一致）。
 * 黑名单 IP 行在后端直接过滤，API 响应不返回其任何数据（仅返回 blockedCount 数字）。 */
readsApp.get("/reads/:id/data", (c) => {
  const id = c.req.param("id");
  const access = publicReadOr(c, id);
  if (access instanceof Response) return access;
  const { msg, user } = access;
  const page = Math.max(Math.floor(Number(c.req.query("page") ?? 1)) || 1, 1);
  const pageSize = clampLimit(Number(c.req.query("pageSize") ?? 50), 1, 200);
  const offset = (page - 1) * pageSize;
  const { total } = sqlite
    .query("SELECT COUNT(*) AS total FROM reads WHERE id = ?")
    .get(id) as { total: number };
  // 账户黑名单仅在查看者为消息 owner 时参与判定（公开消息的匿名访客不应用 owner 的账户黑名单）
  const ownerWxId = user && msg.wx_id === user.wxId ? user.wxId : null;
  const vis = visibleFilter(id, ownerWxId);
  // SQL 层过滤黑名单行：分页基于可见行数，命中行不出现在响应中
  const rows = sqlite
    .query(
      `SELECT r.ip, r.timestamp, r.user_agent, r.country, r.region, r.city, r.isp,
              r.country_en, r.region_en, r.city_en, r.isp_en
       FROM reads r WHERE ${vis.where}
       ORDER BY r.timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...vis.params, pageSize, offset) as ReadRow[];
  const visibleTotal = (sqlite
    .query(`SELECT COUNT(*) AS n FROM reads r WHERE ${vis.where}`)
    .get(...vis.params) as { n: number }).n;
  // 差额就是被黑名单命中的行数：按"全量 − 可见"算，比再扫一遍 IP 便宜，也不会和分页打架
  const blockedCount = total - visibleTotal;
  const isOwner = !!user && msg.wx_id === user.wxId;
  return c.json({
    id,
    content: msg.content,
    /** 发出时间：首读延迟按它算。钻取页可以直接用 URL 打开，不能依赖列表已经加载 */
    sentAt: msg.timestamp,
    isPublic: msg.is_public === 1,
    isOwner,
    /** 管理动作（公开开关 / 黑名单 / 删除）只对 owner 与管理员开放，判定留在服务器 */
    canManage: isOwner || !!user?.isAdmin,
    /** 别人的 wxId 不给匿名访客与普通登录用户看；管理员要它才能定位是哪个账号 */
    ownerWxId: isOwner || user?.isAdmin ? msg.wx_id : null,
    total,
    blockedCount,
    visibleTotal,
    page,
    pageSize,
    /** 服务器眼中的访问者 IP：抽屉里「拉黑当前访问 IP」按它来，前端自己猜不出来 */
    viewerIp: clientIp(c),
    reads: rows.map(readRow),
    summary: messageSummary(id, ownerWxId, msg.timestamp),
  });
});

/* ── 删除消息（消息所有者或管理员；管理员可删任意消息，注册用户仅可删自己发布的消息） ── */

readsApp.delete("/reads/:id", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  const msg = sqlite
    .query("SELECT wx_id FROM messages WHERE id = ?")
    .get(id) as { wx_id: string } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  if (msg.wx_id !== user.wxId && !user.isAdmin) return c.json({ error: "forbidden" }, 403);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id = ?").run(id);
    sqlite.query("DELETE FROM messages WHERE id = ?").run(id);
    syncMessageCount(msg.wx_id);
  })();
  audit(user.wxId, "delete_message", id, clientIp(c));
  return c.json({ ok: true });
});

/* ── 公开消息详情开关（消息所有者或管理员；默认关闭，开启后所有人含未登录用户均可访问只读详情） ── */

readsApp.post("/reads/:id/public", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  let body: { public?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const pub = body.public === 1 || body.public === true || body.public === "1" ? 1 : 0;
  const msg = sqlite
    .query("SELECT wx_id FROM messages WHERE id = ?")
    .get(id) as { wx_id: string } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  if (msg.wx_id !== user.wxId && !user.isAdmin) return c.json({ error: "forbidden" }, 403);
  sqlite.query("UPDATE messages SET is_public = ? WHERE id = ?").run(pub, id);
  audit(user.wxId, "message_set_public", `${id} ${pub}`, clientIp(c));
  return c.json({ ok: true, public: pub === 1 });
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
  const current = clientIp(c);
  const ip = body.action === "current" ? current : typeof body.ip === "string" ? body.ip : "";
  // 哨兵值单独报错：请求者什么也没填，回 "invalid ip" 会让他以为是自己输入有问题
  if (body.action === "current" && current === UNKNOWN_IP) {
    return c.json({ error: "ip_unavailable" }, 400);
  }
  if (!isValidIp(ip)) return c.json({ error: "invalid ip" }, 400);
  const res = sqlite
    .query("INSERT OR IGNORE INTO ip_block_message (id, ip, created_at) VALUES (?, ?, ?)")
    .run(id, ip, utcNow());
  if (res.changes === 0) return c.json({ error: "exists" }, 409);
  audit(requireUser(c)!.wxId, "message_block_add", `${id} ${ip}`, current);
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

  const msg = sqlite
    .query("SELECT wx_id, is_public FROM messages WHERE id = ?")
    .get(id) as { wx_id: string; is_public: number } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  // 公开消息：任意登录用户可按需定位（消耗访问者自己的配额）；私有消息仅 owner/admin
  if (msg.wx_id !== user.wxId && !user.isAdmin && msg.is_public !== 1) {
    return c.json({ error: "forbidden" }, 403);
  }
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
  // geo_date 非今日时必须归 1 而不是 geo_count + 1：否则昨日用量会结转到今天，
  // 既吞掉当日配额（昨日用了 5 次 → 今天只剩 quota-6），昨日耗尽时还会让剩余次数变成负数。
  // 外呼失败也占额（与旧语义一致）：失败结果有 1h 失败缓存，避免用户无成本反复触发外呼。
  const today = utcDate();
  const claim = sqlite
    .query(
      `UPDATE users
          SET geo_count = CASE WHEN geo_date = ? THEN geo_count + 1 ELSE 1 END,
              geo_date = ?
        WHERE wx_id = ? AND (geo_date != ? OR geo_count < ?)`,
    )
    .run(today, today, user.wxId, today, quota);
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
