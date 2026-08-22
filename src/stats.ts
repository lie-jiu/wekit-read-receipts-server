import { sqlite } from "./db";
import { AUDIT_RETENTION_DAYS } from "./config";

const CURSOR_KEY = "stats_cursor";
const EPOCH = "0000-00-00 00:00:00";

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
 * 增量回填 read_stats / message_read_stats。游标与统计更新在同一事务内，
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
      sqlite.query("DELETE FROM read_stats").run();
      sqlite.query("DELETE FROM message_read_stats").run();
      aggregateSince(0);
    } else {
      aggregateSince(cur.rid);
    }
    return 0;
  })();
}

/** 每日清理：过期会话、>30 天审计、7 天前孤儿 reads、FTS rebuild */
export function dailyCleanup(): void {
  const daysAgo = (days: number): string => {
    const d = new Date(Date.now() - days * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  };

  sqlite.transaction(() => {
    sqlite.query("DELETE FROM sessions WHERE expires_at <= ?").run(daysAgo(0));
    if (AUDIT_RETENTION_DAYS > 0) {
      sqlite.query("DELETE FROM audit_logs WHERE timestamp < ?").run(daysAgo(AUDIT_RETENTION_DAYS));
    }
    sqlite
      .query("DELETE FROM reads WHERE timestamp < ? AND id NOT IN (SELECT id FROM messages)")
      .run(daysAgo(7));
    sqlite.query("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')").run();
    // 每日 0 点（UTC）刷新 IP 定位配额：兜底清零（请求路径另有惰性跨天归零）
    sqlite.query("UPDATE users SET geo_count = 0").run();
  })();
}
