import { describe, expect, test } from "bun:test";

// 必须在动态 import 触发 config.ts 求值前设置（bunfig [test] preload 亦已兜底）
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

const { sqlite, migrate } = await import("./db");
const { default: app } = await import("./app");
const { backfillStats } = await import("./stats");
const { sha256Hex } = await import("./utils");

migrate();

type Overview = {
  from: string;
  to: string;
  tz: number;
  totals: {
    reads: number;
    regs: number;
    messages: number;
    messagesWithReads: number;
    distinctIps: number;
    coverage: number | null;
  };
  prev: { from: string; to: string; reads: number; messages: number };
  series: Array<{ date: string; reads: number; regs: number }>;
  hours: Array<{ hour: number; count: number }>;
  userAgents: Array<{ kind: string; count: number }>;
  located: { count: number; ratio: number | null };
  regions: Array<{ country: string; region: string; count: number }>;
  isps: Array<{ isp: string; count: number }>;
  avgFirstReadSeconds: number | null;
};

const ME = "ov_wx";
const token = "sess_" + sha256Hex("ov");

sqlite
  .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 5, 0, ?) ON CONFLICT(wx_id) DO UPDATE SET level = 5")
  .run(ME, "x".repeat(60), "2026-01-01 00:00:00");
sqlite
  .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
  .run(sha256Hex(token), ME, "2026-01-01 00:00:00", "2099-01-01 00:00:00");

const HEADERS = { cookie: `session=${token}` };

function msg(id: string, ts: string): void {
  sqlite
    .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
    .run(sha256Hex(id), ME, "内容 " + id, ts);
}

