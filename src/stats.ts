import { sqlite } from "./db";

const CURSOR_KEY = "stats_cursor";
const EPOCH = "0000-00-00 00:00:00";

export function getCursor(): string {
  const row = sqlite.query("SELECT value FROM meta WHERE key = ?").get(CURSOR_KEY) as
    | { value: string }
    | undefined;
  return row?.value ?? EPOCH;
}

/**
 * 增量回填 read_stats / message_read_stats。游标与统计更新在同一事务内，
 * 进程崩溃也不会重复累计。
 */
export function backfillStats(): number {
  const cursor = getCursor();
  const maxRow = sqlite.query("SELECT MAX(timestamp) m FROM reads").get() as { m: string | null };
  if (!maxRow.m || maxRow.m <= cursor) return 0;

  return sqlite.transaction(() => {
    sqlite
      .query(
        `INSERT INTO read_stats (date, wx_id, count)
         SELECT substr(r.timestamp, 1, 10), m.wx_id, COUNT(*)
         FROM reads r JOIN messages m ON m.id = r.id
         WHERE r.timestamp > ?
         GROUP BY 1, 2
         ON CONFLICT (date, wx_id) DO UPDATE SET count = count + excluded.count`,
      )
      .run(cursor);

    sqlite
      .query(
        `INSERT INTO message_read_stats (date, wx_id, count)
         SELECT d.date, d.wx_id, COUNT(*)
         FROM (
           SELECT DISTINCT substr(r.timestamp, 1, 10) date, m.wx_id, r.id
           FROM reads r JOIN messages m ON m.id = r.id
           WHERE r.timestamp > ?
         ) d
         GROUP BY d.date, d.wx_id
         ON CONFLICT (date, wx_id) DO UPDATE SET count = count + excluded.count`,
      )
      .run(cursor);

    sqlite
      .query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(CURSOR_KEY, maxRow.m);
    return 0;
  })();
}

/** 每日清理：过期会话、>30 天审计、7 天前孤儿 reads、FTS rebuild */
export function dailyCleanup(): void {
  const daysAgo = (days: number): string => {
    const d = new Date(Date.now() + 8 * 3600 * 1000 - days * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  };

  sqlite.transaction(() => {
    sqlite.query("DELETE FROM sessions WHERE expires_at <= ?").run(daysAgo(0));
    sqlite.query("DELETE FROM audit_logs WHERE timestamp < ?").run(daysAgo(30));
    sqlite
      .query("DELETE FROM reads WHERE timestamp < ? AND id NOT IN (SELECT id FROM messages)")
      .run(daysAgo(7));
    sqlite.query("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')").run();
    // 每日 0 点（北京时间）刷新 IP 定位配额：兜底清零（请求路径另有惰性跨天归零）
    sqlite.query("UPDATE users SET geo_count = 0").run();
  })();
}
