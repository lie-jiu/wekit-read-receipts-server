import { describe, expect, mock, test } from "bun:test";

// 必须在动态 import 触发 config.ts 求值前设置（bunfig [test] preload 亦已兜底）
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

// 定位外呼必须在 app 之前打桩：reads.ts 会 import ./geo，真实外呼会让测试依赖公网
mock.module("./geo", () => ({
  lookupIpLocation: async () => ({
    zh: { country: "中国", region: "广东", city: "深圳", isp: "中国电信" },
    en: { country: "China", region: "Guangdong", city: "Shenzhen", isp: "China Telecom" },
  }),
}));

const { geoQuotaFor } = await import("./config");
const { sqlite, migrate } = await import("./db");
const { default: app } = await import("./app");
const { backfillStats, getCursor, recycleStaleGeoCounts } = await import("./stats");
const { setIpResolver, UNKNOWN_IP } = await import("./rate-limit");
const { computeId, sha256Hex } = await import("./utils");

migrate();

/* ── 测试基建：可控 IP 解析 + 直写 DB 的数据构造 ── */

let currentIp = "10.0.0.1";
setIpResolver(() => currentIp);

let ipSeq = 0;
const freshIp = (): string => `10.${Math.floor(ipSeq / 250) % 250}.${ipSeq++ % 250 + 1}.1`;

const DUMMY_HASH = "x".repeat(60); // 满足 CHECK(length >= 60)，测试不走密码验证

function insertUser(wxId: string, level = 1): void {
  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(wxId, DUMMY_HASH, level, "2026-01-01 00:00:00");
}

function insertMessage(id: string, wxId: string, content: string, isPublic = 0): void {
  sqlite
    .query("INSERT INTO messages (id, wx_id, content, timestamp, is_public) VALUES (?, ?, ?, ?, ?)")
    .run(id, wxId, content, "2026-01-01 00:00:00", isPublic);
}

function insertRead(id: string, ip: string, ts: string): void {
  sqlite.query("INSERT OR IGNORE INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, ?, '')").run(id, ip, ts);
}

function makeSession(wxId: string): string {
  const token = "sess_" + sha256Hex(`${wxId}:${crypto.randomUUID()}`);
  sqlite
    .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256Hex(token), wxId, "2026-01-01 00:00:00", "2099-01-01 00:00:00");
  return token;
}

const authCookie = (wxId: string): Record<string, string> => ({ cookie: `session=${makeSession(wxId)}` });

