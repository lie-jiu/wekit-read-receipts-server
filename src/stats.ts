import { sqlite } from "./db";
import { AUDIT_RETENTION_DAYS } from "./config";
import { utcDate, utcDaysAgo } from "./utils";
import { purgeIdleUsers } from "./retention";

const CURSOR_KEY = "stats_cursor";
const EPOCH = "0000-00-00 00:00:00";

/**
 * 由 aggregateSince() 从 reads 推导出来的滚表清单 —— 唯一权威列表。
 *
 * 新增 rollup 只改这里加一行。backfillStats() 的全量重建分支必须清空本表
 * 每一张表：aggregateSince(0) 用的是 ON CONFLICT DO UPDATE SET count = count + excluded.count，
 * 漏清的那张会在既有数值上再加一遍，而且误差永久留在表里（实测踩过：
 * 漏清 hour_stats / ua_stats 时，8 行 reads 被统计成 9）。
 */
const DERIVED_STAT_TABLES = ["read_stats", "message_read_stats", "hour_stats", "ua_stats"] as const;

/**
 * 全部按 (date, wx_id) 聚合的统计表；比上一表多一张 registration_stats（写入时自增，不可从 reads 重算）。
 * 导出给删除用户与孤儿清理路径复用：任何"删用户"或"清孤儿"的实现漏掉其中一张表，
 * 那张表里的幽灵行就永远没人清了。
 */
export const STAT_TABLES = ["registration_stats", ...DERIVED_STAT_TABLES] as const;

/**
 * UA → 客户端类别的 SQL 表达式，**要求 reads 别名为 r**（回填与单条消息汇总共用）。
 * 判定顺序与前端 uaKind() 逐条对应（微信内置优先，否则 Windows 上的微信客户端会被算成桌面端）；
 * SQLite 的 LIKE 对 ASCII 大小写不敏感，正好等价于前端的 /i。
 * 只接受固定别名、不接收列名参数：这段字符串要拼进 SQL，不能让它碰到任何外部输入。
 */
export const UA_KIND_SQL = `CASE
           WHEN r.user_agent LIKE '%MicroMessenger%' THEN 'wechat'
           WHEN r.user_agent LIKE '%iPhone%' OR r.user_agent LIKE '%iPad%' THEN 'ios'
           WHEN r.user_agent LIKE '%Android%' THEN 'android'
           WHEN r.user_agent LIKE '%Windows%' OR r.user_agent LIKE '%Macintosh%' OR r.user_agent LIKE '%Linux%' THEN 'desktop'
           ELSE 'other'
         END`;

type StatsCursor = { rid: number; ts: string };

/**
 * 读取游标。新格式 `rowid|timestamp`：rowid 随插入单调递增，杜绝秒级精度导致的同秒漏统计。
 * 兼容旧格式（纯 timestamp，无 |）：换算为「该秒及之前」的最大 rowid
 * （即旧游标的已完成边界），此后新写入的行按 rowid 增量补计。
 */
export function getCursor(): StatsCursor {
  const row = sqlite.query("SELECT value FROM meta WHERE key = ?").get(CURSOR_KEY) as
    | { value: string }
    | undefined;
  const v = row?.value ?? "";
  const sep = v.indexOf("|");
  if (sep > 0) {
    const rid = Number(v.slice(0, sep));
    const ts = v.slice(sep + 1);
    if (Number.isSafeInteger(rid) && rid >= 0 && ts !== "") return { rid, ts };
  } else if (v !== "") {
    const r = sqlite
      .query("SELECT MAX(rowid) AS rid FROM reads WHERE timestamp <= ?")
      .get(v) as { rid: number | null };
    if (r.rid !== null) return { rid: r.rid, ts: v };
  }
  return { rid: 0, ts: EPOCH };
}

