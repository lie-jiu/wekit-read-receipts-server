import { describe, expect, test } from "bun:test";

// 必须在动态 import 触发 config.ts 求值前设置（bunfig [test] preload 亦已兜底）
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

const { sqlite, migrate } = await import("./db");
const { default: app } = await import("./app");
const { geoQuotaFor, quotaFor, retentionMonthsFor } = await import("./levels");
const { sha256Hex, utcDate } = await import("./utils");

migrate();

type MeResponse = {
  wxId: string;
  level: number;
  isAdmin: boolean;
  geo: boolean;
  geoQuota: number;
  geoRemaining: number;
  messageCount: number;
  canRegister: boolean;
  messageQuota: number;
  retentionMonths: number;
  createdAt: string;
};

type AuditResponse = {
  rows: Array<Record<string, string | null>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

async function getMe(wxId?: string): Promise<Response> {
  return app.request("/me", wxId ? { headers: cookieOf(wxId) } : undefined);
}

/** app.request 的返回类型是 Response | Promise<Response>，必须先 await 再取 json */
async function getAudit(path: string, wxId?: string): Promise<AuditResponse> {
  const res = await app.request(path, wxId ? { headers: cookieOf(wxId) } : undefined);
  return (await res.json()) as AuditResponse;
}

const DUMMY_HASH = "x".repeat(60); // 满足 CHECK(length >= 60)，测试不走密码验证

/**
 * bun test 的多个文件共用同一个 :memory: 库，而 admin_wx 这个 wxId 也被
 * routes.test.ts / retention.test.ts 当作夹具用（见 retention.test.ts 顶部那段说明）。
 * 这里用 upsert 而不是全库清空：清库会顺手改掉别的文件已经建好的世界，
 * 而 upsert 只保证"我这三个用户存在且 level 正确"，对执行顺序同样免疫。
 */
function insertUser(wxId: string, level = 1): void {
  sqlite
    .query(
      `INSERT INTO users (wx_id, password_hash, level, message_count, created_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(wx_id) DO UPDATE SET level = excluded.level`,
    )
    .run(wxId, DUMMY_HASH, level, "2026-01-01 00:00:00");
}

function makeSession(wxId: string): string {
  const token = "sess_" + sha256Hex(wxId + ":" + Math.random());
  sqlite
    .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256Hex(token), wxId, "2026-01-01 00:00:00", "2099-01-01 00:00:00");
  return token;
}

function cookieOf(wxId: string): Record<string, string> {
  return { cookie: `session=${makeSession(wxId)}` };
}

function insertAudit(wxId: string, action: string, timestamp: string): void {
  sqlite
    .query("INSERT INTO audit_logs (wx_id, action, detail, ip, timestamp) VALUES (?, ?, NULL, ?, ?)")
    .run(wxId, action, "203.0.113.7", timestamp);
}

/**
 * audit_logs 是全库共享的，其它测试文件跑完会留下自己的行（时间戳还可能是 utcNow()），
 * 所以这里不能断言"全站总共几条 / 全局第一条是谁"，只能：
 *   1) 先把本文件自己这三个用户的留痕清空重建，保证按 wxId 过滤后的结果是确定的；
 *   2) 全站维度只断言"至少包含"与响应结构。
 * 这是 retention.test.ts 顶部那段执行顺序警告的同一个坑，换个更不具破坏性的解法。
 */
for (const wxId of ["admin_wx", "member_wx", "zero_wx"]) {
  sqlite.query("DELETE FROM audit_logs WHERE wx_id = ?").run(wxId);
}

insertUser("admin_wx", 5);
insertUser("member_wx", 2);
insertUser("zero_wx", 0);
insertAudit("admin_wx", "password_change", "2026-01-02 00:00:00");
insertAudit("admin_wx", "global_block_add", "2026-01-03 00:00:00");
insertAudit("member_wx", "account_block_add", "2026-01-04 00:00:00");

