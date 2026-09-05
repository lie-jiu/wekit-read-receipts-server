import { Database } from "bun:sqlite";
import { DB_PATH } from "../config";
import { getSqliteBackend, setSqliteBackend } from "../db";
import type { SqliteBackend } from "../db";

/**
 * bun:sqlite 后端（Bun 部署专用）。Workers 构建不包含本文件（bun:sqlite 无法在 workerd 中解析）。
 * 打开本地 SQLite 文件并应用与旧版 db.ts 相同的 PRAGMA 配置。
 */
export function openBunSqlite(path: string = DB_PATH): SqliteBackend {
  const db = new Database(path, { create: true });

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA mmap_size = 268435456");
  db.exec("PRAGMA cache_size = -65536");
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("PRAGMA wal_autocheckpoint = 1000");

  return {
    query: (sql) => db.query(sql),
    prepare: (sql) => db.prepare(sql),
    exec: (sql) => db.exec(sql),
    transaction: (fn) => db.transaction(fn),
    close: () => db.close(),
    getVersion: () => (db.query("PRAGMA user_version").get() as { user_version: number }).user_version,
    setVersion: (version) => db.exec(`PRAGMA user_version = ${version}`),
  };
}

/** 幂等初始化：打开默认库并注入。供所有 Bun 入口（index.ts / 脚本 / 测试预载）调用 */
export function ensureBunSqlite(path: string = DB_PATH): void {
  if (getSqliteBackend()) return;
  setSqliteBackend(openBunSqlite(path));
}
