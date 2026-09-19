import { Hono } from "hono";
import { ENABLE_GEO } from "../config";
import { getSessionUser } from "../auth";
import { sqlite } from "../db";
import { geoQuotaFor, quotaFor, retentionMonthsFor } from "../levels";
import { geoUsedToday } from "../http-helpers";

/**
 * SPA 的会话引导接口。
 *
 * 为什么必须新开一个端点：服务端拼 HTML 的时代，身份是直接注进页面的
 * （见 reads.ts 里为 readDetailsPage 构造的那个 session 字面量），
 * 所以从来不需要"问服务器我是谁"。换成独立前端后这一步没有替代物 ——
 * 没有 /me，前端连"要不要显示运营区"和"定位还剩几次"都无从判断。
 *
 * 字段沿用原来注入对象的名字（wxId / level / isAdmin / geo / geoQuota / geoRemaining），
 * 不另起一套命名，免得同一份语义在前后端出现两个词。
 * canRegister 与 messageCount 是 SPA 导航与权益卡要用的，属于纯追加。
 *
 * messageQuota / retentionMonths 也由服务器算好给出：权益数值来自管理员可改的公式
 * （levels.ts），前端如果自己再实现一遍求值，就会出现"页面显示 20 条、服务器按 10 条截断"
 * 这类查不出来的不一致。createdAt 同理 —— 它是 users 表里的行，不是客户端能问出来的。
 */
export const sessionApp = new Hono();

/** 未登录返回 401 JSON（不是 302）：前端据 401 自己跳登录页，SSR 的重定向语义留给页面 */
sessionApp.get("/me", (c) => {
  const user = getSessionUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const geoQuota = geoQuotaFor(user.level);
  // 单独点查 created_at：SessionUser 在鉴权热路径上被反复构造，
  // 只为这个每会话取一次的字段去加宽它不划算（这里是主键点查）。
  const created = sqlite.query("SELECT created_at FROM users WHERE wx_id = ?").get(user.wxId) as
    | { created_at: string }
    | undefined;
  return c.json({
    wxId: user.wxId,
    level: user.level,
    isAdmin: user.isAdmin,
    /** 部署侧关掉 geo 时前端整块定位入口都不该出现，所以要把开关本身给出去 */
    geo: ENABLE_GEO,
    geoQuota,
    geoRemaining: Math.max(0, geoQuota - geoUsedToday(user)),
    messageCount: user.messageCount,
    /** level 0 的语义是"仅禁止注册新消息"，历史数据仍在 —— 界面别写成"已封禁" */
    canRegister: user.level > 0,
    messageQuota: quotaFor(user.level),
    /** 0 = 不限制保留时长 */
    retentionMonths: retentionMonthsFor(user.level),
    createdAt: created?.created_at ?? "",
  });
});