function register(body: unknown) {
  return app.request("/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// owner_wx 用高等级：避免 /register 的配额裁剪（保留条数=等级）删除测试夹具消息
insertUser("owner_wx", 99);
insertUser("admin_wx");
insertUser("other_wx");
insertUser("stat_a");
insertUser("stat_b");

/* ── /register ── */

describe("POST /register", () => {
  test("单对象注册成功，id 与客户端算法一致", async () => {
    currentIp = freshIp();
    const createTime = String(Date.now());
    const res = await register({ wxId: "owner_wx", content: "hello", createTime });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(/^[0-9a-f]{64}$/);
    expect(body.id).toBe(computeId("owner_wx", "hello", createTime));
  });

  test("未注册 wxId 返回 403 且不消耗 per-wxId 窗口", async () => {
    // 29 次未注册请求（每次命中 403）；若旧实现先计数，30/分窗口已耗尽大半
    currentIp = freshIp();
    for (let i = 0; i < 29; i++) {
      const res = await register({ wxId: "ghost_wx", content: "hi", createTime: "1700000000000" });
      expect(res.status).toBe(403);
    }
    insertUser("ghost_wx");
    // 新 IP 连续两次应均成功：per-wxId 分钟窗口未被未注册请求消耗
    currentIp = freshIp();
    expect((await register({ wxId: "ghost_wx", content: "hi", createTime: "1700000000000" })).status).toBe(200);
    expect((await register({ wxId: "ghost_wx", content: "hi", createTime: "1700000000000" })).status).toBe(200);
  });

  test("超长 content（2049 字符）返回 400", async () => {
    currentIp = freshIp();
    const res = await register({ wxId: "owner_wx", content: "a".repeat(2049), createTime: "1700000000002" });
    expect(res.status).toBe(400);
  });

  test("边界长度 2048 字符通过", async () => {
    currentIp = freshIp();
    const res = await register({ wxId: "owner_wx", content: "b".repeat(2048), createTime: "1700000000003" });
    expect(res.status).toBe(200);
  });

  test("per-IP 超限返回 429", async () => {
    currentIp = freshIp();
    let status = 0;
    for (let i = 0; i < 31; i++) {
      status = (await register({ wxId: "ghost_wx", content: "spam", createTime: "1700000000004" })).status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });
});

/* ── /count ── */

describe("GET /count", () => {
  const blkId = sha256Hex("count-blacklist-msg");

  test("健康检查：非法 id 恒返回 200 {count:0}", async () => {
    currentIp = freshIp();
    for (const bad of ["", "abc", "Z".repeat(64)]) {
      const res = await app.request(`/count?wxId=owner_wx&id=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ count: 0 });
    }
  });

  test("排除三级黑名单 IP 后计数", async () => {
    currentIp = freshIp();
    insertMessage(blkId, "owner_wx", "count me");
    // 可见 1 条；消息级 / 账户级 / 全局黑名单各命中 1 条
    insertRead(blkId, "10.20.0.1", "2026-01-01 00:00:05");
    insertRead(blkId, "10.20.0.2", "2026-01-01 00:00:05");
    insertRead(blkId, "10.20.0.3", "2026-01-01 00:00:05");
    insertRead(blkId, "10.20.0.4", "2026-01-01 00:00:05");
    sqlite.query("INSERT INTO ip_block_message (id, ip, created_at) VALUES (?, ?, ?)").run(blkId, "10.20.0.2", "2026-01-01 00:00:06");
    sqlite.query("INSERT INTO ip_block_account (wx_id, ip, created_at) VALUES (?, ?, ?)").run("owner_wx", "10.20.0.3", "2026-01-01 00:00:06");
    sqlite.query("INSERT INTO ip_block_global (ip, created_at) VALUES (?, ?)").run("10.20.0.4", "2026-01-01 00:00:06");

    const res = await app.request(`/count?wxId=owner_wx&id=${blkId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });

  test("不存在的消息返回 {count:0}", async () => {
    currentIp = freshIp();
    const res = await app.request(`/count?wxId=owner_wx&id=${sha256Hex("no-such-message")}`);
    expect(await res.json()).toEqual({ count: 0 });
  });

  test("per-IP 超限返回 429", async () => {
    currentIp = freshIp();
    let status = 0;
    for (let i = 0; i <= 60; i++) {
      status = (await app.request(`/count?wxId=owner_wx&id=${blkId}`)).status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });
});

/* ── publicReadOr 访问矩阵 ── */

describe("publicReadOr（/reads/:id/data）", () => {
  const pubId = sha256Hex("public-msg");
  const privId = sha256Hex("private-msg");
  insertMessage(pubId, "owner_wx", "public content", 1);
  insertMessage(privId, "owner_wx", "private content", 0);

  test("匿名 + 公开消息 → 200 只读", async () => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${pubId}/data`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; content: string };
    expect(body.id).toBe(pubId);
    expect(body.content).toBe("public content");
  });

  test("匿名 + 私有消息 → 401", async () => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${privId}/data`);
    expect(res.status).toBe(401);
  });

  test("owner + 私有消息 → 200", async () => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${privId}/data`, { headers: authCookie("owner_wx") });
    expect(res.status).toBe(200);
  });

  test("admin + 私有消息 → 200", async () => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${privId}/data`, { headers: authCookie("admin_wx") });
    expect(res.status).toBe(200);
  });

  test("无关登录用户 + 私有消息 → 403", async () => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${privId}/data`, { headers: authCookie("other_wx") });
    expect(res.status).toBe(403);
  });
});

/* ── /reads/:id/data 的全量汇总与身份字段（SPA 钻取页用） ── */

describe("GET /reads/:id/data summary", () => {
  const id = sha256Hex("summary-msg");
  const pubId = sha256Hex("summary-msg-public");
  insertUser("sum_wx", 3);
  insertMessage(id, "sum_wx", "summary content");
  insertMessage(pubId, "sum_wx", "summary public", 1);
  const put = (ip: string, ts: string, ua: string, country = "", isp = "") =>
    sqlite
      .query("INSERT INTO reads (id, ip, timestamp, user_agent, country, region, city, isp) VALUES (?, ?, ?, ?, ?, '', '', ?)")
      .run(id, ip, ts, ua, country, isp);

  // 时间刻意选在 2026-01：后面的「stats 游标」用例断言的是回填后游标停在自己的
  // 2026-02-01 上，而游标取的是全库 MAX(timestamp) —— 这里放更晚的时间会把它们改掉（共享 :memory: 库）
  put("10.40.0.1", "2026-01-04 05:00:00", "Mozilla/5.0 (iPhone) MicroMessenger/8.0.49", "中国", "中国电信");
  put("10.40.0.2", "2026-01-04 05:30:00", "Mozilla/5.0 (iPhone) MicroMessenger/8.0.49");
  put("10.40.0.3", "2026-01-04 22:00:00", "Mozilla/5.0 (Windows NT 10.0) Chrome/128", "美国", "AWS");
  put("10.40.0.4", "2026-01-05 01:00:00", "curl/8.9.0");
  // 拉黑一条：它既不该出现在表格里，也不该出现在图里
  sqlite.query("INSERT INTO ip_block_message (id, ip, created_at) VALUES (?, ?, ?)").run(id, "10.40.0.2", "2026-01-04 06:00:00");

  type Payload = {
    sentAt: string;
    isPublic: boolean;
    isOwner: boolean;
    canManage: boolean;
    ownerWxId: string | null;
    total: number;
    blockedCount: number;
    visibleTotal: number;
    reads: Array<{ ip: string }>;
    summary: {
      hours: Array<{ hour: number; count: number }>;
      regions: Array<{ country: string; region: string; count: number }>;
      isps: Array<{ isp: string; count: number }>;
      userAgents: Array<{ kind: string; count: number }>;
      located: { count: number; ratio: number | null };
      firstReadSeconds: number | null;
    };
  };
  const get = async (msgId: string, wxId?: string): Promise<Payload> => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${msgId}/data`, wxId ? { headers: authCookie(wxId) } : undefined);
    return (await res.json()) as Payload;
  };

  test("汇总覆盖全部可见行，不受分页影响", async () => {
    const p = await get(id, "sum_wx");
    expect(p.total).toBe(4);
    expect(p.blockedCount).toBe(1);
    expect(p.visibleTotal).toBe(3);
    expect(p.reads.length).toBe(3);
    const hourSum = p.summary.hours.reduce((a, h) => a + h.count, 0);
    expect(hourSum).toBe(3); // 被拉黑的那次不算
    expect(p.summary.hours[5]?.count).toBe(1);
    expect(p.summary.hours[22]?.count).toBe(1);
    expect(p.summary.hours[1]?.count).toBe(1);
    // 分桶与 ua_stats 用的是同一个 UA_KIND_SQL：微信内优先于 iOS
    expect(new Map(p.summary.userAgents.map((u) => [u.kind, u.count]))).toEqual(
      new Map([["wechat", 1], ["desktop", 1], ["other", 1]]),
    );
    // 发出 2026-01-01 00:00 → 最早可见已读 2026-01-04 05:00
    expect(p.summary.firstReadSeconds).toBe(3 * 86_400 + 5 * 3_600);
  });

  test("地域/运营商只统计已定位行，并给出覆盖比值", async () => {
    const p = await get(id, "sum_wx");
    expect(p.summary.located.count).toBe(2);
    expect(p.summary.located.ratio).toBeCloseTo(2 / 3, 5);
    expect(p.summary.regions.map((r) => r.country)).toEqual(["中国", "美国"]);
    expect(p.summary.isps.map((i) => i.isp).sort()).toEqual(["AWS", "中国电信"]);
  });

  test("身份字段：owner / admin / 无关用户各有各的可见范围", async () => {
    const mine = await get(id, "sum_wx");
    expect([mine.isOwner, mine.canManage, mine.ownerWxId, mine.isPublic]).toEqual([true, true, "sum_wx", false]);
    const admin = await get(id, "admin_wx");
    expect([admin.isOwner, admin.canManage, admin.ownerWxId]).toEqual([false, true, "sum_wx"]);
    // 别人的公开消息：能看，但不因此拿到 wxId 或管理权
    const visitor = await get(pubId, "other_wx");
    expect([visitor.isOwner, visitor.canManage, visitor.ownerWxId, visitor.isPublic]).toEqual([
      false,
      false,
      null,
      true,
    ]);
  });

  test("匿名访问私有消息仍是 401，不会漏出汇总", async () => {
    currentIp = freshIp();
    const res = await app.request(`/reads/${id}/data`);
    expect(res.status).toBe(401);
  });

  test("sentAt 回的是消息发出时间", async () => {
    const p = await get(id, "sum_wx");
    expect(p.sentAt).toBe("2026-01-01 00:00:00"); // insertMessage 的固定夹具时间
  });
});

/* ── stats 游标 ── */

describe("stats 游标", () => {
  const statCount = (wxId: string): number =>
    (sqlite.query("SELECT COALESCE(SUM(count), 0) AS s FROM read_stats WHERE wx_id = ?").get(wxId) as { s: number }).s;

  test("同秒多条 reads 全部计入", async () => {
    const id = sha256Hex("stats-same-second");
    insertMessage(id, "stat_a", "same second");
    insertRead(id, "10.30.0.1", "2026-02-01 00:00:01");
    insertRead(id, "10.30.0.2", "2026-02-01 00:00:01");
    backfillStats();
    expect(statCount("stat_a")).toBe(2);
  });

  test("游标推进后同秒新写入不丢失（旧实现永久漏统计的场景）", async () => {
    const id = sha256Hex("stats-same-second");
    const before = statCount("stat_a");
    insertRead(id, "10.30.0.3", "2026-02-01 00:00:01");
    backfillStats();
    expect(statCount("stat_a") - before).toBe(1);
    // 游标已是新格式 rowid|timestamp，且时间边界为该秒
    const cur = getCursor();
    expect(cur.rid).toBeGreaterThan(0);
    expect(cur.ts).toBe("2026-02-01 00:00:01");
  });

  test("旧格式游标自动换算，同秒新写入被补计且不重复", async () => {
    // 模拟旧版本遗留游标（纯 timestamp）
    sqlite
      .query("INSERT INTO meta (key, value) VALUES ('stats_cursor', '2026-02-01 00:00:01') ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run();
    const before = statCount("stat_a");
    backfillStats(); // 迁移触发：旧格式换算并物化为 rowid 游标（此刻无新数据，应为 no-op）
    expect(getCursor().ts).toBe("2026-02-01 00:00:01");
    const id = sha256Hex("stats-same-second");
    // 与旧游标同秒的新写入：旧实现按 timestamp > 游标会永久漏统计
    insertRead(id, "10.30.0.4", "2026-02-01 00:00:01");
    backfillStats();
    expect(statCount("stat_a") - before).toBe(1);
  });

  test("rowid 复用检测触发全量重算，总量与 reads 一致", async () => {
    backfillStats(); // 先把游标推到最新
    const cur = getCursor();
    // 模拟「大面积删除导致 rowid 复用」后的状态：历史游标 rowid 远超当前实际，
    // 且随后出现 rowid ≤ 游标、时间晚于游标的行 → 增量边界不可信，必须全量重算
    sqlite.query("UPDATE meta SET value = ? WHERE key = 'stats_cursor'").run(`${cur.rid + 100}|${cur.ts}`);
    const reusedId = sha256Hex("stats-reuse");
    insertMessage(reusedId, "stat_b", "reuse");
    insertRead(reusedId, "10.31.0.1", "2030-01-01 00:00:00");

    const expectedTotal =
      (sqlite.query("SELECT COUNT(*) AS n FROM reads r JOIN messages m ON m.id = r.id").get() as { n: number }).n;
    backfillStats();

    const total =
      (sqlite.query("SELECT COALESCE(SUM(count), 0) AS s FROM read_stats").get() as { s: number }).s;
    expect(total).toBe(expectedTotal);
    expect(statCount("stat_b")).toBe(1);
    // v8 的两张新表必须一起重建：aggregateSince(0) 是 DO UPDATE 累加，
    // 漏清就会在旧值上再加一遍（这两张与 read_stats 同为「按 reads 行数」口径，
    // message_read_stats 是「按当日去重消息数」口径，不能一起比）。
    for (const table of ["hour_stats", "ua_stats"]) {
      const sum = (sqlite.query(`SELECT COALESCE(SUM(count), 0) AS s FROM ${table}`).get() as { s: number }).s;
      expect([table, sum]).toEqual([table, expectedTotal]);
    }
    // 游标推进到复用行的时间戳
    expect(getCursor().ts).toBe("2030-01-01 00:00:00");

    // 重算后再次回填为幂等 no-op
    const again = statCount("stat_b");
    backfillStats();
    expect(statCount("stat_b")).toBe(again);
  });
});

/* ── IP 定位配额（按 UTC 自然日） ── */

describe("POST /reads/:id/geo（配额跨天归零）", () => {
  const geoId = sha256Hex("geo-quota-msg");
  const quota = geoQuotaFor(3);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  insertUser("geo_wx", 3);
  insertMessage(geoId, "geo_wx", "geo me");

  function setUsage(wxId: string, count: number, date: string): void {
    sqlite.query("UPDATE users SET geo_count = ?, geo_date = ? WHERE wx_id = ?").run(count, date, wxId);
  }

  function usage(wxId: string): { geo_count: number; geo_date: string } {
    return sqlite
      .query("SELECT geo_count, geo_date FROM users WHERE wx_id = ?")
      .get(wxId) as { geo_count: number; geo_date: string };
  }

  function locate(ip: string) {
    return app.request(`/reads/${geoId}/geo`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authCookie("geo_wx") },
      body: JSON.stringify({ ip }),
    });
  }

  test("跨天首次定位从 1 起算，不继承昨日用量", async () => {
    currentIp = freshIp();
    insertRead(geoId, "10.50.0.1", "2026-04-01 00:00:10");
    setUsage("geo_wx", quota - 1, yesterday);
    const res = await locate("10.50.0.1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { remaining: number; quota: number };
    expect(body.quota).toBe(quota);
    // 修复前：geo_count = (quota - 1) + 1 → remaining 被昨日用量吞掉（此处为 0）
    expect(body.remaining).toBe(quota - 1);
    expect(usage("geo_wx")).toEqual({ geo_count: 1, geo_date: today });
  });

  test("昨日配额已耗尽时 remaining 不为负", async () => {
    currentIp = freshIp();
    insertRead(geoId, "10.50.0.2", "2026-04-01 00:00:11");
    setUsage("geo_wx", quota, yesterday);
    const res = await locate("10.50.0.2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { remaining: number };
    // 修复前：geo_count = quota + 1 → remaining = -1
    expect(body.remaining).toBe(quota - 1);
    expect(body.remaining).toBeGreaterThanOrEqual(0);
  });

  test("同日连续定位继续累加（不改变同日语义）", async () => {
    currentIp = freshIp();
    insertRead(geoId, "10.50.0.3", "2026-04-01 00:00:12");
    setUsage("geo_wx", 1, today);
    const res = await locate("10.50.0.3");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { remaining: number };
    expect(body.remaining).toBe(quota - 2);
    expect(usage("geo_wx").geo_count).toBe(2);
  });

  test("回收只清理陈旧计数：当日用量不受影响，且幂等", () => {
    setUsage("geo_wx", 2, today);
    setUsage("other_wx", 7, yesterday);
    recycleStaleGeoCounts();
    // 当日用量必须保持 —— 否则 dailyCleanup 在启动时执行就等于「重启即配额加满」
    expect(usage("geo_wx").geo_count).toBe(2);
    expect(usage("other_wx").geo_count).toBe(0);
    // 幂等：已归零的行不再匹配，重复执行无副作用
    recycleStaleGeoCounts();
    expect(usage("other_wx").geo_count).toBe(0);
    expect(usage("geo_wx").geo_count).toBe(2);
  });

  test("配额耗尽后返回 429", async () => {
    currentIp = freshIp();
    insertRead(geoId, "10.50.0.4", "2026-04-01 00:00:13");
    setUsage("geo_wx", quota, today);
    const res = await locate("10.50.0.4");
    expect(res.status).toBe(429);
    expect((await res.json()) as { error: string }).toEqual(
      expect.objectContaining({ error: "geo_quota_exceeded" }),
    );
  });
});

/* ── IP 解析失败时的自动拉黑守卫 ── */

describe("POST /register 的来源 IP 自动拉黑", () => {
  test("UNKNOWN_IP 不进黑名单（否则该消息的全部已读会被过滤掉）", async () => {
    insertUser("guard_wx", 5);
    currentIp = UNKNOWN_IP;
    const res = await register({ wxId: "guard_wx", content: "unknown ip", createTime: String(Date.now()) });
    expect(res.status).toBe(200);
    const id = ((await res.json()) as { id: string }).id;
    expect((sqlite.query("SELECT COUNT(*) AS n FROM ip_block_message WHERE id = ?").get(id) as { n: number }).n).toBe(0);

    // 对照组：能解析出 IP 时仍然自动拉黑，这条既有语义不能被守卫顺手删掉
    currentIp = freshIp();
    const res2 = await register({ wxId: "guard_wx", content: "known ip", createTime: String(Date.now()) });
    const id2 = ((await res2.json()) as { id: string }).id;
    expect((sqlite.query("SELECT COUNT(*) AS n FROM ip_block_message WHERE id = ?").get(id2) as { n: number }).n).toBe(1);
  });
});

describe('POST /reads/:id/block 的 action:"current"', () => {
  const id = sha256Hex("block-current-msg");
  insertUser("blk_wx", 5);
  insertMessage(id, "blk_wx", "block my own visitor");

  const block = (wxId: string, body: unknown) =>
    app.request(`/reads/${id}/block`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authCookie(wxId) },
      body: JSON.stringify(body),
    });

  test("IP 解析不出来时返回 ip_unavailable，而不是把哨兵值写进黑名单", async () => {
    currentIp = UNKNOWN_IP;
    const res = await block("blk_wx", { action: "current" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ip_unavailable" });
    expect((sqlite.query("SELECT COUNT(*) AS n FROM ip_block_message WHERE id = ?").get(id) as { n: number }).n).toBe(0);
  });

  test("能解析出 IP 时正常拉黑当前访问者", async () => {
    const ip = freshIp();
    currentIp = ip;
    const res = await block("blk_wx", { action: "current" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ip });
  });
});

/* ── users.message_count 是冗余计数：每条删除路径都必须重算，否则永久偏高 ── */

describe("删除消息后 users.message_count 不漂移", () => {
  let seq = 0;
  /** 用 /register 造数据：它是唯一原本就维护 message_count 的路径，基线可信 */
  async function put(wxId: string): Promise<string> {
    currentIp = freshIp();
    const res = await register({ wxId, content: `mc-${wxId}-${seq++}`, createTime: String(Date.now()) });
    expect(res.status).toBe(200);
    return ((await res.json()) as { id: string }).id;
  }
  const stored = (wxId: string) =>
    (sqlite.query("SELECT message_count AS n FROM users WHERE wx_id = ?").get(wxId) as { n: number }).n;
  const actual = (wxId: string) =>
    (sqlite.query("SELECT COUNT(*) AS n FROM messages WHERE wx_id = ?").get(wxId) as { n: number }).n;

  test("DELETE /reads/:id（本人删一条）", async () => {
    insertUser("mc_owner", 9);
    const a = await put("mc_owner");
    await put("mc_owner");
    expect(stored("mc_owner")).toBe(2);
    expect((await app.request(`/reads/${a}`, { method: "DELETE", headers: authCookie("mc_owner") })).status).toBe(200);
    expect(stored("mc_owner")).toBe(1);
    expect(stored("mc_owner")).toBe(actual("mc_owner"));
  });

  test("DELETE /messages（清除我的）", async () => {
    insertUser("mc_mine", 9);
    await put("mc_mine");
    await put("mc_mine");
    expect((await app.request("/messages", { method: "DELETE", headers: authCookie("mc_mine") })).status).toBe(200);
    expect(stored("mc_mine")).toBe(0);
    expect(stored("mc_mine")).toBe(actual("mc_mine"));
  });

  test("DELETE /admin/messages/:id 与 DELETE /admin/messages?wxId=", async () => {
    insertUser("mc_target", 9);
    const a = await put("mc_target");
    await put("mc_target");
    const admin = authCookie("admin_wx");
    expect((await app.request(`/admin/messages/${a}`, { method: "DELETE", headers: admin })).status).toBe(200);
    expect(stored("mc_target")).toBe(1);
    expect((await app.request("/admin/messages?wxId=mc_target", { method: "DELETE", headers: admin })).status).toBe(200);
    expect(stored("mc_target")).toBe(0);
    expect(stored("mc_target")).toBe(actual("mc_target"));
  });
});

/* ── 排行榜：榜（前 10）与"我的名次"必须同源 ── */

describe("GET /leaderboard 与 GET /leaderboard/me", () => {
  type BoardRow = { wxId?: string; id?: string; content?: string; count: number; me: boolean; isPublic?: boolean };
  type MeResp = { rank: number | null; count: number; total: number };

  const board = async (q: string, wxId: string): Promise<BoardRow[]> =>
    (await (await app.request(`/leaderboard${q}`, { headers: authCookie(wxId) })).json()) as BoardRow[];
  const myRank = async (q: string, wxId: string): Promise<MeResp> =>
    (await (await app.request(`/leaderboard/me${q}`, { headers: authCookie(wxId) })).json()) as MeResp;

  /** 注册榜：一条 registration_stats 行就是一个账号的计数 */
  const seedReg = (wxId: string, count: number): void => {
    insertUser(wxId, 3);
    sqlite
      .query("INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, ?)")
      .run("2026-06-06", wxId, count);
  };

  // 数量级刻意远大于其它夹具（它们都是个位数），这样"谁在前面"由本用例说了算
  seedReg("lb_first", 900_000_000);
  seedReg("lb_second", 800_000_000);
  seedReg("lb_tie_a", 700_000_000);
  seedReg("lb_tie_b", 700_000_000);
  insertUser("lb_none", 3);

  test("榜的响应形状不变（旧 /rank 页面按裸数组解析）", async () => {
    const rows = await board("?metric=reg&scope=total", "lb_first");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(10);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["count", "me", "wxId"]);
    expect(rows[0]?.me).toBe(true); // 9e8 排在最前，第一行就是我
  });

  test("名次与榜内位置一致；并列共享名次；计数大的名次靠前", async () => {
    const first = await myRank("?metric=reg&scope=total", "lb_first");
    expect(first.rank).toBe(1);
    expect(first.count).toBe(900_000_000);
    // 榜上第一行的位置就是名次 1
    const rows = await board("?metric=reg&scope=total", "lb_first");
    if (first.rank === null) throw new Error("用例前提不成立：lb_first 应当有名次");
    expect(rows.findIndex((r) => r.me)).toBe(first.rank - 1);

    const second = await myRank("?metric=reg&scope=total", "lb_second");
    expect(second.rank).toBe(2);

    const tieA = await myRank("?metric=reg&scope=total", "lb_tie_a");
    const tieB = await myRank("?metric=reg&scope=total", "lb_tie_b");
    expect(tieA.rank).toBe(tieB.rank);
    expect(tieA.rank).toBe(3); // 竞赛名次：前面只有 9e8 与 8e8 两个更大的
  });

  test("没有计数 → rank null，而不是「第 0 名」或「查不到」", async () => {
    const none = await myRank("?metric=reg&scope=total", "lb_none");
    expect(none.rank).toBeNull();
    expect(none.count).toBe(0);
    expect(none.total).toBeGreaterThan(0); // 榜上有人，只是我没数据 —— 两者不是一回事
  });

  test("日榜按 UTC 今日过滤，与总榜互串即是错", async () => {
    // 夹具写在 2026-06-06：日榜（今天）里不该有它的计数
    const day = await myRank("?metric=reg&scope=day", "lb_first");
    expect(day.rank).toBeNull();
    expect(day.count).toBe(0);
  });

  test("消息榜：我的名次取最好的一条，行带 isPublic 供钻取判定", async () => {
    insertUser("lb_msg_wx", 9);
    const weak = sha256Hex("lb-msg-weak");
    const strong = sha256Hex("lb-msg-strong");
    for (const [id, pub] of [[weak, 0], [strong, 1]] as Array<[string, number]>) {
      sqlite
        .query("INSERT INTO messages (id, wx_id, content, timestamp, is_public) VALUES (?, ?, ?, ?, ?)")
        .run(id, "lb_msg_wx", `消息榜夹具 ${id.slice(0, 4)}`, "2026-06-06 00:00:00", pub);
    }
    for (let i = 0; i < 3; i++) {
      sqlite
        .query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, '2026-06-06 01:00:00', '')")
        .run(weak, `203.0.${i}.1`);
    }
    for (let i = 0; i < 7; i++) {
      sqlite
        .query("INSERT INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, '2026-06-06 01:00:00', '')")
        .run(strong, `203.1.${i}.1`);
    }

    const me = await myRank("?metric=msg&scope=total", "lb_msg_wx");
    expect(me.count).toBe(7); // 最好的一条（而不是平均或求和）决定我的位置
    expect(me.rank).not.toBeNull();

    const rows = await board("?metric=msg&scope=total", "lb_msg_wx");
    const mine = rows.filter((r) => r.me);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine.map((r) => r.isPublic).sort()).toEqual([false, true]);
    expect(typeof mine[0]?.id).toBe("string");
  });

  test("非法 metric / scope 两个端点都回 400", async () => {
    for (const path of ["/leaderboard", "/leaderboard/me"]) {
      const res = await app.request(`${path}?metric=bogus`, { headers: authCookie("lb_first") });
      expect(res.status).toBe(400);
    }
  });

  test("未登录两个端点都回 401", async () => {
    expect((await app.request("/leaderboard")).status).toBe(401);
    expect((await app.request("/leaderboard/me")).status).toBe(401);
  });
});
