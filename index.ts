import { migrate, sqlite } from "./src/db";
import { backfillStats, dailyCleanup } from "./src/stats";
import app from "./src/app";
import { PORT } from "./src/config";

migrate();
console.log("SQLite " + (sqlite.query("SELECT sqlite_version() v").get() as { v: string }).v);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  fetch: app.fetch,
});
console.log(`listening on http://localhost:${server.port}`);

dailyCleanup();
backfillStats();

Bun.cron("*/10 * * * *", backfillStats);
Bun.cron("@daily", dailyCleanup);
