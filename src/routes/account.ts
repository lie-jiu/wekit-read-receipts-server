import { Hono } from "hono";
import { CSP } from "../config";
import { audit, getSessionUser, requireUser } from "../auth";
import { sqlite } from "../db";
import { clientIp, isValidIp } from "../rate-limit";
import { clampLimit, queryAudit } from "../http-helpers";
import { utcNow } from "../utils";
import { accountPage } from "../pages";

/** 用户账户设置页：账户 IP 黑名单管理 + 修改密码 / 退出登录 / 清除我的（仅本人，requireUser 鉴权） */
export const accountApp = new Hono();

accountApp.get("/account", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(accountPage({ wxId: user.wxId, level: user.level }));
});

/* ── 账户 IP 黑名单（仅本人；仅支持自定义 IP，不支持 action:current 一键拉黑） ── */

accountApp.get("/account/ip-block", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const rows = sqlite
    .query("SELECT ip, created_at FROM ip_block_account WHERE wx_id = ? ORDER BY created_at DESC LIMIT 1000")
    .all(user.wxId) as Array<{ ip: string; created_at: string }>;
  return c.json({ count: rows.length, ips: rows.map((r) => ({ ip: r.ip, createdAt: r.created_at })) });
});

accountApp.post("/account/ip-block", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  let body: { ip?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const ip = typeof body.ip === "string" ? body.ip : "";
  if (!isValidIp(ip)) return c.json({ error: "invalid ip" }, 400);
  const res = sqlite
    .query("INSERT OR IGNORE INTO ip_block_account (wx_id, ip, created_at) VALUES (?, ?, ?)")
    .run(user.wxId, ip, utcNow());
  if (res.changes === 0) return c.json({ error: "exists" }, 409);
  audit(user.wxId, "account_block_add", ip, clientIp(c));
  return c.json({ ok: true, ip });
});

accountApp.delete("/account/ip-block", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const ip = c.req.query("ip") ?? "";
  if (!isValidIp(ip)) return c.json({ error: "invalid ip" }, 400);
  const res = sqlite.query("DELETE FROM ip_block_account WHERE wx_id = ? AND ip = ?").run(user.wxId, ip);
  if (res.changes === 0) return c.json({ error: "not found" }, 404);
  audit(user.wxId, "account_block_remove", ip, clientIp(c));
  return c.json({ ok: true });
});

/**
 * 账户页要、但只有服务器算得出的两个量。刻意不塞进 /me：
 * /me 每次进应用都要问（引导路径），这两个只在账户页用，为一个低频数字给高频请求加一次查询不划算。
 *
 * totalReads 走实时计数而不是 read_stats 滚表 —— 滚表只增不减（消息被配额淘汰后它的行仍然在），
 * 而这里的语义是「清除我的消息会连带删掉多少条已读记录」，必须与 DELETE /messages 真正删掉的行数一致。
 * reads 的主键是 (id, ip)，IN 子查询按 id 前缀走索引，条数上界就是本人的消息配额，所以便宜。
 */
accountApp.get("/account/stats", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const row = sqlite
    .query("SELECT COUNT(*) AS n FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)")
    .get(user.wxId) as { n: number };
  return c.json({ totalReads: row.n, viewerIp: clientIp(c) });
});

/**
 * 本人操作留痕。管理员端有 /admin/audit，但普通用户不该因此就只能看到空白 ——
 * 改密码、拉黑 IP、清除消息这些动作正好是他们最需要回看自己做过什么的地方。
 * wxId 一律取会话里的值，不接受查询参数，避免变成探测他人的口子。
 */
accountApp.get("/account/audit", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const pageSize = clampLimit(Number(c.req.query("pageSize") ?? 50), 1, 200);
  const page = Math.max(Math.floor(Number(c.req.query("page") ?? 1)) || 1, 1);
  return c.json(queryAudit({ wxId: user.wxId, page, pageSize }));
});
