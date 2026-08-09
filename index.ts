import { migrate, sqlite } from "./src/db";
import { backfillStats, dailyCleanup } from "./src/stats";
import app from "./src/app";
import { BIND_HOST, PORT, TLS_CERT, TLS_KEY } from "./src/config";

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

dailyCleanup();
backfillStats();

Bun.cron("*/10 * * * *", backfillStats);
Bun.cron("@daily", dailyCleanup);
