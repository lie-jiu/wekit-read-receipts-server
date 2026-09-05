/**
 * Cloudflare Workers 入口。
 *
 * 架构：Worker 仅把请求转发到名为 "singleton" 的单个 Durable Object 实例，
 * Hono 应用与全部业务逻辑整体运行在该 DO 内——
 *   - DO 内置 SQLite（ctx.storage.sql）承载数据库，同步 API 与 bun:sqlite 语义一致（见 do-sqlite.ts）；
 *   - 单实例令进程内限流 / 定位缓存恢复「全局唯一进程」语义；
 *   - Cron Triggers 经 /internal/cron/* 触发定时任务，以 CRON_KEY 鉴权，外部请求无法调用。
 *
 * 部署：wrangler deploy（配置见 wrangler.jsonc）；机密用 `wrangler secret put` 注入
 * （ADMIN / INVITE_CODE / CRON_KEY 等），vars 与 secrets 会自动出现在 process.env。
 */
import app from "../src/app";
import { migrate, setSqliteBackend } from "../src/db";
import { setFormulaStore } from "../src/levels";
import { backfillStats, dailyCleanup } from "../src/stats";
import { timingSafeEqual } from "../src/utils";
import { doSqlite } from "./do-sqlite";
import { formulaDbStore } from "./levels-env-db";

export type Env = {
  /** Durable Object 绑定（wrangler.jsonc durable_objects.bindings） */
  APP: DurableObjectNamespace;
  /** 定时任务触发密钥：`wrangler secret put CRON_KEY`；未设置时内部 cron 端点拒绝一切请求 */
  CRON_KEY?: string;
} & Record<string, string>;

const CRON_PREFIX = "/internal/cron/";

export class App {
  private initialized = false;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  /** 惰性初始化：首次请求前完成（同步段执行，不受后续 await 交错影响） */
  private init(): void {
    if (this.initialized) return;
    setSqliteBackend(doSqlite(this.ctx.storage));
    setFormulaStore(formulaDbStore(this.ctx.storage));
    migrate();
    this.initialized = true;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith(CRON_PREFIX)) return this.handleCron(req, url);
    this.init();
    /* DO 的 ctx 缺 passThroughOnException，Hono 的 ExecutionContext 形状由适配对象补齐；
     * 本项目不使用 c.executionCtx，waitUntil 也无调用方，转发即可 */
    return app.fetch(req, this.env, {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    });
  }

  /** 定时任务：仅接受携带 CRON_KEY 的内部转发请求 */
  private handleCron(req: Request, url: URL): Response {
    const key = (this.env.CRON_KEY ?? "").trim();
    const given = req.headers.get("x-cron-key") ?? "";
    if (req.method !== "POST" || key === "" || !timingSafeEqual(given, key)) {
      return new Response("not found", { status: 404 });
    }
    this.init();
    const kind = url.pathname.slice(CRON_PREFIX.length);
    if (kind === "daily") {
      dailyCleanup();
    } else if (kind === "stats") {
      backfillStats();
    } else {
      return new Response("not found", { status: 404 });
    }
    return Response.json({ ok: true });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    /* idFromName("singleton")：全账户唯一实例，限流与缓存才有全局语义 */
    return env.APP.get(env.APP.idFromName("singleton")).fetch(req);
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    /* 与 wrangler.jsonc triggers.crons 对应：每 10 分钟回填统计，每日 0 点清理 */
    const kind = event.cron === "0 0 * * *" ? "daily" : "stats";
    const stub = env.APP.get(env.APP.idFromName("singleton"));
    ctx.waitUntil(
      stub
        .fetch(`https://do.internal${CRON_PREFIX}${kind}`, {
          method: "POST",
          headers: { "x-cron-key": (env.CRON_KEY ?? "").trim() },
        })
        .then((r) => {
          if (!r.ok) console.error(`[cron] ${kind} 失败: HTTP ${r.status}`);
        }),
    );
  },
};
