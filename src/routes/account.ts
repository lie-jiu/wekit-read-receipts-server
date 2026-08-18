import { Hono } from "hono";
import { CSP } from "../config";
import { audit, getSessionUser, requireUser } from "../auth";
import { sqlite } from "../db";
import { clientIp, isValidIp } from "../rate-limit";
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
