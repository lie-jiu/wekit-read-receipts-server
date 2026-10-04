import { Hono } from "hono";
import { spaHash } from "../spa";
import { getSessionUser } from "../auth";
import { sqlite } from "../db";
import { maskContent, maskWxId, utcDate } from "../utils";
import { requireUserOr } from "../http-helpers";

/** 排行榜 JSON / 排行榜页面 */
export const statsApp = new Hono();

/** 账号榜两张滚表按 (date, wx_id) 直接求和即可。消息榜不在这里：滚表没有消息维度，
 *  它必须回 reads 现算（见 boardOf 的 msg 分支） */
const ACCOUNT_BOARD_TABLES = { reg: "registration_stats", read: "read_stats" } as const;

type BoardMetric = keyof typeof ACCOUNT_BOARD_TABLES | "msg";
type BoardScope = "day" | "total";

/** 榜单聚合的唯一定义。/leaderboard 与 /leaderboard/me 必须走它 —— 两条 SQL 各自算一份的话，
 *  迟早会出现「榜上你在第 3 行，我的名次说第 5」这种自相矛盾的画面。 */
type Board = {
  /** 一行 = 一个上榜实体：账号榜的 key 是 wx_id，消息榜的 key 是消息 id */
  sql: string;
  params: string[];
};

function boardOf(metric: BoardMetric, scope: BoardScope): Board {
  const day = scope === "day";
  if (metric === "msg") {
    // 消息榜没有统计表可依赖（滚表没有消息维度），只能实时聚合 reads 的去重 IP 数
    return {
      sql: `SELECT m.id AS key, m.wx_id AS owner, m.content AS content, m.is_public AS is_public,
                   COUNT(DISTINCT r.ip) AS total
            FROM messages m JOIN users u ON u.wx_id = m.wx_id
            LEFT JOIN reads r ON r.id = m.id ${day ? "AND r.timestamp >= ? " : ""}
            GROUP BY m.id`,
      params: day ? [utcDate() + " 00:00:00"] : [],
    };
  }
  const table = ACCOUNT_BOARD_TABLES[metric === "read" ? "read" : "reg"];
  return {
    sql: `SELECT s.wx_id AS key, s.wx_id AS owner, NULL AS content, NULL AS is_public,
                 SUM(s.count) AS total
          FROM ${table} s JOIN users u ON u.wx_id = s.wx_id
          ${day ? "WHERE s.date = ?" : ""}
          GROUP BY s.wx_id`,
    params: day ? [utcDate()] : [],
  };
}

/** 并列时按 key 定序：名次要能对上榜上的行，排序就不能有随机性 */
const BOARD_ORDER = "ORDER BY total DESC, owner ASC, key ASC";

/** 参数校验：两个端点共用，非法值统一 400 */
function boardParams(c: { req: { query: (k: string) => string | undefined } }): { metric: BoardMetric; scope: BoardScope } | null {
  const metric = c.req.query("metric") ?? "reg";
  const scope = c.req.query("scope") ?? "total";
  if (!["reg", "read", "msg"].includes(metric) || !["day", "total"].includes(scope)) return null;
  return { metric: metric as BoardMetric, scope: scope as BoardScope };
}

statsApp.get("/leaderboard", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const me = getSessionUser(c)!;
  const board = boardParams(c);
  if (!board) return c.json({ error: "invalid params" }, 400);
  const { sql, params } = boardOf(board.metric, board.scope);

  const rows = sqlite
    .query(`SELECT key, owner, content, is_public, total FROM (${sql}) t ${BOARD_ORDER} LIMIT 10`)
    .all(...params) as Array<{
    key: string;
    owner: string;
    content: string | null;
    is_public: number | null;
    total: number;
  }>;

  if (board.metric === "msg") {
    return c.json(
      rows.map((r) => ({
        id: r.key,
        wxId: maskWxId(r.owner),
        content: maskContent(r.content ?? ""),
        count: r.total,
        me: r.owner === me.wxId,
        /** 钻取入口按 publicReadOr() 的真实规则判定：owner / 管理员 / is_public=1。
         *  不带这一列，前端只能对别人的私有消息画一个必然 403 的按钮 */
        isPublic: r.is_public === 1,
      })),
    );
  }
  return c.json(
    rows.map((r) => ({ wxId: maskWxId(r.owner), count: r.total, me: r.owner === me.wxId })),
  );
});

/**
 * 我在榜上的真实名次。
 *
 * 为什么单独一个端点：/leaderboard 是 LIMIT 10 的裸数组，旧服务端页面（/rank 的内联 JS）
 * 直接按数组解析，改它的响应形状就是破坏既有契约。名次对第 11 名以后的账号来说
 * 是这块界面唯一有意义的信息 —— 没有它，榜页对多数用户只是一场旁观。
 *
 * 并列按「竞赛名次」算（前面有几个人就第几名 +1），与榜内可见顺序一致。
 * 消息榜的"我的名次"= 我表现最好那条消息的名次，count 就是那条消息的数。
 */
statsApp.get("/leaderboard/me", (c) => {
  const denied = requireUserOr(c);
  if (denied) return denied;
  const me = getSessionUser(c)!;
  const board = boardParams(c);
  if (!board) return c.json({ error: "invalid params" }, 400);
  const { sql, params } = boardOf(board.metric, board.scope);
  const keyed = `SELECT key, owner, total FROM (${sql}) t`;

  // 账号榜看 key（就是 wx_id），消息榜看 owner（我可能有多条消息上榜）
  const mineRow = sqlite
    .query(
      board.metric === "msg"
        ? `SELECT MAX(total) AS total FROM (${keyed}) x WHERE x.owner = ?`
        : `SELECT total FROM (${keyed}) x WHERE x.key = ?`,
    )
    .get(...params, me.wxId) as { total: number | null } | undefined;
  const mine = mineRow?.total ?? 0;

  const ranked = (
    sqlite.query(`SELECT COUNT(*) AS n FROM (${keyed}) x WHERE x.total > 0`).get(...params) as { n: number }
  ).n;

  if (mine <= 0) return c.json({ rank: null, count: 0, total: ranked });

  const ahead = (
    sqlite.query(`SELECT COUNT(*) AS n FROM (${keyed}) x WHERE x.total > ?`).get(...params, mine) as { n: number }
  ).n;
  return c.json({ rank: ahead + 1, count: mine, total: ranked });
});

/** 旧的排行榜服务端页面已退役：重定向到 SPA 的 `/#/leaderboard`（见 spaHash 的注释） */
statsApp.get("/rank", (c) => c.redirect(spaHash("/leaderboard")));
