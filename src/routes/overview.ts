import { Hono } from "hono";
import { requireUser } from "../auth";
import { sqlite } from "../db";

/**
 * 总览聚合接口 GET /stats/overview。
 *
 * 原版没有这个东西：仪表盘是拿到 /messages 的 4 个字段后在浏览器里现算的，
 * 所以只能显示"每条消息多少人读"，出不来趋势、时段、客户端与地域分布。
 * SPA 的总览要把这些一次拿全，必须服务器侧聚合。
 *
 * ── 成本口径（这是选预聚合而不是实时扫表的理由）──
 * Workers 免费档单次请求 10ms CPU（config.ts 把 PBKDF2 迭代降到 20000 就是为此）。
 * 所以：
 *   · 序列 / 总量 / 时段 / 客户端 → 全部走 rollup（read_stats、registration_stats、
 *     hour_stats、ua_stats），是按 (date, wx_id) 主键的点查 + 小区间扫描。
 *   · 地域 / 运营商 → 按需数据（只有点过「定位」的行有值），天生稀疏，
 *     走 idx_reads_located 部分索引只扫已定位行。
 *   · 首次已读耗时 + 独立 IP 数 → 仅有的两条回 reads 的实时聚合。
 *     前者按窗口内消息数缩放，用 idx_reads_id_timestamp 做 MIN(timestamp) 分组；
 *     后者是 COUNT(DISTINCT ip) —— 去重集合没法从增量滚表合并出来，只能现算。
 *
 * ── 两个必须说清的口径差异 ──
 * ① rollup 统计的是**原始 reads**，不扣黑名单；而 /reads/:id/data 会在服务端过滤
 *    黑名单命中的行。所以"总览说 120 次已读、明细列表只有 117 行"是预期行为，
 *    差额就是被拉黑的访问。这里不做假对齐 —— 把两个数都摊开比硬凑一致更有用。
 *    （实测：注册新消息会把来源 IP 自动加进该消息的 IP 黑名单，于是本机打点
 *     在 /count 里是 0、在总览里照常计数，正是这个差异。）
 * ② rollup 只增不减：超额淘汰旧消息、僵尸用户清理都会连 reads 一起删掉，
 *    但已计入的 rollup 不会回退，所以高估会存在一段时间。
 *    兜底是 backfillStats() 的 rowid 复用检测 —— 大面积删除后新读行会复用被删
 *    rowid 且时间更晚，触发四张派生表全量重算并自动收敛（见 stats.ts）。
 */
export const overviewApp = new Hono();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 366;

/** rollup 的 date 列就是 UTC 日，所以区间按字符串比较即可（YYYY-MM-DD 字典序=时间序） */
function windowOf(c: { req: { query: (k: string) => string | undefined } }): { from: string; to: string } {
  const to = c.req.query("to") ?? utcToday();
  const from = c.req.query("from") ?? shiftDays(to, -29);
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return { from: shiftDays(utcToday(), -29), to: utcToday() };
  }
  // 跨度封顶一年：rollup 虽然便宜，也没有理由让一个请求扫任意长的区间
  if (daysBetween(from, to) > MAX_SPAN_DAYS) return { from: shiftDays(to, -MAX_SPAN_DAYS + 1), to };
  return { from, to };
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  ) + 1;
}

/** 展示时区偏移（小时）。原版按语言隐含 UTC+8 / UTC，这里显式化，服务端按它把 24 个桶轮转到位 */
function tzOffset(c: { req: { query: (k: string) => string | undefined } }): number {
  const raw = Number(c.req.query("tz") ?? 0);
  return Number.isFinite(raw) ? Math.max(-14, Math.min(14, Math.floor(raw))) : 0;
}

