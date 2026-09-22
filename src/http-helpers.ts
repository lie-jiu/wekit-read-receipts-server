import type { Context } from "hono";
import { getSessionUser, requireAdmin, requireUser } from "./auth";
import type { SessionUser } from "./auth";
import { sqlite } from "./db";
import { isValidId, utcDate } from "./utils";

export type ReadRow = {
  ip: string;
  timestamp: string;
  user_agent: string;
  country: string;
  region: string;
  city: string;
  isp: string;
  country_en: string;
  region_en: string;
  city_en: string;
  isp_en: string;
};

export function readRow(r: ReadRow) {
  const located = r.country !== "" || r.region !== "" || r.city !== "" || r.isp !== "";
  return {
    ip: r.ip,
    timestamp: r.timestamp,
    userAgent: r.user_agent,
    country: r.country,
    region: r.region,
    city: r.city,
    isp: r.isp,
    countryEn: r.country_en,
    regionEn: r.region_en,
    cityEn: r.city_en,
    ispEn: r.isp_en,
    located,
  };
}

export const emptyReadRow: Omit<ReadRow, "ip" | "timestamp" | "user_agent"> = {
  country: "",
  region: "",
  city: "",
  isp: "",
  country_en: "",
  region_en: "",
  city_en: "",
  isp_en: "",
};

/** 兼容 JSON 与表单提交（登录/注册页复用 CF 版前端，发的是 x-www-form-urlencoded） */
export async function parseBody(c: Context): Promise<Record<string, unknown>> {
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await c.req.parseBody();
    return Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
    );
  }
  return await c.req.json();
}

/** 分页/条数钳制：NaN 与越界归到 [min, max]（默认 1..200），负数不会变成 SQLite 的「不限」 */
export function clampLimit(v: number, min = 1, max = 200): number {
  const n = Math.floor(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** 返回鉴权失败响应或 null（通过）；用于必须登录的 JSON 端点 */
export function requireUserOr(c: Context): Response | null {
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return null;
}

/** 校验单条消息 IP 黑名单的访问归属：消息所有者或管理员；非法时给出对应错误响应 */
export function readsMessageOr(c: Context, id: string): Response | null {
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  const msg = sqlite
    .query("SELECT wx_id, content FROM messages WHERE id = ?")
    .get(id) as { wx_id: string; content: string } | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (msg.wx_id !== user.wxId && !user.isAdmin) return c.json({ error: "forbidden" }, 403);
  return null;
}

/** 已读详情的公开访问归属：公开消息（is_public=1）放行匿名只读；已登录用户（含 owner/admin 与其他登录用户）保留会话。
 * 返回消息记录（含 wx_id/content/is_public）、anon 标志（是否为匿名公开访问）与已登录用户（匿名时 null），非法时给出错误响应。 */
export function publicReadOr(
  c: Context,
  id: string,
): {
  msg: { wx_id: string; content: string; is_public: number; timestamp: string };
  anon: boolean;
  user: SessionUser | null;
} | Response {
  if (!isValidId(id)) return c.json({ error: "invalid id" }, 400);
  const msg = sqlite
    .query("SELECT wx_id, content, is_public, timestamp FROM messages WHERE id = ?")
    .get(id) as
    | { wx_id: string; content: string; is_public: number; timestamp: string }
    | undefined;
  if (!msg) return c.json({ error: "not found" }, 404);
  if (msg.is_public === 1) {
    // 公开消息：已登录用户（无论是否为 owner/admin）保留会话以便按访问者扣定位配额；仅真正匿名才按匿名只读处理
    const user = getSessionUser(c);
    if (user) return { msg, anon: false, user };
    return { msg, anon: true, user: null };
  }
  const user = requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (msg.wx_id !== user.wxId && !user.isAdmin) return c.json({ error: "forbidden" }, 403);
  return { msg, anon: false, user };
}

/** 当日 IP 定位已用次数：geo_date 与今日（UTC）不一致则视为 0（惰性跨天归零） */
export function geoUsedToday(user: SessionUser): number {
  return user.geoDate === utcDate() ? user.geoCount : 0;
}

/** 管理端点鉴权：返回鉴权失败响应或 null（通过） */
export function adminOr(c: Context): Response | null {
  const user = requireAdmin(c);
  if (!user) return c.json({ error: "forbidden" }, 403);
  return null;
}

/**
 * 读 audit_logs。抽出来是因为要同时服务两个可见性完全不同的端点，
 * SQL 只该有一份：
 *   GET /admin/audit    管理员看全站（可按 wxId / action 过滤）
 *   GET /account/audit  普通用户只看自己那几行
 * 表一直在写（见 auth.ts 的 audit()），缺的只是读的那一半。
 */
export function queryAudit(opts: {
  wxId: string | null
  action?: string | null
  page: number
  pageSize: number
}): {
  rows: Array<{ wxId: string | null; action: string; detail: string | null; ip: string | null; timestamp: string }>
  total: number
  page: number
  pageSize: number
  totalPages: number
} {
  // 两个过滤条件都走占位符：action 直接来自 URL 查询串，拼进 SQL 就是注入点。
  // 顺序也必须与下面 SELECT 里 ? 的出现次序一致（COUNT 与 SELECT 共用同一份 params）。
  const clauses: string[] = [];
  const params: string[] = [];
  if (opts.wxId) {
    clauses.push("wx_id = ?");
    params.push(opts.wxId);
  }
  if (opts.action) {
    clauses.push("action = ?");
    params.push(opts.action);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    sqlite.query(`SELECT COUNT(*) AS n FROM audit_logs ${where}`).get(...params) as { n: number }
  ).n;
  const offset = (opts.page - 1) * opts.pageSize;
  const rows = sqlite
    .query(
      `SELECT wx_id AS wxId, action, detail, ip, timestamp
       FROM audit_logs ${where}
       ORDER BY timestamp DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.pageSize, offset) as Array<{
    wxId: string | null
    action: string
    detail: string | null
    ip: string | null
    timestamp: string
  }>
  return { rows, total, page: opts.page, pageSize: opts.pageSize, totalPages: Math.max(1, Math.ceil(total / opts.pageSize)) }
}