/** 在当前事务内聚合 rowid > rid 的行并推进游标（调用方负责开启事务与复用检测） */
function aggregateSince(rid: number): void {
  sqlite
    .query(
      `INSERT INTO read_stats (date, wx_id, count)
       SELECT substr(r.timestamp, 1, 10), m.wx_id, COUNT(*)
       FROM reads r JOIN messages m ON m.id = r.id
       WHERE r.rowid > ?
       GROUP BY 1, 2
       ON CONFLICT (date, wx_id) DO UPDATE SET count = count + excluded.count`,
    )
    .run(rid);

  sqlite
    .query(
      `INSERT INTO message_read_stats (date, wx_id, count)
       SELECT d.date, d.wx_id, COUNT(*)
       FROM (
         SELECT DISTINCT substr(r.timestamp, 1, 10) date, m.wx_id, r.id
         FROM reads r JOIN messages m ON m.id = r.id
         WHERE r.rowid > ?
       ) d
       GROUP BY d.date, d.wx_id
       ON CONFLICT (date, wx_id) DO UPDATE SET count = count + excluded.count`,
    )
    .run(rid);

  /* 总览用的两维预聚合（v8）。与上面两张表同一个游标、同一个事务，
   * 所以不新增任务也不新增水位线：崩溃即整体回滚，不会重复累计。
   * hour 取 substr(timestamp,12,2) —— reads.timestamp 是 UTC 的
   * "YYYY-MM-DD HH:MM:SS"，与 date 维度同一时区口径，展示层再按语言偏移量换算。 */
  sqlite
    .query(
      `INSERT INTO hour_stats (date, wx_id, hour, count)
       SELECT substr(r.timestamp, 1, 10), m.wx_id, CAST(substr(r.timestamp, 12, 2) AS INTEGER), COUNT(*)
       FROM reads r JOIN messages m ON m.id = r.id
       WHERE r.rowid > ?
       GROUP BY 1, 2, 3
       ON CONFLICT (date, wx_id, hour) DO UPDATE SET count = count + excluded.count`,
    )
    .run(rid);

  /* 客户端分桶（v8）。判定表达式见 UA_KIND_SQL —— 它和 /reads/:id/data 的
   * 单条消息汇总共享同一份定义，两处算出不同的类别就是数据事故。 */
  sqlite
    .query(
      `INSERT INTO ua_stats (date, wx_id, kind, count)
       SELECT substr(r.timestamp, 1, 10), m.wx_id, ${UA_KIND_SQL}, COUNT(*)
       FROM reads r JOIN messages m ON m.id = r.id
       WHERE r.rowid > ?
       GROUP BY 1, 2, 3
       ON CONFLICT (date, wx_id, kind) DO UPDATE SET count = count + excluded.count`,
    )
    .run(rid);

  // 事务内（写入锁）重新取游标，避免事务执行期间新写入的 reads
  // 被本次统计但游标未推进，下次运行重复累计
  const maxRow = sqlite
    .query("SELECT MAX(rowid) AS rid, MAX(timestamp) AS m FROM reads")
    .get() as { rid: number | null; m: string | null };
  const next =
    maxRow.rid !== null && maxRow.m !== null ? `${maxRow.rid}|${maxRow.m}` : `${rid}|${EPOCH}`;
  sqlite
    .query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(CURSOR_KEY, next);
}

/**
 * 增量回填派生滚表（DERIVED_STAT_TABLES 的四张表）。游标与统计更新在同一事务内，
 * 进程崩溃也不会重复累计。
 */
