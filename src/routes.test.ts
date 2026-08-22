import { describe, expect, test } from "bun:test";

// 必须在动态 import 触发 config.ts 求值前设置（bunfig [test] preload 亦已兜底）
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

const { sqlite, migrate } = await import("./db");
const { default: app } = await import("./app");
const { backfillStats, getCursor } = await import("./stats");
const { setIpResolver } = await import("./rate-limit");
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
    // 游标推进到复用行的时间戳
    expect(getCursor().ts).toBe("2030-01-01 00:00:00");

    // 重算后再次回填为幂等 no-op
    const again = statCount("stat_b");
    backfillStats();
    expect(statCount("stat_b")).toBe(again);
  });
});
