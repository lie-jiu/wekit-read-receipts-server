#!/usr/bin/env bun
/**
 * 从 Cloudflare D1 迁移数据到本地 SQLite（一次性脚本）
 *
 * 迁移范围：users / messages / reads / registration_stats
 * 跳过：sessions（强制重新登录）、audit_logs（本地 schema 需 wx_id/ip，D1 无）
 *       read_stats / message_read_stats（服务启动时 backfillStats 自动重建）
 *
 * 时区：D1 存 UTC，本地存北京时间（UTC+8），SELECT 时统一 +8 小时转换
 *
 * 用法:
 *   CF_ACCOUNT_ID=<账户ID> CF_D1_DATABASE_ID=<数据库ID> CF_API_TOKEN=<令牌> \
 *     bun run migrate-d1
 */

import { migrate, sqlite } from "../src/db";

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID?.trim() ?? "";
const DATABASE_ID = process.env.CF_D1_DATABASE_ID?.trim() ?? "";
const API_TOKEN = process.env.CF_API_TOKEN?.trim() ?? "";

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
  console.error("缺少环境变量：CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_API_TOKEN");
  process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

type Row = Record<string, unknown>;

/** D1 单次查询（带 429/5xx 重试） */
async function d1Query(sql: string, params: (string | number)[] = []): Promise<Row[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) throw new Error(`D1 API HTTP ${res.status} 重试后仍失败`);
      await Bun.sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`D1 API HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      success: boolean;
      errors?: { message: string }[];
      result?: { success: boolean; results: Row[] }[];
    };
    if (!json.success) throw new Error(`D1 错误: ${json.errors?.map((e) => e.message).join(", ") || "未知"}`);
    const r = json.result?.[0];
    if (!r?.success) throw new Error("D1 查询失败");
    return r.results;
  }
}

/** LIMIT/OFFSET 分页拉取整表 */
async function fetchAll(sql: string, params: (string | number)[] = [], pageSize = 1000): Promise<Row[]> {
  const all: Row[] = [];
  let offset = 0;
  for (;;) {
    const rows = await d1Query(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

const clampLevel = (v: unknown): number => Math.max(0, Math.min(99, Number(v) || 1));

const count = (t: string): number =>
  (sqlite.query(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;

migrate();
console.log("本地 schema 就绪。");

console.log("正在从 D1 拉取数据（UTC → 北京时间 +8h）…");

const [users, messages, reads, msgCounts] = await Promise.all([
  fetchAll("SELECT wx_id, password_hash, level, datetime(created_at, '+8 hours') AS created_at FROM users"),
  fetchAll("SELECT id, wx_id, content, datetime(timestamp, '+8 hours') AS timestamp FROM messages"),
  fetchAll("SELECT id, ip, datetime(timestamp, '+8 hours') AS timestamp FROM reads"),
  d1Query("SELECT wx_id, COUNT(*) AS c FROM messages GROUP BY wx_id"),
]);

console.log(`D1 拉取完成: users=${users.length}, messages=${messages.length}, reads=${reads.length}`);

const countMap = new Map<string, number>();
for (const r of msgCounts) countMap.set(String(r.wx_id), Number(r.c ?? 0));

sqlite.exec("PRAGMA foreign_keys = OFF");
sqlite.exec("BEGIN");
try {
  // 幂等：清空目标表（messages 触发器会同步清 FTS）
  for (const t of ["users", "messages", "reads", "registration_stats"]) {
    sqlite.query(`DELETE FROM ${t}`).run();
  }

  const insUser = sqlite.prepare(
    "INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const u of users) {
    insUser.run(
      String(u.wx_id),
      String(u.password_hash),
      clampLevel(u.level),
      countMap.get(String(u.wx_id)) ?? 0,
      String(u.created_at ?? ""),
    );
  }

  const insMsg = sqlite.prepare("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)");
  for (const m of messages) insMsg.run(String(m.id), String(m.wx_id), String(m.content ?? ""), String(m.timestamp));

  const insRead = sqlite.prepare("INSERT OR IGNORE INTO reads (id, ip, timestamp) VALUES (?, ?, ?)");
  for (const r of reads) {
    const ip = String(r.ip ?? "").trim() || "unknown";
    insRead.run(String(r.id), ip.slice(0, 64), String(r.timestamp));
  }

  // registration_stats 从已迁移的 messages 本地重算（与本地日期口径一致）
  const regStats = sqlite
    .query(
      `SELECT substr(timestamp, 1, 10) AS date, wx_id, COUNT(*) AS count
       FROM messages GROUP BY substr(timestamp, 1, 10), wx_id`,
    )
    .all() as { date: string; wx_id: string; count: number }[];
  const insReg = sqlite.prepare("INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, ?)");
  for (const s of regStats) insReg.run(s.date, s.wx_id, s.count);

  sqlite.exec("COMMIT");
} catch (e) {
  sqlite.exec("ROLLBACK");
  throw e;
}
sqlite.exec("PRAGMA foreign_keys = ON");

const integrity = (sqlite.query("PRAGMA integrity_check").all() as { integrity_check: string }[])[0].integrity_check;

console.log("迁移完成：");
console.log(`  users               = ${count("users")}（D1 源: ${users.length}）`);
console.log(`  messages            = ${count("messages")}（D1 源: ${messages.length}）`);
console.log(`  reads               = ${count("reads")}（D1 源: ${reads.length}）`);
console.log(`  registration_stats  = ${count("registration_stats")}（本地按北京时间重算）`);
console.log(`  integrity_check     = ${integrity}`);
console.log("read_stats / message_read_stats 无需迁移，服务启动时自动重建。");
