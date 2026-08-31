import { afterAll, describe, expect, test } from "bun:test";

// 必须在动态 import 触发 config.ts 求值前设置（bunfig [test] preload 亦已兜底）
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

const { sqlite, migrate } = await import("./db");
const { default: app } = await import("./app");
const { sha256Hex, maskWxId } = await import("./utils");
const {
  getRetentionSettings,
  saveRetentionSettings,
  previewIdleUsers,
  purgeIdleUsers,
  PURGE_BATCH_LIMIT,
} = await import("./retention");
const { dailyCleanup } = await import("./stats");
const { utcDateDaysAgo, utcDaysAgo } = await import("./utils");

migrate();

/** 解析响应 JSON 并断言为特定类型（app.request 的 .json() 在 TS 下为 unknown） */
async function j<T>(res: Response | Promise<Response>): Promise<T> {
  return (await res).json() as T;
}
type RetentionSettings = { newUserDays: number; dormantDays: number; maxDays: number };
type IdleSample = { wxId: string; level: number; createdAt: string; reason: string; daysIdle: number };
type RetentionPreview = RetentionSettings & {
  total: number;
  purgeable: number;
  protectedCount: number;
  never: number;
  dormant: number;
  truncated: boolean;
  samples: IdleSample[];
};

const DUMMY_HASH = "x".repeat(60);
const HEX = "a".repeat(64);

