// bun test 预载：所有测试共享内存库，避免误写仓库内 data.db。
// 必须在 config.ts（读取 DB_PATH 的模块）被任何测试文件导入前生效。
process.env.DB_PATH = ":memory:";