export function backfillStats(): number {
  const raw = (sqlite.query("SELECT value FROM meta WHERE key = ?").get(CURSOR_KEY) as
    | { value: string }
    | undefined)?.value ?? "";
  const cur = getCursor();
  // 旧格式游标：立即把换算结果物化为复合格式，使 rowid 边界先于后续写入固定下来
  // （否则惰性重算会在每次调用时把新写入的同秒行吞进换算边界）
  if (raw !== "" && !raw.includes("|")) {
    sqlite
      .query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(CURSOR_KEY, `${cur.rid}|${cur.ts}`);
  }
  const head = sqlite
    .query("SELECT MAX(rowid) AS rid, MAX(timestamp) AS m FROM reads")
    .get() as { rid: number | null; m: string | null };
  // 无新行且无时间越界（潜在复用迹象）时直接返回
  if (head.rid === null || (head.rid <= cur.rid && (head.m ?? EPOCH) <= cur.ts)) return 0;

  return sqlite.transaction(() => {
    // rowid 复用检测：正常写入时 rowid 与 timestamp 同序；
    // 若游标边界内出现晚于游标时间的行，说明大面积删除导致 rowid 复用，
    // 增量游标已不可信 → 清空统计表全量重算。
    const reused = sqlite
      .query("SELECT COUNT(*) AS n FROM reads WHERE rowid <= ? AND timestamp > ?")
      .get(cur.rid, cur.ts) as { n: number };
    if (reused.n > 0) {
      // 必须清全部派生表：漏一张就会被 aggregateSince(0) 重算成「旧值 + 全量」
      for (const table of DERIVED_STAT_TABLES) {
        sqlite.query(`DELETE FROM ${table}`).run();
      }
      aggregateSince(0);
    } else {
      aggregateSince(cur.rid);
    }
    return 0;
  })();
}

/**
 * 回收非当日（陈旧）的 IP 定位计数。
 *
 * 只清理「geo_date 不是今天 UTC」且「仍有残留计数」的行，因此幂等、无写放大，
 * 在进程启动时执行也不会重置当日正在使用的配额（无条件清零会让「重启一次 = 配额加满」，
 * 可被反复重启无限次绕过配额并持续外呼第三方定位接口）。
 *
 * 配额的正确性不依赖本函数：请求路径由 geoUsedToday()（惰性跨天归零）与
 * /reads/:id/geo 占额 SQL 的 CASE 分支保证，这里只是把陈旧数值物理回收掉。
 */
export function recycleStaleGeoCounts(): void {
  sqlite.query("UPDATE users SET geo_count = 0 WHERE geo_date <> ? AND geo_count > 0").run(utcDate());
}

/**
 * 每日清理：僵尸用户（按管理后台保留策略）、过期会话、>30 天审计、
 * 7 天前孤儿 reads、FTS rebuild、陈旧定位计数回收。
 *
 * 僵尸用户清理单独成事务，且必须排在 FTS rebuild 之前：
 * 它删除的 messages 会逐行触发 messages_ad 触发器，之后再 rebuild 一次即可收敛索引。
 */
export function dailyCleanup(): void {
  const purged = purgeIdleUsers();
  if (purged.deleted > 0) {
    console.log(
      `[cleanup] 自动清理僵尸用户 ${purged.deleted} 个（从未注册 ${purged.never} / 长期沉寂 ${purged.dormant}）` +
        (purged.truncated ? "，已达单次上限，剩余留待下次" : ""),
    );
  }

  sqlite.transaction(() => {
    // 清理因外部工具 / 旧版服务（未开启 foreign_keys）删除用户而残留的孤儿统计行。
    // 关键不对称：backfillStats 在检测到大量删除时会全量重建派生表，
    // 那些表里的孤儿行随之自然消失；但 registration_stats 不参与重建，其孤儿行会永久残留。
    // 故这里对全部统计表（STAT_TABLES 是它们的并集）统一显式清理，
    // 保证「注册消息排行榜」与总览都不残留已删用户。
    for (const t of STAT_TABLES) {
      sqlite.query(`DELETE FROM ${t} WHERE wx_id NOT IN (SELECT wx_id FROM users)`).run();
    }
    sqlite.query("DELETE FROM sessions WHERE expires_at <= ?").run(utcDaysAgo(0));
    if (AUDIT_RETENTION_DAYS > 0) {
      sqlite.query("DELETE FROM audit_logs WHERE timestamp < ?").run(utcDaysAgo(AUDIT_RETENTION_DAYS));
    }
    sqlite
      .query("DELETE FROM reads WHERE timestamp < ? AND id NOT IN (SELECT id FROM messages)")
      .run(utcDaysAgo(7));
    sqlite.query("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')").run();
    recycleStaleGeoCounts();
  })();
}
