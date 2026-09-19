import { Hono } from "hono";
import { CSP, ENABLE_GEO, geoQuotaFor, quotaFor, retentionMonthsFor } from "../config";
import { audit, getSessionUser, requireUser } from "../auth";
import { sqlite } from "../db";
import { clientIp } from "../rate-limit";
import { escapeLike, utcDateDaysAgo } from "../utils";
import { clampLimit, geoUsedToday, requireUserOr } from "../http-helpers";
import { htmlPage } from "../pages";

/** 仪表盘 / 消息列表 / 清空 */
export const messagesApp = new Hono();

messagesApp.get("/", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(
    htmlPage({
      wxId: user.wxId,
      level: user.level,
      geo: ENABLE_GEO,
      geoQuota: geoQuotaFor(user.level),
      geoRemaining: Math.max(0, geoQuotaFor(user.level) - geoUsedToday(user)),
      messageQuota: quotaFor(user.level),
      retentionMonths: retentionMonthsFor(user.level),
    }),
  );
});

/**
 * 「近 14 天」列的固定锚点：以 UTC 今日结尾的 14 个自然日。
 * 刻意与页面的时间范围解耦 —— 列表里这一列的表头写的就是"近 14 天"，
 * 若跟着上方区间变，同一列在不同筛选下就不是同一个东西了。
 */
const SPARK_DAYS = 14;

/**
 * GET /messages?detail=1
 *
 * 默认只回原来那 4 个字段（旧仪表盘就是用它现算的，成本不变）。
 * detail=1 时按**当页的 id**（≤ limit 条）补四样派生量，全部是
 * id 前缀索引上的分组扫描，代价随页大小而不是库大小增长：
 *   isPublic          messages 表的列
 *   firstReadSeconds  首读与发送之差（无已读 → null）
 *   blockedCount      被黑名单命中、明细列表不返回但库里仍有的行数
 *   dailyReads        近 14 个 UTC 自然日的逐日已读（稀疏：只给非零日）
 * distinctIps 不在这里：reads 主键是 (id, ip)，它与 reads 恒等，
 * 而"整个时间窗内有多少个不同 IP"根本不能按消息相加（同一 IP 读过两条会被数两遍），
 * 那个数在 GET /stats/overview 的 totals.distinctIps 里。
 */
function detailOf(ids: string[], wxId: string): {
  firstRead: Map<string, number>;
  blocked: Map<string, number>;
  daily: Map<string, Array<{ date: string; count: number }>>;
} {
  const firstRead = new Map<string, number>();
  const blocked = new Map<string, number>();
  const daily = new Map<string, Array<{ date: string; count: number }>>();
  if (ids.length === 0) return { firstRead, blocked, daily };
  const marks = ids.map(() => "?").join(",");

  const fr = sqlite
    .query(
      `SELECT m.id AS id, CAST(strftime('%s', MIN(r.timestamp)) - strftime('%s', m.timestamp) AS INTEGER) AS s
       FROM messages m JOIN reads r ON r.id = m.id
       WHERE m.id IN (${marks}) GROUP BY m.id`,
    )
    .all(...ids) as Array<{ id: string; s: number | null }>;
  for (const r of fr) if (r.s !== null) firstRead.set(r.id, Math.max(0, r.s));

  const bl = sqlite
    .query(
      `SELECT r.id AS id, COUNT(*) AS n FROM reads r
       WHERE r.id IN (${marks})
         AND (r.ip IN (SELECT ip FROM ip_block_global)
              OR r.ip IN (SELECT ip FROM ip_block_message WHERE id = r.id)
              OR r.ip IN (SELECT ip FROM ip_block_account WHERE wx_id = ?))
       GROUP BY r.id`,
    )
    .all(...ids, wxId) as Array<{ id: string; n: number }>;
  for (const r of bl) blocked.set(r.id, r.n);

  const since = `${utcDateDaysAgo(SPARK_DAYS - 1)} 00:00:00`;
  const dr = sqlite
    .query(
      `SELECT r.id AS id, substr(r.timestamp, 1, 10) AS date, COUNT(*) AS count
       FROM reads r WHERE r.id IN (${marks}) AND r.timestamp >= ?
       GROUP BY 1, 2 ORDER BY 2`,
    )
    .all(...ids, since) as Array<{ id: string; date: string; count: number }>;
  for (const r of dr) {
    const list = daily.get(r.id) ?? [];
    list.push({ date: r.date, count: r.count });
    daily.set(r.id, list);
  }
  return { firstRead, blocked, daily };
}

