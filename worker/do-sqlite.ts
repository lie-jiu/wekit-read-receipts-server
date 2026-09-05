import type { SqliteBackend, SqliteStmt } from "../src/db";

/**
 * Durable Objects 内置 SQLite（ctx.storage.sql）后端。
 *
 * 与 bun:sqlite 的语义对齐点：
 *   - 同步 API（exec 立即返回行），业务代码无需 async 化；
 *   - run() 的 changes ← SqlStorageCursor.rowsWritten（游标必须先消费完才是最终值）；
 *   - 事务 ← storage.transactionSync（同步回调，抛异常即回滚；sql.exec 不允许 BEGIN/SAVEPOINT）；
 *   - schema 版本存 meta 表（PRAGMA user_version 在 DO 上不保证可用）。
 *
 * 参数绑定用 ? 占位符，与现有 SQL 完全一致。
 */
export function doSqlite(storage: DurableObjectStorage): SqliteBackend {
  const sql = storage.sql;

  const stmt = (query: string): SqliteStmt => ({
    get: (...params: unknown[]) => sql.exec(query, ...params).toArray()[0],
    all: (...params: unknown[]) => sql.exec(query, ...params).toArray(),
    run: (...params: unknown[]) => {
      const cursor = sql.exec(query, ...params);
      cursor.toArray(); // 消费完游标，rowsWritten 才是最终写入行数
      return { changes: cursor.rowsWritten };
    },
  });

  return {
    query: stmt,
    prepare: stmt,
    exec: (script) => void sql.exec(script),
    transaction: (fn) => () => storage.transactionSync(fn),
    close: () => {}, // DO 生命周期由平台管理，无显式关闭
    getVersion: () => {
      try {
        const rows = sql.exec("SELECT value FROM meta WHERE key = 'schema_version'").toArray();
        if (rows.length === 0) return 0;
        return Number((rows[0] as { value: string }).value) || 0;
      } catch {
        return 0; // meta 表尚未创建（全新库），从 v1 开始迁移
      }
    },
    setVersion: (version) => {
      sql.exec(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        String(version),
      );
    },
  };
}
