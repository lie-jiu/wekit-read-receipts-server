import type { FormulaStore } from "../src/levels";

/**
 * meta 表版公式存储（Workers 部署专用）。语义与 .env 文件版一致：空串 = 移除键。
 * meta 表中 stats_cursor / schema_version 为内部键，读取时排除。
 */
export function formulaDbStore(storage: DurableObjectStorage): FormulaStore {
  const sql = storage.sql;

  return {
    read: () => {
      try {
        const rows = sql
          .exec("SELECT key, value FROM meta WHERE key NOT IN ('stats_cursor', 'schema_version')")
          .toArray() as Array<{ key: string; value: string }>;
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      } catch {
        return {}; // meta 表尚未创建（全新库）
      }
    },
    write: (updates) => {
      for (const [key, value] of Object.entries(updates)) {
        if (value.trim() === "") {
          sql.exec("DELETE FROM meta WHERE key = ?", key);
        } else {
          sql.exec(
            "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            key,
            value.trim(),
          );
        }
      }
    },
  };
}
