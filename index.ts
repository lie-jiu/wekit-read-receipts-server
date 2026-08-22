import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { migrate, sqlite } from "./src/db";
import { backfillStats, dailyCleanup } from "./src/stats";
import app from "./src/app";
import { BIND_HOST, PORT, TLS_CERT, TLS_KEY } from "./src/config";
import { PID_FILE } from "./scripts/manage/platform";

migrate();
console.log("SQLite " + (sqlite.query("SELECT sqlite_version() v").get() as { v: string }).v);

const tls = TLS_CERT && TLS_KEY
  ? { cert: await Bun.file(TLS_CERT).text(), key: await Bun.file(TLS_KEY).text() }
  : undefined;

const server = Bun.serve({
  hostname: BIND_HOST,
  port: PORT,
  fetch: app.fetch,
  tls,
});
console.log(`listening on http://localhost:${server.port}`);

/* 写 PID 文件供 manage stop 精确停止（Windows 下避免按命令行模糊匹配误杀其它 bun 进程） */
try {
  mkdirSync(dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  const clearPid = () => rmSync(PID_FILE, { force: true });
  process.on("exit", clearPid);
  process.on("SIGINT", () => {
    clearPid();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    clearPid();
    process.exit(0);
  });
} catch (e) {
  console.error("[pid] 写入 PID 文件失败:", e);
}

dailyCleanup();
backfillStats();

Bun.cron("*/10 * * * *", backfillStats);
Bun.cron("@daily", dailyCleanup);
