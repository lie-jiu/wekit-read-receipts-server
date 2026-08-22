import { sqlite, migrate } from "../src/db";
import { hashPassword } from "../src/auth";
import { isValidWxId, utcNow } from "../src/utils";

const [wxIdArg, password, levelArg] = process.argv.slice(2);
const wxId = wxIdArg ?? "";
const level = levelArg === undefined ? 1 : Number(levelArg);

if (
  !isValidWxId(wxId) ||
  !password ||
  password.length < 8 ||
  !Number.isInteger(level) ||
  level < 0 ||
  level > 99
) {
  console.error("用法: bun run mkuser <wxid> <密码(≥8位)> [level 0-99]");
  process.exit(1);
}

migrate();
const hash = await hashPassword(password);
const exists = sqlite.query("SELECT 1 FROM users WHERE wx_id = ?").get(wxId);
if (exists) {
  // 重置语义：更新密码与等级，并失效全部旧会话
  sqlite.transaction(() => {
    sqlite.query("UPDATE users SET password_hash = ?, level = ? WHERE wx_id = ?").run(hash, level, wxId);
    sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
  })();
  console.log(`已重置用户 ${wxId} (level=${level})，旧会话已失效`);
} else {
  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(wxId, hash, level, utcNow());
  console.log(`已创建用户 ${wxId} (level=${level})`);
}
