import { Hono } from "hono";
import { CSP } from "../config";
import { getSessionUser } from "../auth";
import { sqlite } from "../db";
import { maskContent, maskWxId, utcDate } from "../utils";
import { requireUserOr } from "../http-helpers";
import { leaderboardPage } from "../pages";

/** 排行榜 JSON / 排行榜页面 */
export const statsApp = new Hono();

const LEADERBOARD_TABLES: Record<string, string> = {
  reg: "registration_stats",
  read: "read_stats",
  msg: "message_read_stats",
};

statsApp.get("/leaderboard", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const me = getSessionUser(c)!;
  const metric = c.req.query("metric") ?? "reg";
  const scope = c.req.query("scope") ?? "total";
  if (!["reg", "read", "msg"].includes(metric) || !["day", "total"].includes(scope)) {
    return c.json({ error: "invalid params" }, 400);
  }

  // 注册/已读榜：统计表（按 wx_id 聚合）；消息榜：按消息实时聚合（统计表无消息维度）
  if (metric === "msg") {
    const dayCond = scope === "day" ? "AND r.timestamp >= ? " : "";
    const params: Array<string> = scope === "day" ? [utcDate() + " 00:00:00"] : [];
    const rows = sqlite
      .query(
        `SELECT m.id, m.wx_id, m.content, COUNT(DISTINCT r.ip) AS total
         FROM messages m LEFT JOIN reads r ON r.id = m.id ${dayCond}
         GROUP BY m.id ORDER BY total DESC, m.wx_id ASC, m.id ASC LIMIT 10`,
      )
      .all(...params) as Array<{ id: string; wx_id: string; content: string; total: number }>;
    return c.json(
      rows.map((r) => ({
        id: r.id,
        wxId: maskWxId(r.wx_id),
        content: maskContent(r.content),
        count: r.total,
        me: r.wx_id === me.wxId,
      })),
    );
  }

  const table = LEADERBOARD_TABLES[metric];
  const where = scope === "day" ? " WHERE date = ?" : "";
  const params: Array<string> = scope === "day" ? [utcDate()] : [];
  const rows = sqlite
    .query(`SELECT wx_id, SUM(count) AS total FROM ${table}${where} GROUP BY wx_id ORDER BY total DESC LIMIT 10`)
    .all(...params) as Array<{ wx_id: string; total: number }>;

  return c.json(rows.map((r) => ({ wxId: maskWxId(r.wx_id), count: r.total, me: r.wx_id === me.wxId })));
});

statsApp.get("/rank", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(leaderboardPage({ wxId: user.wxId, level: user.level }));
});
