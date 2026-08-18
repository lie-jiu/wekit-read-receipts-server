import { Hono } from "hono";
import { SECURITY_HEADERS } from "./config";
import { rateLimit } from "./rate-limit";
import { trackingApp } from "./routes/tracking";
import { authApp } from "./routes/auth";
import { messagesApp } from "./routes/messages";
import { readsApp } from "./routes/reads";
import { statsApp } from "./routes/stats";
import { adminApp } from "./routes/admin";
import { accountApp } from "./routes/account";

const app = new Hono();

app.use("*", async (c, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
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