describe("GET /me", () => {
  /**
   * SPA 启动只靠这一个端点拿到"我是谁、能不能进运营区、定位还剩几次"。
   * 服务端拼 HTML 的年代这些是注进页面的，没有对应接口；漏掉它前端连导航都渲染不对。
   */
  test("未登录 401 JSON（不是重定向，前端自己跳）", async () => {
    const res = await getMe();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("返回会话身份与 geo 配额", async () => {
    const body = (await getMe("admin_wx").then((r) => r.json())) as MeResponse;
    expect(body.wxId).toBe("admin_wx");
    expect(body.level).toBe(5);
    expect(body.isAdmin).toBe(true);
    expect(body.geoQuota).toBe(geoQuotaFor(5));
    expect(body.geoRemaining).toBe(geoQuotaFor(5));
    expect(body.canRegister).toBe(true);
    /* 权益数值由服务器按公式算：前端自己再求值一遍必然和截断行为不一致 */
    expect(body.messageQuota).toBe(quotaFor(5));
    expect(body.retentionMonths).toBe(retentionMonthsFor(5));
  });

  test("createdAt 来自 users 行", async () => {
    insertUser("me_created_wx", 2);
    const body = (await getMe("me_created_wx").then((r) => r.json())) as MeResponse;
    expect(body.createdAt).toBe("2026-01-01 00:00:00");
    expect(body.messageQuota).toBe(quotaFor(2));
  });

  test("非管理员 isAdmin=false", async () => {
    const body = (await getMe("member_wx").then((r) => r.json())) as MeResponse;
    expect(body.isAdmin).toBe(false);
    expect(body.canRegister).toBe(true);
  });

  /** level 0 只关注册，历史数据全在 —— 界面据此写"已停注册"而不是"已封禁" */
  test("level 0 → canRegister=false 但仍可登录取会话", async () => {
    const body = (await getMe("zero_wx").then((r) => r.json())) as MeResponse;
    expect(body.level).toBe(0);
    expect(body.canRegister).toBe(false);
  });
});

describe("GET /admin/users 的身份列", () => {
  type Row = { wxId: string; level: number; isAdmin: boolean; canRegister: boolean };
  type List = { rows: Row[]; total: number; page: number; pageSize: number; totalPages: number };

  test("isAdmin 来自 env 名单，canRegister 来自 level", async () => {
    insertUser("list_admin_wx", 4);
    const res = await app.request("/admin/users?q=list_admin_wx", { headers: cookieOf("admin_wx") });
    const body = (await res.json()) as List;
    const row = body.rows.find((r) => r.wxId === "list_admin_wx");
    expect(row?.isAdmin).toBe(false); // 不在 ADMIN 列表里
    expect(row?.canRegister).toBe(true);

    const mine = await app.request("/admin/users?q=admin_wx", { headers: cookieOf("admin_wx") });
    const mineBody = (await mine.json()) as List;
    expect(mineBody.rows.find((r) => r.wxId === "admin_wx")?.isAdmin).toBe(true);

    const zero = await app.request("/admin/users?q=zero_wx", { headers: cookieOf("admin_wx") });
    const zeroBody = (await zero.json()) as List;
    expect(zeroBody.rows.find((r) => r.wxId === "zero_wx")?.canRegister).toBe(false);
  });

  test("删除用户会带走全部五张统计表的行（v8 新表不能成漏网之鱼）", async () => {
    const wx = "del_stats_wx";
    insertUser(wx, 2);
    const msgId = sha256Hex("del-stats-msg");
    sqlite
      .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
      .run(msgId, wx, "要被删掉的消息", "2026-01-09 00:00:00");
    sqlite
      .query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, ?, ?)")
      .run(msgId, "203.0.113.55", "2026-01-09 03:00:00", "MicroMessenger/8.0.49");
    const { backfillStats } = await import("./stats");
    backfillStats();

    const rowsOf = (t: string) =>
      (sqlite.query(`SELECT COUNT(*) AS n FROM ${t} WHERE wx_id = ?`).get(wx) as { n: number }).n;
    expect(rowsOf("hour_stats")).toBeGreaterThan(0);
    expect(rowsOf("ua_stats")).toBeGreaterThan(0);

    const res = await app.request(`/admin/users/${wx}`, {
      method: "DELETE",
      headers: cookieOf("admin_wx"),
    });
    expect(res.status).toBe(200);
    // 只断言"这个账号"的行数为 0：别的测试文件在同一批表里留有自己的行
    for (const t of ["registration_stats", "read_stats", "message_read_stats", "hour_stats", "ua_stats"]) {
      expect([t, rowsOf(t)]).toEqual([t, 0]);
    }
  });
});

describe("审计日志读接口", () => {
  test("/admin/audit 仅管理员", async () => {
    expect((await app.request("/admin/audit", { headers: cookieOf("member_wx") })).status).toBe(403);
    expect((await app.request("/admin/audit")).status).toBe(403);
  });

  /** 全站维度只断言结构与"包含"，不断言总数：别的测试文件也往这张表写 */
  test("/admin/audit 返回全站留痕，按时间倒序", async () => {
    const body = await getAudit("/admin/audit", "admin_wx");
    expect(body.rows.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(body.rows[0] ?? {}).sort()).toEqual(["action", "detail", "ip", "timestamp", "wxId"]);
    const ts = body.rows.map((r) => String(r.timestamp));
    expect([...ts].sort().reverse()).toEqual(ts);
  });

  /** 条数与顺序在"只看自己"这个子集里是确定的，可以精确断言 */
  test("/admin/audit 的 wxId 过滤是精确匹配，不是 LIKE", async () => {
    const body = await getAudit("/admin/audit?wxId=admin_wx", "admin_wx");
    expect(body.total).toBe(2);
    expect(body.rows.map((r) => r.action)).toEqual(["global_block_add", "password_change"]);
  });

  /**
   * 普通用户的留痕必须锁在自己身上：这里刻意不读 query 里的 wxId，
   * 否则 /account/audit?wxId=admin_wx 就变成探测他人操作的口子。
   */
  test("/account/audit 只看自己，忽略传入的 wxId 参数", async () => {
    const body = await getAudit("/account/audit?wxId=admin_wx", "member_wx");
    expect(body.total).toBe(1);
    expect(body.rows.every((r) => r.wxId === "member_wx")).toBe(true);
  });

  test("/account/audit 未登录 401", async () => {
    expect((await app.request("/account/audit")).status).toBe(401);
  });

  test("pageSize 上限收敛到 200，防一次拉空库", async () => {
    const body = await getAudit("/admin/audit?pageSize=99999", "admin_wx");
    expect(body.pageSize).toBe(200);
  });
});

/** 与本次改动直接相关的回归位：新端点不能把老路由带坏 */
describe("新端点不影响既有路由", () => {
  test("/messages 仍返回裸数组 + X-Total-Count", async () => {
    const res = await app.request("/messages", { headers: cookieOf("admin_wx") });
    expect(Array.isArray(await res.json())).toBe(true);
    expect(res.headers.get("X-Total-Count")).toBe("0");
  });

  test("utcDate 仍可用（rollup 的 date 维度依赖它）", () => {
    expect(typeof utcDate()).toBe("string");
  });
});

/* ── GET /messages?detail=1：SPA 列表页要的派生列 ── */

describe("GET /messages?detail=1", () => {
  type Row = {
    id: string;
    content: string;
    reads: number;
    timestamp: string;
    isPublic?: boolean;
    firstReadSeconds?: number | null;
    blockedCount?: number;
    dailyReads?: Array<{ date: string; count: number }>;
  };

  const WX = "detail_wx";
  /** 相对今天的时间戳：dailyReads 的「近 14 天」是按 UTC 今日锚定的，写死日期迟早会过期 */
  const at = (daysAgo: number, hhmmss: string): string =>
    `${new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)} ${hhmmss}`;

  insertUser(WX, 3);
  // m1：3 天前发出，1 小时前被读一次，另有一次命中消息级黑名单的访问
  sqlite
    .query("INSERT INTO messages (id, wx_id, content, timestamp, is_public) VALUES (?, ?, ?, ?, 1)")
    .run(sha256Hex("detail-m1"), WX, "公开的那条", at(3, "09:00:00"));
  sqlite
    .query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, ?, '')")
    .run(sha256Hex("detail-m1"), "203.0.113.11", at(3, "10:00:00"));
  sqlite
    .query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, ?, '')")
    .run(sha256Hex("detail-m1"), "203.0.113.99", at(3, "11:00:00"));
  sqlite
    .query("INSERT INTO ip_block_message (id, ip, created_at) VALUES (?, ?, ?)")
    .run(sha256Hex("detail-m1"), "203.0.113.99", at(3, "11:30:00"));
  // m2：20 天前发出且从未被读 → 首读为 null，且不会带进 14 天序列
  sqlite
    .query("INSERT INTO messages (id, wx_id, content, timestamp, is_public) VALUES (?, ?, ?, ?, 0)")
    .run(sha256Hex("detail-m2"), WX, "没人读的那条", at(20, "09:00:00"));

  async function rows(url: string): Promise<Row[]> {
    const res = await app.request(url, { headers: cookieOf(WX) });
    return (await res.json()) as Row[];
  }

  test("不带 detail 时形状不变（旧客户端零改动）", async () => {
    const list = await rows("/messages");
    expect(list.length).toBe(2);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(["content", "id", "reads", "timestamp"]);
  });

  test("detail=1 补齐公开标记 / 首读耗时 / 屏蔽数 / 逐日序列", async () => {
    const list = await rows("/messages?detail=1");
    const pub = list.find((r) => r.content === "公开的那条");
    const never = list.find((r) => r.content === "没人读的那条");
    expect(pub?.isPublic).toBe(true);
    expect(never?.isPublic).toBe(false);
    // 首读 = 发送后 1 小时
    expect(pub?.firstReadSeconds).toBe(3600);
    expect(never?.firstReadSeconds).toBeNull();
    expect(pub?.blockedCount).toBe(1);
    expect(never?.blockedCount).toBe(0);
    // reads 仍是全量（含被屏蔽那次），黑名单只单独报数、不改计数
    expect(pub?.reads).toBe(2);
    const days = pub?.dailyReads ?? [];
    expect(days.reduce((a, d) => a + d.count, 0)).toBe(2);
    expect(days.every((d) => d.date >= new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10))).toBe(true);
    expect(never?.dailyReads).toEqual([]);
  });
});