overviewApp.get("/stats/overview", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);

  const { from, to } = windowOf(c);
  const tz = tzOffset(c);
  const wxId = user.wxId;
  // 环比窗口：与展示区间等长、紧邻在前。放在服务器算，前端就不必为了一个箭头再发一次请求。
  const prevTo = shiftDays(from, -1);
  const prevFrom = shiftDays(prevTo, -(daysBetween(from, to) - 1));

  /* ── 日序列：reads 与 regs 各查一次再合并（两张 rollup 都不是对方子集，不能 JOIN） ── */
  const reads = sqlite
    .query(
      `SELECT date, count FROM read_stats WHERE wx_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
    )
    .all(wxId, from, to) as Array<{ date: string; count: number }>;
  const regs = sqlite
    .query(
      `SELECT date, count FROM registration_stats WHERE wx_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
    )
    .all(wxId, from, to) as Array<{ date: string; count: number }>;

  const byDate = new Map<string, { date: string; reads: number; regs: number }>();
  for (const r of reads) byDate.set(r.date, { date: r.date, reads: r.count, regs: 0 });
  for (const r of regs) {
    const cur = byDate.get(r.date) ?? { date: r.date, reads: 0, regs: 0 };
    cur.regs = r.count;
    byDate.set(r.date, cur);
  }

  /* ── 总量：窗口内消息数 / 有已读的消息数 ── */
  const msgRow = sqlite
    .query(
      `SELECT COUNT(*) AS messages,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM reads r WHERE r.id = m.id) THEN 1 ELSE 0 END) AS withReads
       FROM messages m WHERE m.wx_id = ? AND substr(m.timestamp, 1, 10) BETWEEN ? AND ?`,
    )
    .get(wxId, from, to) as { messages: number; withReads: number | null };

  /* ── 时段分布：24 个定长桶，按展示时区轮转 ── */
  const hourRows = sqlite
    .query(
      `SELECT hour, SUM(count) AS count FROM hour_stats
       WHERE wx_id = ? AND date BETWEEN ? AND ? GROUP BY hour`,
    )
    .all(wxId, from, to) as Array<{ hour: number; count: number }>;
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const h of hourRows) {
    // noUncheckedIndexedAccess 下取数组元素要显式兜 undefined
    const slot = hours[(h.hour + tz + 24) % 24];
    if (slot) slot.count += h.count;
  }

  /* ── 客户端分布 ── */
  const userAgents = sqlite
    .query(
      `SELECT kind, SUM(count) AS count FROM ua_stats
       WHERE wx_id = ? AND date BETWEEN ? AND ? GROUP BY kind ORDER BY count DESC`,
    )
    .all(wxId, from, to) as Array<{ kind: string; count: number }>;

  /* ── 独立 IP 数：COUNT(DISTINCT ip) 是去重集合，增量滚表合并不出来，
   *     所以它和首次已读耗时一样留在窗口内实时算（同样只走 idx_reads_id_timestamp）。 ── */
  const ipRow = sqlite
    .query(
      `SELECT COUNT(DISTINCT r.ip) AS ips
       FROM reads r JOIN messages m ON m.id = r.id
       WHERE m.wx_id = ? AND substr(r.timestamp, 1, 10) BETWEEN ? AND ?`,
    )
    .get(wxId, from, to) as { ips: number };

  /* ── 环比：只要两个总量，不要序列（前窗口的点数与图上画什么无关） ── */
  const prevReads = sqlite
    .query(
      `SELECT COALESCE(SUM(count), 0) AS n FROM read_stats WHERE wx_id = ? AND date BETWEEN ? AND ?`,
    )
    .get(wxId, prevFrom, prevTo) as { n: number };
  const prevMessages = sqlite
    .query(
      `SELECT COUNT(*) AS n FROM messages WHERE wx_id = ? AND substr(timestamp, 1, 10) BETWEEN ? AND ?`,
    )
    .get(wxId, prevFrom, prevTo) as { n: number };
  const prevRegs = sqlite
    .query(
      `SELECT COALESCE(SUM(count), 0) AS n FROM registration_stats WHERE wx_id = ? AND date BETWEEN ? AND ?`,
    )
    .get(wxId, prevFrom, prevTo) as { n: number };

  /* ── 地域 / 运营商：只扫「已定位」的行 ──
   * 归属地是点「定位」才写入的按需数据（每次消耗配额），所以这里的
   * located / totalReads 往往远小于 1 —— 响应把它一起给出，
   * 前端必须按"已定位部分的分部"来画，不能画成全量分布。 */
  const locatedWhere = `m.wx_id = ? AND r.country <> '' AND substr(r.timestamp, 1, 10) BETWEEN ? AND ?`;
  const locatedBase = sqlite
    .query(
      `SELECT COUNT(*) AS located FROM reads r JOIN messages m ON m.id = r.id WHERE ${locatedWhere}`,
    )
    .get(wxId, from, to) as { located: number };

  const regions = sqlite
    .query(
      `SELECT r.country AS country, r.region AS region, COUNT(*) AS count
       FROM reads r JOIN messages m ON m.id = r.id
       WHERE m.wx_id = ? AND r.country <> '' AND substr(r.timestamp, 1, 10) BETWEEN ? AND ?
       GROUP BY r.country, r.region ORDER BY count DESC LIMIT 20`,
    )
    .all(wxId, from, to) as Array<{ country: string; region: string; count: number }>;

  const isps = sqlite
    .query(
      `SELECT r.isp AS isp, COUNT(*) AS count
       FROM reads r JOIN messages m ON m.id = r.id
       WHERE m.wx_id = ? AND r.country <> '' AND r.isp <> '' AND substr(r.timestamp, 1, 10) BETWEEN ? AND ?
       GROUP BY r.isp ORDER BY count DESC LIMIT 20`,
    )
    .all(wxId, from, to) as Array<{ isp: string; count: number }>;

  /* ── 首次已读耗时：唯一回 reads 的聚合，按窗口内消息数缩放 ── */
  const firstRead = sqlite
    .query(
      `SELECT AVG(strftime('%s', d.first) - strftime('%s', d.sent)) AS avg_seconds
       FROM (
         SELECT m.timestamp AS sent, MIN(r.timestamp) AS first
         FROM messages m JOIN reads r ON r.id = m.id
         WHERE m.wx_id = ? AND substr(m.timestamp, 1, 10) BETWEEN ? AND ?
         GROUP BY m.id
       ) d`,
    )
    .get(wxId, from, to) as { avg_seconds: number | null };

  const totalReads = reads.reduce((a, r) => a + r.count, 0);
  const messages = msgRow.messages ?? 0;

  return c.json({
    from,
    to,
    tz,
    totals: {
      reads: totalReads,
      regs: regs.reduce((a, r) => a + r.count, 0),
      messages,
      messagesWithReads: msgRow.withReads ?? 0,
      distinctIps: ipRow.ips,
      /** 0..1；分母是窗口内消息数，无消息时为 null 而不是 0，免得"0% 覆盖"被当成事实 */
      coverage: messages > 0 ? (msgRow.withReads ?? 0) / messages : null,
    },
    /** 紧邻前一个等长窗口，供 KPI 卡上的环比箭头。
     *  regs 与 messages 是两个口径：前者是"当天注册了多少条消息"（只增），
     *  后者是"此刻还留着多少条"（会被额度淘汰与保留策略删掉），所以两个都给。 */
    prev: { from: prevFrom, to: prevTo, reads: prevReads.n, messages: prevMessages.n, regs: prevRegs.n },
    series: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    hours,
    userAgents,
    /** ① 的核心：分部数据的覆盖度先于分部数据本身 */
    located: { count: locatedBase.located, ratio: totalReads > 0 ? locatedBase.located / totalReads : null },
    regions,
    isps,
    avgFirstReadSeconds: firstRead.avg_seconds === null ? null : Math.round(firstRead.avg_seconds),
  });
});