let seq = 0;
const uid = (): string => `u_${seq++}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 本文件自建的用户。
 *
 * bun test 在测试文件间共享模块注册表，`src/db.ts` 是单例、`DB_PATH=:memory:` 也是同一份库。
 * 因此清理只能针对自己创建的行做定向删除，绝不能 `DELETE FROM users` 全表清空——
 * 那会抹掉其它测试文件（如 routes.test.ts 在模块顶层建的夹具）的数据。
 */
const created: string[] = [];

/** 建用户；createdAt 默认「很久以前」，保证落在任何清理窗口内 */
function insertUser(wxId: string, level = 1, createdAt = utcDaysAgo(365)): void {
  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(wxId, DUMMY_HASH, level, createdAt);
  if (!created.includes(wxId)) created.push(wxId);
}

/** 写入某天的注册消息计数（registration_stats 是「是否用过」的唯一可信来源） */
function addReg(wxId: string, dayOffset: number, count = 1): void {
  sqlite
    .query(
      "INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, ?) ON CONFLICT (date, wx_id) DO UPDATE SET count = count + excluded.count",
    )
    .run(utcDateDaysAgo(dayOffset), wxId, count);
}

function addMessage(wxId: string): string {
  const id = HEX.slice(0, 62) + ((seq++ % 100) + "").padStart(2, "0");
  sqlite
    .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
    .run(id, wxId, "hello", utcDaysAgo(1));
  sqlite.query("INSERT OR IGNORE INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, ?, '')").run(id, "10.0.0.9", utcDaysAgo(1));
  return id;
}

function addSession(wxId: string): void {
  sqlite
    .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run("sess_" + wxId, wxId, utcDaysAgo(1), "2099-01-01 00:00:00");
}

const STATS_DAY = utcDateDaysAgo(200);

/** 三张统计表各写一行，用于验证排行榜记录随用户一并清空 */
function addStats(wxId: string): void {
  for (const table of ["registration_stats", "read_stats", "message_read_stats"]) {
    sqlite
      .query(`INSERT INTO ${table} (date, wx_id, count) VALUES (?, ?, 5) ON CONFLICT (date, wx_id) DO UPDATE SET count = 5`)
      .run(STATS_DAY, wxId);
  }
}

/** 只清理本文件创建的用户及其连带数据；策略重置靠覆写两个 key，不动 meta 里的其它内容 */
function reset(): void {
  for (const wxId of created.splice(0)) {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(wxId);
    sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
    sqlite.query("DELETE FROM users WHERE wx_id = ?").run(wxId);
  }
  saveRetentionSettings({ newUserDays: 0, dormantDays: 0 });
}

// 跑完把夹具全部撤掉：共享内存库里残留的 admin_wx 会撞上 routes.test.ts 的模块级夹具
afterAll(reset);

// 注意：bun:sqlite 的 get() 无匹配行返回 null（不是 undefined），用 != null 判空
const exists = (wxId: string): boolean =>
  sqlite.query("SELECT 1 FROM users WHERE wx_id = ?").get(wxId) != null;

/* ── 设置读写 ── */

describe("保留策略设置", () => {
  test("默认两项均为 0（不清理）", () => {
    reset();
    expect(getRetentionSettings()).toEqual({ newUserDays: 0, dormantDays: 0 });
    expect(previewIdleUsers().purgeable).toBe(0);
  });

  test("保存后可读回，且立即生效无需重启", () => {
    reset();
    saveRetentionSettings({ newUserDays: 30, dormantDays: 180 });
    expect(getRetentionSettings()).toEqual({ newUserDays: 30, dormantDays: 180 });
    saveRetentionSettings({ newUserDays: 0, dormantDays: 0 });
    expect(getRetentionSettings()).toEqual({ newUserDays: 0, dormantDays: 0 });
  });

  test("规则关闭时预演与清理都不命中", () => {
    reset();
    insertUser(uid(), 1, utcDaysAgo(9999));
    expect(previewIdleUsers({ newUserDays: 0, dormantDays: 0 }).total).toBe(0);
    expect(purgeIdleUsers({ newUserDays: 0, dormantDays: 0 }).deleted).toBe(0);
  });
});

/* ── 规则一：注册后从未注册消息 ── */

describe("规则一：从未注册消息", () => {
  test("超出天数才删，未超不删", () => {
    reset();
    const old = uid();
    const fresh = uid();
    insertUser(old, 1, utcDaysAgo(60));
    insertUser(fresh, 1, utcDaysAgo(10));

    const preview = previewIdleUsers({ newUserDays: 30, dormantDays: 0 });
    expect(preview.never).toBe(1);
    expect(preview.samples[0]?.wxId).toBe(old);

    const r = purgeIdleUsers({ newUserDays: 30, dormantDays: 0 });
    expect(r.deleted).toBe(1);
    expect(exists(old)).toBe(false);
    expect(exists(fresh)).toBe(true);
  });

  test("注册过消息的用户不受此规则影响（哪怕很久没动静）", () => {
    reset();
    const used = uid();
    insertUser(used, 1, utcDaysAgo(60));
    addReg(used, 60);

    expect(previewIdleUsers({ newUserDays: 30, dormantDays: 0 }).purgeable).toBe(0);
    expect(purgeIdleUsers({ newUserDays: 30, dormantDays: 0 }).deleted).toBe(0);
    expect(exists(used)).toBe(true);
  });

  test("消息被配额裁光仍算「注册过」，不会被误删", () => {
    reset();
    const u = uid();
    insertUser(u, 1, utcDaysAgo(60));
    addReg(u, 40);
    // messages 为空：老用户被保留策略清过消息，但 registration_stats 留有痕迹
    expect(sqlite.query("SELECT COUNT(*) n FROM messages WHERE wx_id = ?").get(u)).toEqual({ n: 0 });
    expect(previewIdleUsers({ newUserDays: 30, dormantDays: 0 }).purgeable).toBe(0);
    expect(exists(u)).toBe(true);
  });
});

/* ── 规则二：注册过但长期沉寂 ── */

describe("规则二：注册过但长期沉寂", () => {
  test("最后一次注册消息超期才删", () => {
    reset();
    const dormant = uid();
    const active = uid();
    insertUser(dormant);
    insertUser(active);
    addReg(dormant, 90);
    addReg(active, 3);

    const preview = previewIdleUsers({ newUserDays: 0, dormantDays: 30 });
    expect(preview.dormant).toBe(1);
    expect(preview.samples[0]?.wxId).toBe(dormant);

    expect(purgeIdleUsers({ newUserDays: 0, dormantDays: 30 }).deleted).toBe(1);
    expect(exists(dormant)).toBe(false);
    expect(exists(active)).toBe(true);
  });

  test("取最近一次注册日期，而非累计值大小", () => {
    reset();
    const u = uid();
    insertUser(u);
    addReg(u, 400, 9999); // 历史很多，但都是 400 天前
    addReg(u, 400);
    expect(previewIdleUsers({ newUserDays: 0, dormantDays: 90 }).dormant).toBe(1);

    const recent = uid();
    insertUser(recent);
    addReg(recent, 400, 9999);
    addReg(recent, 1); // 最近还有动静
    expect(previewIdleUsers({ newUserDays: 0, dormantDays: 90 }).samples.map((s) => s.wxId)).not.toContain(recent);
  });
});

/* ── 豁免 ── */

describe("豁免账号", () => {
  test("管理员账号永不自动清理", () => {
    reset();
    insertUser("admin_wx", 1, utcDaysAgo(365));
    const p = previewIdleUsers({ newUserDays: 30, dormantDays: 30 });
    expect(p.protectedCount).toBe(1);
    expect(p.purgeable).toBe(0);
    expect(purgeIdleUsers({ newUserDays: 30, dormantDays: 30 }).deleted).toBe(0);
    expect(exists("admin_wx")).toBe(true);
  });

  test("已停用（level 0）账号永不自动清理", () => {
    reset();
    const banned = uid();
    insertUser(banned, 0, utcDaysAgo(365));
    const p = previewIdleUsers({ newUserDays: 30, dormantDays: 30 });
    expect(p.protectedCount).toBe(1);
    expect(exists(banned)).toBe(true);
  });
});

/* ── 预演分页 ── */

describe("预演分页", () => {
  test("offset/limit 只切样例，全量统计不变、分页不重叠不漏", () => {
    reset();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const u = uid();
      ids.push(u);
      insertUser(u, 1, utcDaysAgo(365)); // 全部「从未注册」，命中规则一
    }

    const page1 = previewIdleUsers({ newUserDays: 30, dormantDays: 0 }, 20, 0);
    expect(page1.purgeable).toBe(25);
    expect(page1.never).toBe(25);
    expect(page1.dormant).toBe(0);
    expect(page1.samples.length).toBe(20);

    const page2 = previewIdleUsers({ newUserDays: 30, dormantDays: 0 }, 20, 20);
    expect(page2.purgeable).toBe(25); // 全量计数不受 offset 影响
    expect(page2.samples.length).toBe(5);

    // 两页并集覆盖全部、互不重叠
    const page1Ids = page1.samples.map((s) => s.wxId);
    const page2Ids = page2.samples.map((s) => s.wxId);
    expect(new Set([...page1Ids, ...page2Ids]).size).toBe(25);
    for (const id of page2Ids) expect(page1Ids).not.toContain(id);

    // 越界 offset：样例为空但计数不变
    const beyond = previewIdleUsers({ newUserDays: 30, dormantDays: 0 }, 20, 100);
    expect(beyond.samples.length).toBe(0);
    expect(beyond.purgeable).toBe(25);
  });
});

/* ── 删除范围 ── */

describe("删除范围", () => {
  test("消息、已读、会话一并清空", () => {
    reset();
    const u = uid();
    insertUser(u);
    addMessage(u);
    addSession(u);
    addReg(u, 400);

    purgeIdleUsers({ newUserDays: 0, dormantDays: 90 });
    expect(exists(u)).toBe(false);
    expect(sqlite.query("SELECT COUNT(*) n FROM messages WHERE wx_id = ?").get(u)).toEqual({ n: 0 });
    expect(
      sqlite.query("SELECT COUNT(*) n FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").get(u),
    ).toEqual({ n: 0 });
    expect(sqlite.query("SELECT COUNT(*) n FROM sessions WHERE wx_id = ?").get(u)).toEqual({ n: 0 });
  });

  test("排行榜三张统计表随用户级联清空", () => {
    reset();
    const gone = uid();
    const keep = uid();
    insertUser(gone);
    insertUser(keep);
    addStats(gone);
    addStats(keep);
    addReg(keep, 1);

    purgeIdleUsers({ newUserDays: 0, dormantDays: 90 });
    for (const table of ["registration_stats", "read_stats", "message_read_stats"]) {
      expect(sqlite.query(`SELECT COUNT(*) n FROM ${table} WHERE wx_id = ?`).get(gone)).toEqual({ n: 0 });
      expect(sqlite.query(`SELECT COUNT(*) n FROM ${table} WHERE wx_id = ? AND date = ?`).get(keep, STATS_DAY)).toEqual({
        n: 1,
      });
    }
  });

  test("单次清理不超过批量上限，其余留待下次", () => {
    reset();
    for (let i = 0; i < PURGE_BATCH_LIMIT + 5; i++) insertUser(uid(), 1, utcDaysAgo(60));
    const r = purgeIdleUsers({ newUserDays: 30, dormantDays: 0 });
    expect(r.deleted).toBe(PURGE_BATCH_LIMIT);
    expect(r.truncated).toBe(true);
    const again = purgeIdleUsers({ newUserDays: 30, dormantDays: 0 });
    expect(again.deleted).toBe(5);
    expect(again.truncated).toBe(false);
  });

  test("预演不改动数据", () => {
    reset();
    const u = uid();
    insertUser(u);
    addMessage(u);
    addReg(u, 400);
    const before = sqlite.query("SELECT COUNT(*) n FROM users").get() as { n: number };
    previewIdleUsers({ newUserDays: 30, dormantDays: 30 });
    expect(sqlite.query("SELECT COUNT(*) n FROM users").get()).toEqual(before);
    expect(exists(u)).toBe(true);
  });
});

/* ── 管理端接口（前后端接线） ── */

function makeSession(wxId: string): string {
  const token = "sess_" + sha256Hex(wxId + ":" + Math.random());
  sqlite
    .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256Hex(token), wxId, utcDaysAgo(1), "2099-01-01 00:00:00");
  return token;
}
const cookieOf = (wxId: string): Record<string, string> => ({ cookie: `session=${makeSession(wxId)}` });

const getRetention = () => app.request("/admin/retention", { headers: cookieOf("admin_wx") });
const postRetention = (body: unknown, wxId = "admin_wx") =>
  app.request("/admin/retention", {
    method: "POST",
    headers: { "content-type": "application/json", ...cookieOf(wxId) },
    body: JSON.stringify(body),
  });

describe("管理端 /admin/retention 接口", () => {
  test("非管理员 403", async () => {
    reset();
    insertUser("admin_wx");
    insertUser("plain_wx");
    expect((await getRetention()).status).toBe(200);
    expect((await app.request("/admin/retention", { headers: cookieOf("plain_wx") })).status).toBe(403);
  });

  test("默认返回 0 与上限", async () => {
    reset();
    insertUser("admin_wx");
    expect(await j<RetentionSettings>(getRetention())).toEqual({ newUserDays: 0, dormantDays: 0, maxDays: 36500 });
  });

  test("非法天数被拒绝（负数 / 非整数 / 超上限 / 字符串 / 缺失）", async () => {
    reset();
    insertUser("admin_wx");
    const bad: unknown[] = [
      { newUserDays: -1, dormantDays: 0 },
      { newUserDays: 1.5, dormantDays: 0 },
      { newUserDays: 0, dormantDays: 36501 },
      { newUserDays: "30", dormantDays: 0 },
      { newUserDays: 0 },
      {},
    ];
    for (const body of bad) {
      expect((await postRetention(body)).status).toBe(400);
    }
    // 被拒绝的写入不能污染已存配置
    expect((await j<RetentionSettings>(getRetention())).newUserDays).toBe(0);
  });

  test("保存 → 预演 → 立即执行 全链路", async () => {
    reset();
    insertUser("admin_wx");
    const victim = uid();
    insertUser(victim, 1, utcDaysAgo(120));
    addStats(victim);

    expect((await postRetention({ newUserDays: 30, dormantDays: 90 })).status).toBe(200);
    expect((await j<RetentionSettings>(getRetention())).newUserDays).toBe(30);

    const preview = await j<RetentionPreview>(
      app.request("/admin/retention/preview?limit=20", { headers: cookieOf("admin_wx") }),
    );
    expect(preview.purgeable).toBe(1);
    // addStats 写了 registration_stats，所以命中的是「沉寂」而非「从未注册」
    expect(preview.dormant).toBe(1);
    expect(preview.never).toBe(0);
    expect(preview.protectedCount).toBe(1); // admin_wx 豁免
    expect(preview.samples[0]?.wxId).toBe(victim);
    expect(exists(victim)).toBe(true); // 预演不删数据

    const run = await app.request("/admin/retention/run", { method: "POST", headers: cookieOf("admin_wx") });
    expect(run.status).toBe(200);
    expect((await j<{ deleted: number }>(Promise.resolve(run))).deleted).toBe(1);
    expect(exists(victim)).toBe(false);
    // 排行榜随之清空（此处只断言该用户自己的行，避免与其它测试文件的统计行耦合）
    expect(sqlite.query("SELECT COUNT(*) n FROM read_stats WHERE wx_id = ?").get(victim)).toEqual({ n: 0 });

    // 审计留痕，便于事后追责
    const log = sqlite.query("SELECT detail FROM audit_logs WHERE action = 'admin_run_retention'").get() as
      | { detail: string }
      | null;
    expect(log?.detail).toContain("by=admin_wx");
  });

  test("预演接口分页返回 page/pageSize/totalPages 与切片样例", async () => {
    reset();
    insertUser("admin_wx");
    for (let i = 0; i < 25; i++) insertUser(uid(), 1, utcDaysAgo(365));
    await postRetention({ newUserDays: 30, dormantDays: 0 });

    const p1 = await j<RetentionPreview & { page: number; pageSize: number; totalPages: number }>(
      app.request("/admin/retention/preview?page=1&pageSize=20", { headers: cookieOf("admin_wx") }),
    );
    expect(p1.purgeable).toBe(25);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(20);
    expect(p1.totalPages).toBe(2);
    expect(p1.samples.length).toBe(20);

    const p2 = await j<RetentionPreview & { page: number; totalPages: number }>(
      app.request("/admin/retention/preview?page=2&pageSize=20", { headers: cookieOf("admin_wx") }),
    );
    expect(p2.samples.length).toBe(5);
    expect(p2.purgeable).toBe(25); // 全量统计跨页不变

    // 兼容旧 limit 参数
    const legacy = await j<RetentionPreview & { totalPages: number }>(
      app.request("/admin/retention/preview?limit=1", { headers: cookieOf("admin_wx") }),
    );
    expect(legacy.samples.length).toBe(1);
    expect(legacy.purgeable).toBe(25);
  });
});

/* ── 清理不依赖外键级联（防御性显式删除） ── */

describe("清理不依赖外键级联", () => {
  test("关闭 foreign_keys 时，删除用户仍清空排行榜三表", async () => {
    reset();
    insertUser("admin_wx");
    const victim = uid();
    insertUser(victim, 1, utcDaysAgo(365));
    addStats(victim);

    // 记录原始 FK 状态，结束后还原（bun test 跨文件共享同一 :memory: 连接）
    const fkBefore = (sqlite.query("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
    sqlite.exec("PRAGMA foreign_keys = OFF");
    try {
      // 外键关闭时 ON DELETE CASCADE 不会触发，若只靠级联，排行榜会残留孤儿行
      const res = await app.request(`/admin/users/${victim}`, {
        method: "DELETE",
        headers: cookieOf("admin_wx"),
      });
      expect(res.status).toBe(200);
      for (const table of ["registration_stats", "read_stats", "message_read_stats"]) {
        expect(sqlite.query(`SELECT COUNT(*) n FROM ${table} WHERE wx_id = ?`).get(victim)).toEqual({ n: 0 });
      }
      expect(exists(victim)).toBe(false);
      // 其他用户（含 admin_wx）不应被波及
      expect(exists("admin_wx")).toBe(true);
    } finally {
      sqlite.exec(`PRAGMA foreign_keys = ${fkBefore}`);
    }
  });
});

/* ── 注册消息排行榜孤儿行 ── */

describe("注册消息排行榜孤儿行", () => {
  test("孤儿 registration_stats 不出现在注册榜（即使数据尚未清理）", async () => {
    reset();
    insertUser("viewer");
    // 真实用户有数据
    sqlite
      .query("INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, 3)")
      .run(utcDateDaysAgo(10), "viewer");
    // 孤儿：wx_id 不在 users 中（模拟 FK 关闭删除后残留）。临时关外键才能插入
    sqlite.exec("PRAGMA foreign_keys = OFF");
    try {
      sqlite
        .query("INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, 999)")
        .run(utcDateDaysAgo(5), "ghost_user");
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }

    const data = await j<Array<{ wxId: string }>>(
      app.request("/leaderboard?metric=reg&scope=total", { headers: cookieOf("viewer") }),
    );
    expect(data.map((r) => r.wxId)).toContain(maskWxId("viewer"));
    expect(data.map((r) => r.wxId)).not.toContain(maskWxId("ghost_user"));
  });

  test("dailyCleanup 清掉三张统计表的孤儿行，保留真实用户", () => {
    reset();
    insertUser("real_user");
    for (const t of ["registration_stats", "read_stats", "message_read_stats"]) {
      sqlite.query(`INSERT INTO ${t} (date, wx_id, count) VALUES (?, ?, 5)`).run(utcDateDaysAgo(10), "real_user");
    }
    // 孤儿行（wx_id 不在 users）；临时关外键才能插入
    sqlite.exec("PRAGMA foreign_keys = OFF");
    try {
      for (const t of ["registration_stats", "read_stats", "message_read_stats"]) {
        sqlite.query(`INSERT INTO ${t} (date, wx_id, count) VALUES (?, ?, 9)`).run(utcDateDaysAgo(5), "ghost_" + t);
      }
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
    dailyCleanup();
    for (const t of ["registration_stats", "read_stats", "message_read_stats"]) {
      expect(sqlite.query(`SELECT COUNT(*) n FROM ${t} WHERE wx_id = ?`).get("ghost_" + t)).toEqual({ n: 0 });
      expect(sqlite.query(`SELECT COUNT(*) n FROM ${t} WHERE wx_id = ?`).get("real_user")).toEqual({ n: 1 });
    }
  });
});

/* ── 孤儿排行榜清理端点（后台按钮，免登服务器） ── */

describe("孤儿排行榜清理端点 /admin/retention/orphans", () => {
  const getOrphans = () => app.request("/admin/retention/orphans", { headers: cookieOf("admin_wx") });
  const postOrphans = (wxId = "admin_wx") =>
    app.request("/admin/retention/orphans", { method: "POST", headers: cookieOf(wxId) });

  test("非管理员 403", async () => {
    reset();
    insertUser("admin_wx");
    insertUser("plain_wx");
    expect((await getOrphans()).status).toBe(200);
    expect((await app.request("/admin/retention/orphans", { headers: cookieOf("plain_wx") })).status).toBe(403);
  });

  test("检测返回三表孤儿计数，清理后归零且写审计", async () => {
    reset();
    insertUser("admin_wx");
    insertUser("real_user");
    for (const t of ["registration_stats", "read_stats", "message_read_stats"]) {
      sqlite.query(`INSERT INTO ${t} (date, wx_id, count) VALUES (?, ?, 5)`).run(utcDateDaysAgo(10), "real_user");
    }
    // 孤儿行（wx_id 不在 users）；临时关外键才能插入
    sqlite.exec("PRAGMA foreign_keys = OFF");
    try {
      for (const t of ["registration_stats", "read_stats", "message_read_stats"]) {
        sqlite.query(`INSERT INTO ${t} (date, wx_id, count) VALUES (?, ?, 9)`).run(utcDateDaysAgo(5), "ghost_" + t);
      }
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }

    const before = await j<{ orphans: Record<string, number> }>(getOrphans());
    expect(before.orphans.registration_stats).toBe(1);
    expect(before.orphans.read_stats).toBe(1);
    expect(before.orphans.message_read_stats).toBe(1);

    const run = await j<{ ok: boolean; total: number; counts: Record<string, number> }>(postOrphans());
    expect(run.ok).toBe(true);
    expect(run.total).toBe(3);
    expect(run.counts.registration_stats).toBe(1);

    // 真实用户数据保留
    for (const t of ["registration_stats", "read_stats", "message_read_stats"]) {
      expect(sqlite.query(`SELECT COUNT(*) n FROM ${t} WHERE wx_id = ?`).get("real_user")).toEqual({ n: 1 });
    }
    // 孤儿归零
    const after = await j<{ orphans: Record<string, number> }>(getOrphans());
    expect(after.orphans.registration_stats).toBe(0);
    expect(after.orphans.read_stats).toBe(0);
    expect(after.orphans.message_read_stats).toBe(0);

    const log = sqlite.query("SELECT detail FROM audit_logs WHERE action = 'admin_cleanup_orphans'").get() as
      | { detail: string }
      | null;
    expect(log?.detail).toContain("by=admin_wx");
  });
});