/** 已定位的行才写 country/isp —— 与真实按需定位的写入时机一致 */
function read(mid: string, ip: string, ts: string, ua: string, located: [string, string, string] | null): void {
  sqlite
    .query(
      `INSERT INTO reads (id, ip, timestamp, user_agent, country, region, city, isp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256Hex(mid),
      ip,
      ts,
      ua,
      located ? located[0] : "",
      located ? located[1] : "",
      located ? located[2] : "",
      located ? located[2] : "",
    );
}

const MM = "Mozilla/5.0 (Linux; Android 14; V2301A) MicroMessenger/8.0.49";
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) Chrome/129 Mobile Safari/537.36";

msg("a", "2026-01-05 10:00:00");
msg("b", "2026-01-06 23:30:00");
// a：10:05 微信内已定位；22:00 iOS 未定位
read("a", "10.0.0.1", "2026-01-05 10:05:00", MM, ["中国", "广东", "中国电信"]);
read("a", "10.0.0.2", "2026-01-05 22:00:00", IOS, null);
// b：跨到次日 01:00，已定位
read("b", "10.0.0.3", "2026-01-07 01:00:00", ANDROID, ["中国", "浙江", "中国联通"]);

backfillStats();

/** app.request 的返回类型是 Response | Promise<Response>，必须先 await 再取 json */
async function fetchOverview(qs = ""): Promise<Overview> {
  const res = await app.request(`/stats/overview${qs}`, { headers: HEADERS });
  return (await res.json()) as Overview;
}

const WINDOW = "?from=2026-01-01&to=2026-01-31";

describe("GET /stats/overview", () => {
  test("未登录 401", async () => {
    expect((await app.request("/stats/overview")).status).toBe(401);
  });

  test("总量与覆盖率", async () => {
    const o = await fetchOverview(WINDOW);
    expect(o.totals.reads).toBe(3);
    expect(o.totals.messages).toBe(2);
    expect(o.totals.messagesWithReads).toBe(2);
    expect(o.totals.coverage).toBe(1);
  });

  /** 独立 IP 只能现算：三条 reads 恰好三个不同 IP */
  test("distinctIps 按窗口内去重", async () => {
    const full = await fetchOverview(WINDOW);
    expect(full.totals.distinctIps).toBe(3);
    // 收窄到 01-05：只剩消息 a 的两行、两个 IP
    const one = await fetchOverview("?from=2026-01-05&to=2026-01-05");
    expect(one.totals.distinctIps).toBe(2);
  });

  /** 环比窗口 = 紧邻的等长区间；rollup 与消息数都要能对齐前窗 */
  test("prev 是紧邻的等长窗口", async () => {
    const o = await fetchOverview("?from=2026-01-06&to=2026-01-08");
    expect(o.prev.from).toBe("2026-01-03");
    expect(o.prev.to).toBe("2026-01-05");
    expect(o.prev.reads).toBe(2); // a 的两行都在 01-05
    expect(o.prev.messages).toBe(1); // 只有消息 a
    expect(o.totals.reads).toBe(1); // 当前窗口只剩 b 的 01-07
    // 整月窗口的前窗是上个月，本夹具在那个月没有数据
    const wide = await fetchOverview(WINDOW);
    expect(wide.prev.reads).toBe(0);
    expect(wide.prev.messages).toBe(0);
  });

  /** 序列来自 read_stats rollup；01-07 也有 reads（消息 b 的次日阅读），要落在窗口内 */
  test("日序列按日期升序，且与 reads 实际分布一致", async () => {
    const o = await fetchOverview(WINDOW);
    const map = new Map(o.series.map((s) => [s.date, s.reads]));
    expect(map.get("2026-01-05")).toBe(2);
    expect(map.get("2026-01-07")).toBe(1);
    expect(o.series.map((s) => s.date)).toEqual([...o.series.map((s) => s.date)].sort());
  });

  /** 这是新建 hour_stats 的唯一理由：没有它就只能整段扫 reads */
  test("24 小时分布按 UTC 口径出桶", async () => {
    const o = await fetchOverview(WINDOW + "&tz=0");
    expect(o.hours.length).toBe(24);
    expect(o.hours[10]?.count).toBe(1);
    expect(o.hours[22]?.count).toBe(1);
    expect(o.hours[1]?.count).toBe(1);
    expect(o.hours.reduce((a, h) => a + h.count, 0)).toBe(3);
  });

  /** 小时分布是环形量，所以换时区必须是轮转而不是重新查询 */
  test("tz=8 把桶整体轮转", async () => {
    const utc = await fetchOverview(WINDOW + "&tz=0");
    const cst = await fetchOverview(WINDOW + "&tz=8");
    for (let h = 0; h < 24; h++) {
      expect(cst.hours[(h + 8) % 24]?.count).toBe(utc.hours[h]?.count);
    }
  });

  /** 与前端 uaKind() 同一套判定顺序：Android 上的微信要算 wechat，不能算 android */
  test("客户端分桶与前端 uaKind 对齐", async () => {
    const o = await fetchOverview(WINDOW);
    const kinds = new Map(o.userAgents.map((u) => [u.kind, u.count]));
    expect(kinds.get("wechat")).toBe(1);
    expect(kinds.get("ios")).toBe(1);
    expect(kinds.get("android")).toBe(1);
    expect(kinds.get("desktop") ?? 0).toBe(0);
  });

  /**
   * ① 的核心约束：归属地是点「定位」才写的按需数据，所以分部只覆盖已定位部分。
   * 响应必须把覆盖度一起给出，否则前端会画出"看起来是全量"的饼图。
   */
  test("地域/运营商分部附带其覆盖度，且只数已定位行", async () => {
    const o = await fetchOverview(WINDOW);
    expect(o.located.count).toBe(2);
    expect(o.located.ratio).toBeCloseTo(2 / 3, 5);
    expect(o.regions.length).toBe(2);
    expect(o.isps.map((i) => i.isp).sort()).toEqual(["中国电信", "中国联通"]);
  });

  test("首次已读耗时 = 每条消息首读与发送之差的均值", async () => {
    const o = await fetchOverview(WINDOW);
    // a: 10:00 → 10:05 = 300s；b: 01-06 23:30 → 01-07 01:00 = 5400s；均值 2850
    expect(o.avgFirstReadSeconds).toBe(2850);
  });

  test("窗口外无数据 → 覆盖率是 null 而不是 0（不假装知道）", async () => {
    const o = await fetchOverview("?from=2026-03-01&to=2026-03-05");
    expect(o.totals.messages).toBe(0);
    expect(o.totals.coverage).toBeNull();
    expect(o.totals.reads).toBe(0);
    expect(o.located.ratio).toBeNull();
  });

  /** 非法区间静默回落到默认窗口，不能 500 —— 前端会带任意用户输入 */
  test("非法 from/to 回落默认窗口且不报错", async () => {
    const o = await fetchOverview("?from=2026-1-5&to=bad");
    expect(o.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.to > o.from || o.to === o.from).toBe(true);
    const reversed = await fetchOverview("?from=2026-05-01&to=2026-01-01");
    expect(reversed.from <= reversed.to).toBe(true);
  });

  /** 跨度封顶一年：防止一个请求扫任意长的区间 */
  test("超长窗口被收窄到一年以内", async () => {
    const o = await fetchOverview("?from=2000-01-01&to=2026-01-31");
    const span =
      Math.round(
        (Date.parse(`${o.to}T00:00:00Z`) - Date.parse(`${o.from}T00:00:00Z`)) / 86_400_000,
      ) + 1;
    expect(span).toBeLessThanOrEqual(366);
  });

  test("只返回本人数据", async () => {
    const other = "ov_other";
    sqlite
      .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 5, 0, ?)")
      .run(other, "y".repeat(60), "2026-01-01 00:00:00");
    const t2 = "sess_other";
    sqlite
      .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(sha256Hex(t2), other, "2026-01-01 00:00:00", "2099-01-01 00:00:00");
    const res2 = await app.request(`/stats/overview${WINDOW}`, { headers: { cookie: `session=${t2}` } });
    const o = (await res2.json()) as Overview;
    expect(o.totals.reads).toBe(0);
    expect(o.totals.messages).toBe(0);
  });
});

/** v8 rollup 的回归位：回填任务必须真的把两张新表喂上 */
describe("hour_stats / ua_stats rollup", () => {
  test("rollup 行数受控（每用户每天最多 24 + 5 行）", () => {
    const h = sqlite.query("SELECT COUNT(*) n FROM hour_stats WHERE wx_id = ?").get(ME) as { n: number };
    const u = sqlite.query("SELECT COUNT(*) n FROM ua_stats WHERE wx_id = ?").get(ME) as { n: number };
    expect(h.n).toBe(3);
    expect(u.n).toBe(3);
  });

  /** 同一个游标跑两次不能重复累计 —— 这是 backfillStats 原本就有的保证，新表必须同样满足 */
  test("重复执行回填不重复累计", async () => {
    const before = (await fetchOverview(WINDOW)).totals.reads;
    backfillStats();
    backfillStats();
    expect((await fetchOverview(WINDOW)).totals.reads).toBe(before);
  });
});