/* ── GET /account/stats：账户页要、只有服务器算得出的两个量 ── */

describe("GET /account/stats", () => {
  const WX = "stats_wx";
  const m1 = sha256Hex("stats-m1");
  const m2 = sha256Hex("stats-m2");

  insertUser(WX, 4);
  sqlite.query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, 'a', '2026-01-01 00:00:00')").run(m1, WX);
  sqlite.query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, 'b', '2026-01-01 00:00:00')").run(m2, WX);
  for (const ip of ["203.0.113.1", "203.0.113.2"]) {
    sqlite.query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, '2026-01-02 00:00:00', '')").run(m1, ip);
  }
  sqlite.query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, '2026-01-02 00:00:00', '')").run(m2, "203.0.113.3");
  // 命中黑名单的那次访问：仍然是库里的行，也仍然会被 DELETE /messages 删掉
  sqlite.query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, '2026-01-02 00:00:00', '')").run(m2, "203.0.113.4");
  sqlite.query("INSERT INTO ip_block_message (id, ip, created_at) VALUES (?, ?, '2026-01-03 00:00:00')").run(m2, "203.0.113.4");
  // 滚表故意虚高：它只增不减，用它的数字报「会删掉多少条」就是错的
  sqlite.query("INSERT INTO read_stats (date, wx_id, count) VALUES ('2025-01-01', ?, 999)").run(WX);

  test("totalReads 是现存 reads 行数，不是 read_stats 滚表", async () => {
    const res = await app.request("/account/stats", { headers: cookieOf(WX) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalReads: number; viewerIp: string };
    expect(body.totalReads).toBe(4);
  });

  test("viewerIp 由服务器给（账户页「屏蔽我当前的 IP」预填用），未登录 401", async () => {
    const { setIpResolver } = await import("./rate-limit");
    setIpResolver(() => "203.0.113.77");
    const body = (await (await app.request("/account/stats", { headers: cookieOf(WX) })).json()) as {
      viewerIp: string;
    };
    expect(body.viewerIp).toBe("203.0.113.77");
    setIpResolver(null);
    expect((await app.request("/account/stats")).status).toBe(401);
  });
});
