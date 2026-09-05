import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBunSqlite } from "./src/backends/bun-sqlite";
import { envFileStore } from "./src/levels-env-file";
import { setFormulaStore } from "./src/levels";
import { migrate, sqlite } from "./src/db";
import { backfillStats, dailyCleanup } from "./src/stats";
import app from "./src/app";
import {
  BIND_HOST,
  MAX_BODY_BYTES,
  PORT,
  SHUTDOWN_TIMEOUT_MS,
  TLS_CERT,
  TLS_KEY,
} from "./src/config";
import { PID_FILE } from "./scripts/manage/platform";

/* Bun 部署的初始化：本地 SQLite 后端 + .env 文件版公式存储（Workers 由 worker/index.ts 注入对应实现） */
ensureBunSqlite();
setFormulaStore(envFileStore());
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
  maxRequestBodySize: MAX_BODY_BYTES,
  /* Hono 的 app.onError 只能兜住应用层异常，这里是 Bun 层的兜底
   * （TLS 握手、请求解析等尚未进入 Hono 的阶段） */
  error(error) {
    console.error("[server] 未捕获错误:", error);
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
});
console.log(`listening on http://localhost:${server.port}`);

/* 写 PID 文件供 manage stop 精确停止（Windows 下避免按命令行模糊匹配误杀其它 bun 进程） */
let clearPid = (): void => {};
try {
  mkdirSync(dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  clearPid = () => rmSync(PID_FILE, { force: true });
  process.on("exit", clearPid);
} catch (e) {
  console.error("[pid] 写入 PID 文件失败:", e);
}

/* ── 优雅关闭 ── */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] 收到 ${signal}，等待在途请求结束…`);

  // stop() 不带参数才是优雅停止：立即断开空闲 keep-alive 连接，在途请求发完响应后再关。
  // 传 true 是立即强杀所有连接，这里要的是前者。
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), SHUTDOWN_TIMEOUT_MS);
    });
    if ((await Promise.race([server.stop(), timeout])) === "timeout") {
      console.warn(`[shutdown] ${SHUTDOWN_TIMEOUT_MS}ms 内未结束，强制断开剩余连接`);
      await server.stop(true);
    }
  } catch (e) {
    console.error("[shutdown] 停止监听出错:", e);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  // WAL 模式下 close() 会顺带 checkpoint。直接退出虽不丢数据，但下次启动要回放 WAL。
  try {
    sqlite.close();
  } catch (e) {
    console.error("[shutdown] 关闭数据库出错:", e);
  }

  clearPid();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

dailyCleanup();
backfillStats();

Bun.cron("*/10 * * * *", backfillStats);
Bun.cron("@daily", dailyCleanup);
