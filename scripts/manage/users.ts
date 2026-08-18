import { migrate, sqlite } from "../../src/db";
import { hashPassword } from "../../src/auth";
import { isValidWxId } from "../../src/utils";

export async function userAdd(wxId: string, password: string, level: number): Promise<void> {
  if (!isValidWxId(wxId)) {
    console.error("wxId 无效：需 1-64 位可打印 ASCII 字符。");
    process.exit(1);
  }
  if (password.length < 8 || password.length > 128) {
    console.error("密码需 8-128 位。");
    process.exit(1);
  }
  migrate();
  const exists = sqlite.query("SELECT 1 FROM users WHERE wx_id = ?").get(wxId);
  if (exists) {
    console.error(`用户 ${wxId} 已存在（可用 user level 修改等级 / user pass 重置密码）。`);
    process.exit(1);
  }
  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(wxId, await hashPassword(password), level, new Date().toISOString().slice(0, 19).replace("T", " "));
  console.log(`已创建用户 ${wxId}（level=${level}）。`);
}

export function userList(): void {
  migrate();
  const rows = sqlite
    .query("SELECT wx_id, level, message_count, created_at FROM users ORDER BY created_at")
    .all() as { wx_id: string; level: number; message_count: number; created_at: string }[];
  if (!rows.length) {
    console.log("暂无用户。");
    return;
  }
  console.log("wx_id\tlevel\t消息数\t创建时间");
  for (const r of rows) console.log(`${r.wx_id}\t${r.level}\t${r.message_count}\t${r.created_at}`);
}

export function userDelete(wxId: string): void {
  migrate();
  const n = sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(wxId);
    sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
    return sqlite.query("DELETE FROM users WHERE wx_id = ?").run(wxId).changes;
  })();
  if (!n) {
    console.error(`用户 ${wxId} 不存在。`);
    process.exit(1);
  }
  console.log(`已删除用户 ${wxId} 及其消息/会话。`);
}

export function userLevel(wxId: string, level: number): void {
  migrate();
  const r = sqlite.query("UPDATE users SET level = ? WHERE wx_id = ?").run(level, wxId);
  if (!r.changes) {
    console.error(`用户 ${wxId} 不存在。`);
    process.exit(1);
  }
  console.log(`已设置 ${wxId} level=${level}（level 0 = 仅禁止注册新消息，数据保留）。`);
}

export async function userPass(wxId: string, password: string): Promise<void> {
  if (password.length < 8 || password.length > 128) {
    console.error("密码需 8-128 位。");
    process.exit(1);
  }
  migrate();
  const r = sqlite.query("UPDATE users SET password_hash = ? WHERE wx_id = ?").run(await hashPassword(password), wxId);
  if (!r.changes) {
    console.error(`用户 ${wxId} 不存在。`);
    process.exit(1);
  }
  sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
  console.log(`已重置 ${wxId} 的密码（旧会话已失效）。`);
}
