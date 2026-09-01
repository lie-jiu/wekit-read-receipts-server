import { Hono } from "hono";
import { CSP, ENABLE_GEO, geoQuotaFor, quotaFor, retentionMonthsFor } from "../config";
import { audit, getSessionUser, requireUser } from "../auth";
import { sqlite } from "../db";
import { clientIp } from "../rate-limit";
import { escapeLike } from "../utils";
import { clampLimit, geoUsedToday, requireUserOr } from "../http-helpers";
import { htmlPage } from "../pages";

/** 仪表盘 / 消息列表 / 清空 */
export const messagesApp = new Hono();

messagesApp.get("/", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.redirect("/login");
  c.header("Content-Security-Policy", CSP.DASHBOARD);
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(
    htmlPage({
      wxId: user.wxId,
      level: user.level,
      geo: ENABLE_GEO,
      geoQuota: geoQuotaFor(user.level),
      geoRemaining: Math.max(0, geoQuotaFor(user.level) - geoUsedToday(user)),
      messageQuota: quotaFor(user.level),
      retentionMonths: retentionMonthsFor(user.level),
    }),
  );
});

messagesApp.get("/messages", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const user = getSessionUser(c)!;
  const q = (c.req.query("q") ?? "").trim();
  const limit = clampLimit(Number(c.req.query("limit") ?? 50));
  const offset = Math.max(Math.floor(Number(c.req.query("offset") ?? 0)) || 0, 0);

  // 返回 (WHERE 片段, 参数)，SELECT 与 COUNT 共用同一过滤条件，保证总数与列表口径一致。
  // q>=3 时优先 FTS（短语检索），语法不受支持时退化为 LIKE。
  const filter = (): { cond: string; params: string[] } => {
    if (!q) return { cond: "WHERE m.wx_id = ?", params: [user.wxId] };
    if (q.length >= 3) {
      const phrase = q.replaceAll('"', '""');
      try {
        sqlite
          .query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ? LIMIT 1")
          .get(`"${phrase}"`);
        return {
          cond: "WHERE m.wx_id = ? AND m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)",
          params: [user.wxId, `"${phrase}"`],
        };
      } catch {
        /* FTS 语法不支持，落到 LIKE */
      }
    }
    return {
      cond: "WHERE m.wx_id = ? AND m.content LIKE ? ESCAPE '\\'",
      params: [user.wxId, `%${escapeLike(q)}%`],
    };
  };

  const { cond, params } = filter();
  const rows = sqlite
    .query(
      `SELECT m.id, m.content, m.timestamp, (SELECT COUNT(DISTINCT r.ip) FROM reads r WHERE r.id = m.id) AS read_count
       FROM messages m ${cond} ORDER BY m.timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<{ id: string; content: string; timestamp: string; read_count: number }>;
  const total = (sqlite.query(`SELECT COUNT(*) AS n FROM messages m ${cond}`).get(...params) as { n: number }).n;
  // 总数经响应头返回（数组形状保持不变，旧客户端兼容）
  c.header("X-Total-Count", String(total));
  return c.json(rows.map((r) => ({ id: r.id, content: r.content, reads: r.read_count, timestamp: r.timestamp })));
});

messagesApp.delete("/messages", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(user.wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(user.wxId);
  })();
  audit(user.wxId, "delete_all_messages", null, clientIp(c));
  return c.json({ ok: true });
});

messagesApp.delete("/messages/:wxId", (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const wxId = c.req.param("wxId");
  if (wxId !== user.wxId) return c.json({ error: "forbidden" }, 403);
  sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(user.wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(user.wxId);
  })();
  audit(user.wxId, "delete_all_messages", null, clientIp(c));
  return c.json({ ok: true });
});
