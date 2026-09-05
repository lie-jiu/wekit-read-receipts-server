// bun test 预载：所有测试共享内存库，避免误写仓库内 data.db。
// 必须在 config.ts（读取 DB_PATH 的模块）被任何测试文件导入前生效。
process.env.DB_PATH = ":memory:";
// 测试不必承受 100k 迭代的哈希开销（默认值见 config.ts）；显式设置的开发环境不覆盖
process.env.PBKDF2_ITERATIONS ??= "2000";

// 注入 bun:sqlite 后端（业务代码不再隐式开库，见 src/db.ts 的后端注入说明）
import { ensureBunSqlite } from "../src/backends/bun-sqlite";
ensureBunSqlite(process.env.DB_PATH);
