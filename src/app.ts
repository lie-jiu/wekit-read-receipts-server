import { Hono } from "hono";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { HSTS_HEADER, MAX_BODY_BYTES, SECURITY_HEADERS } from "./config";
import { isSecureRequest } from "./auth";
import { rateLimit } from "./rate-limit";
import { trackingApp } from "./routes/tracking";
import { authApp } from "./routes/auth";
import { messagesApp } from "./routes/messages";
import { readsApp } from "./routes/reads";
import { statsApp } from "./routes/stats";
import { adminApp } from "./routes/admin";
import { accountApp } from "./routes/account";

const app = new Hono();

/**
 * 安全头：注册在最外层，且统一在 next() 之后写入。
 * 内层中间件会重建响应对象（etag 的 304 会剔除大部分头、compress 会用压缩流替换 body），
 * 放在 next() 之前设置会被这些重建动作丢掉；next() 之后写入 c.res.headers 则一定生效。
 */
app.use("*", async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  // HSTS 只在确认 HTTPS 时下发：裸 HTTP 部署下发送会把浏览器锁死成强制 HTTPS
  if (isSecureRequest(c)) {
    for (const [k, v] of Object.entries(HSTS_HEADER)) c.header(k, v);
  }
});

/** 304 响应保留的头：默认只留 6 个，这里补上安全头，避免条件命中时安全策略被连带剔除 */
const RETAINED_304_HEADERS = [
  "cache-control",
  "content-location",
  "date",
  "etag",
  "expires",
  "vary",
  "content-security-policy",
  ...Object.keys(SECURITY_HEADERS).map((k) => k.toLowerCase()),
  ...Object.keys(HSTS_HEADER).map((k) => k.toLowerCase()),
];

/**
 * 压缩与条件请求。注册顺序是刻意的：
 *   compress 在外层、etag 在内层 —— 响应阶段 etag 先跑，基于**未压缩**内容生成强 ETag；
 *   随后 compress 压缩 body 并自动把 ETag 降级为弱 ETag（W/"…"），这正是 HTTP 对
 *   「同一资源的不同传输编码」所要求的语义。反过来顺序会让 ETag 随客户端是否支持
 *   gzip 而变化，同一资源产出两个不同的强 ETag。
 *
 * compress 仅限 Bun 自托管：Workers 上响应还会被 workerd/边缘自动压缩一次，
 * 叠加 hono compress 会产生双重 gzip（浏览器解一层后仍是二进制，页面整体乱码）。
 * Workers 的响应压缩交给平台，gzip 后 HTML 省约 73–75% 的效果不变。
 */
if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
  app.use("*", compress());
}
app.use("*", etag({ retainedHeaders: RETAINED_304_HEADERS }));

/**
 * 请求体上限。Bun 模式下 Bun.serve 的 maxRequestBodySize 已在更早阶段拦截，这里属冗余兜底；
 * Workers 模式没有等价配置（平台上限 100MB），公开端点 /pixel、/count、/register 防内存/CPU
 * 放大必须由应用层承担。仅校验 content-length 头（分块请求无该头，由平台自身上限兜底）。
 */
app.use("*", async (c, next) => {
  const len = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return c.json({ error: "payload too large" }, 413);
  }
  await next();
});

/* /auth/* 限流须在 /auth/status 之前注册，保证所有认证端点统一受 5/分 限制 */
app.use("/auth/*", rateLimit("auth"));
app.use("/reads/:id/geo", rateLimit("geo"));
app.use("/admin/*", rateLimit("admin"));

/* 按业务职责挂载子路由 */
app.route("/", trackingApp);
app.route("/", authApp);
app.route("/", messagesApp);
app.route("/", readsApp);
app.route("/", statsApp);
app.route("/", adminApp);
app.route("/", accountApp);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
