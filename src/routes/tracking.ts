import { Hono } from "hono";
import {
  MAX_CONTENT_LENGTH,
  MAX_REGISTER_BATCH,
  PIXEL_PNG,
  quotaFor,
  retentionMonthsFor,
} from "../config";
import { audit } from "../auth";
import { sqlite, stmt } from "../db";
import { clientIp, overLimit, overLimitWxId } from "../rate-limit";
import { computeId, isValidId, isValidWxId, utcDate, utcMonthsAgo, utcNow } from "../utils";

/** 客户端打点 / 批量上报（无状态、无鉴权） */
export const trackingApp = new Hono();

trackingApp.get("/pixel", (c) => {
  const ip = clientIp(c);
  const wxId = c.req.query("wxId") ?? "";
  const id = c.req.query("id") ?? "";
  if (!overLimit("pixel", ip) && isValidId(id) && isValidWxId(wxId)) {
    const ua = (c.req.header("user-agent") ?? "").slice(0, 500);
    try {
      stmt().insertRead.run(id, ip, utcNow(), ua);
    } catch {
      // SQLITE_BUSY 等瞬态错误：静默降级，仍返回像素
    }
  }
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Content-Type", "image/png");
  c.header("Content-Security-Policy", "default-src 'none'");
  return c.body(PIXEL_PNG);
});

trackingApp.get("/count", (c) => {
  const id = c.req.query("id") ?? "";
  if (!isValidId(id) || overLimit("count", clientIp(c))) {
    return c.json({ count: 0 });
  }
  const row = stmt().countReads.get(id) as { n: number };
  return c.json({ count: row.n });
});

trackingApp.post("/register", async (c) => {
  const ip = clientIp(c);
  if (overLimit("register", ip)) return c.json({ error: "rate limited" }, 429);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const items = Array.isArray(body) ? (body as Array<Record<string, unknown>>) : [body as Record<string, unknown>];
  if (items.length === 0 || items.length > MAX_REGISTER_BATCH) {
    return c.json({ error: "invalid batch" }, 400);
  }

  const ids: string[] = [];
  for (const item of items) {
    const wxId = typeof item.wxId === "string" ? item.wxId : "";
    const content = typeof item.content === "string" ? item.content : "";
    const createTime = String(item.createTime ?? "");

    if (
      !isValidWxId(wxId) ||
      content.length === 0 ||
      content.length > MAX_CONTENT_LENGTH ||
      !/^\d{1,16}$/.test(createTime)
    ) {
      return c.json({ error: "invalid payload" }, 400);
    }

    // 公开端点按 wxId 限流：缓解未授权批量伪造消息（客户端协议无鉴权，不可变）
    if (overLimitWxId(wxId)) {
      audit(wxId, "register_wxid_limited", null, ip);
      return c.json({ error: "rate limited" }, 429);
    }

    const user = sqlite.query("SELECT level FROM users WHERE wx_id = ?").get(wxId) as
      | { level: number }
      | undefined;
    if (!user || user.level <= 0) return c.json({ error: "not registered" }, 403);

    const id = computeId(wxId, content, createTime);
    sqlite.transaction(() => {
      const now = utcNow();
      const res = sqlite
        .query("INSERT OR IGNORE INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
        .run(id, wxId, content, now);
      if (res.changes === 0) return false;

      sqlite.query("UPDATE users SET message_count = message_count + 1 WHERE wx_id = ?").run(wxId);
      sqlite
        .query(
          "INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, 1) ON CONFLICT (date, wx_id) DO UPDATE SET count = count + 1",
        )
        .run(utcDate(), wxId);

      const quota = quotaFor(user.level);
      const excess = sqlite
        .query("SELECT id FROM messages WHERE wx_id = ? ORDER BY timestamp DESC LIMIT -1 OFFSET ?")
        .all(wxId, quota) as Array<{ id: string }>;
      for (const m of excess) {
        sqlite.query("DELETE FROM reads WHERE id = ?").run(m.id);
        sqlite.query("DELETE FROM messages WHERE id = ?").run(m.id);
      }

      const months = retentionMonthsFor(user.level);
      if (months > 0) {
        const cutoff = utcMonthsAgo(months);
        const expired = sqlite
          .query("SELECT id FROM messages WHERE wx_id = ? AND timestamp < ?")
          .all(wxId, cutoff) as Array<{ id: string }>;
        for (const m of expired) {
          sqlite.query("DELETE FROM reads WHERE id = ?").run(m.id);
          sqlite.query("DELETE FROM messages WHERE id = ?").run(m.id);
        }
      }
      sqlite
        .query("UPDATE users SET message_count = (SELECT COUNT(*) FROM messages WHERE wx_id = ?) WHERE wx_id = ?")
        .run(wxId, wxId);
    })();

    ids.push(id);
  }

  return c.json(Array.isArray(body) ? { ids } : { id: ids[0] ?? "" });
});
