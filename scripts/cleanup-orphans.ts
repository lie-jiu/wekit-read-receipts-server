#!/usr/bin/env bun
/**
 * 清理孤儿行：删除父用户已不存在的子表记录。
 *
 * 背景：SQLite 的 ON DELETE CASCADE 仅在执行 DELETE 的连接开启
 * `PRAGMA foreign_keys = ON` 时生效。若曾用外部工具 / 旧版服务删除用户，
 * 级联不会触发，会在以下子表留下孤儿行，导致排行榜仍显示已删用户。
 * 本脚本直接按「wx_id 在 users 中已不存在」删除，与连接的外键设置无关。
 *
 * 用法: bun run cleanup-orphans [--dry-run]   （默认执行删除，--dry-run 仅统计）
 */
import { sqlite, migrate } from "../src/db";
import { ensureBunSqlite } from "../src/backends/bun-sqlite";

ensureBunSqlite();

const DRY = process.argv.includes("--dry-run");

// [子表, 关联用户的列名]
const CHILD_TABLES: Array<[string, string]> = [
  ["registration_stats", "wx_id"],
  ["read_stats", "wx_id"],
  ["message_read_stats", "wx_id"],
  ["ip_block_account", "wx_id"],
  ["sessions", "wx_id"],
  ["messages", "wx_id"],
];

migrate();

console.log(DRY ? "[dry-run] 仅统计，不删除" : "开始清理孤儿行...");
console.log(`当前用户数: ${(sqlite.query("SELECT COUNT(*) n FROM users").get() as { n: number }).n}`);

let totalDeleted = 0;
for (const [table, col] of CHILD_TABLES) {
  const orphan = sqlite
    .query(`SELECT COUNT(*) n FROM ${table} c LEFT JOIN users u ON u.wx_id = c.${col} WHERE u.wx_id IS NULL`)
    .get() as { n: number };
  if (orphan.n === 0) {
    console.log(`  ${table}: 0 孤儿 (跳过)`);
    continue;
  }
  if (!DRY) {
    const res = sqlite
      .query(`DELETE FROM ${table} WHERE ${col} IN (SELECT c.${col} FROM ${table} c LEFT JOIN users u ON u.wx_id = c.${col} WHERE u.wx_id IS NULL)`)
      .run();
    totalDeleted += res.changes;
    console.log(`  ${table}: 清理 ${res.changes} 行孤儿`);
  } else {
    console.log(`  ${table}: 将清理 ${orphan.n} 行孤儿`);
    totalDeleted += orphan.n;
  }
}

// reads 无 wx_id 列，按「消息已不存在」清理孤儿已读明细（与用户删除无直接关系，顺带处理）
{
  const orphan = sqlite
    .query("SELECT COUNT(*) n FROM reads r LEFT JOIN messages m ON m.id = r.id WHERE m.id IS NULL")
    .get() as { n: number };
  if (orphan.n > 0) {
    if (!DRY) {
      const res = sqlite.query("DELETE FROM reads WHERE id NOT IN (SELECT id FROM messages)").run();
      totalDeleted += res.changes;
      console.log(`  reads(消息已删): 清理 ${res.changes} 行`);
    } else {
      console.log(`  reads(消息已删): 将清理 ${orphan.n} 行`);
      totalDeleted += orphan.n;
    }
  } else {
    console.log("  reads(消息已删): 0 孤儿 (跳过)");
  }
}

// messages_fts 由 messages 上的触发器维护，删除 messages 后需重建一次以彻底回收空间
if (!DRY && totalDeleted > 0) {
  sqlite.query("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')").run();
}

console.log(DRY ? `\n[dry-run] 预计清理 ${totalDeleted} 行` : `\n完成，共清理 ${totalDeleted} 行孤儿`);