messagesApp.get("/messages", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const user = getSessionUser(c)!;
  const q = (c.req.query("q") ?? "").trim();
  const limit = clampLimit(Number(c.req.query("limit") ?? 50));
  const offset = Math.max(Math.floor(Number(c.req.query("offset") ?? 0)) || 0, 0);
  const detail = c.req.query("detail") === "1";

  // 返回 (WHERE 片段, 参数)，SELECT 与 COUNT 共用同一过滤条件，保证总数与列表口径一致。
  // q>=3 时优先 FTS（短语检索），语法不受支持时退化为 LIKE。
  const filter = (): { cond: string; params: string[] } => {
    if (!q) return { cond: "WHERE m.wx_id = ?", params: [user.wxId] };
    if (q.length >= 3) {
      const phrase = q.replaceAll('"', '""');
      try {
        sqlite
          .query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ? LIMIT 1")
          .get(`"${phrase}"`);
        return {
          cond: "WHERE m.wx_id = ? AND m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)",
          params: [user.wxId, `"${phrase}"`],
        };
      } catch {
        /* FTS 语法不支持，落到 LIKE */
      }
    }
    return {
      cond: "WHERE m.wx_id = ? AND m.content LIKE ? ESCAPE '\\'",
      params: [user.wxId, `%${escapeLike(q)}%`],
    };
  };

  const { cond, params } = filter();
  const rows = sqlite
    .query(
      `SELECT m.id, m.content, m.timestamp, m.is_public AS isPublic,
              (SELECT COUNT(DISTINCT r.ip) FROM reads r WHERE r.id = m.id) AS read_count
       FROM messages m ${cond} ORDER BY m.timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<{
    id: string;
    content: string;
    timestamp: string;
    isPublic: number;
    read_count: number;
  }>;
  const total = (sqlite.query(`SELECT COUNT(*) AS n FROM messages m ${cond}`).get(...params) as { n: number }).n;
  // 总数经响应头返回（数组形状保持不变，旧客户端兼容）
  c.header("X-Total-Count", String(total));
  if (!detail) {
    return c.json(rows.map((r) => ({ id: r.id, content: r.content, reads: r.read_count, timestamp: r.timestamp })));
  }
  const { firstRead, blocked, daily } = detailOf(
    rows.map((r) => r.id),
    user.wxId,
  );
  return c.json(
    rows.map((r) => ({
      id: r.id,
      content: r.content,
      reads: r.read_count,
      timestamp: r.timestamp,
      isPublic: r.isPublic === 1,
      firstReadSeconds: firstRead.get(r.id) ?? null,
      blockedCount: blocked.get(r.id) ?? 0,
      dailyReads: daily.get(r.id) ?? [],
    })),
  );
});

messagesApp.delete("/messages", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(user.wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(user.wxId);
  })();
  audit(user.wxId, "delete_all_messages", null, clientIp(c));
  return c.json({ ok: true });
});

messagesApp.delete("/messages/:wxId", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const wxId = c.req.param("wxId");
  if (wxId !== user.wxId) return c.json({ error: "forbidden" }, 403);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(user.wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(user.wxId);
  })();
  audit(user.wxId, "delete_all_messages", null, clientIp(c));
  return c.json({ ok: true });
});
