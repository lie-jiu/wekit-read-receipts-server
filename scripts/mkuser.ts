import { sqlite, migrate } from "../src/db";
import { hashPassword } from "../src/auth";
import { chinaNow } from "../src/utils";

const [wxId, password, levelArg] = process.argv.slice(2);
const level = levelArg === undefined ? 1 : Number(levelArg);

if (!wxId || !password || password.length < 8 || !Number.isInteger(level) || level < 0 || level > 99) {
  console.error("用法: bun run mkuser <wxid> <密码(≥8位)> [level 0-99]");
  process.exit(1);
}

migrate();
sqlite
  .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
  .run(wxId, await hashPassword(password), level, chinaNow());
console.log(`已创建/重置用户 ${wxId} (level=${level})`);
