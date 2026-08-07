import { describe, expect, test, beforeAll } from "bun:test";
import app from "../src/app";
import { sqlite, migrate } from "../src/db";
import { setIpResolver } from "../src/rate-limit";
import { backfillStats } from "../src/stats";

const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");

beforeAll(() => {
  migrate();
  setIpResolver((c) => c.req.header("x-ip") ?? "127.0.0.1");
});

const get = (path: string, cookie?: string, ip?: string) =>
  app.request(path, { headers: { Cookie: cookie ?? "", "x-ip": ip ?? "127.0.0.1" } });

const post = (path: string, body: unknown, cookie?: string, ip?: string) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie ?? "", "x-ip": ip ?? "127.0.0.1" },
    body: JSON.stringify(body),
  });

async function loginCookie(wxId: string, password: string, ip?: string): Promise<string> {
  const res = await post("/auth/verify", { wxId, password }, undefined, ip);
  expect(res.status).toBe(200);
  return res.headers.getSetCookie()[0].split(";")[0];
}

describe("端到端（客户端兼容）", () => {
  const WXID = "wxid_tester";
  const CONTENT = "hello";
  const CREATE_TIME = "1750000000000";
  const ID = sha(WXID + "\0" + CONTENT + "\0" + CREATE_TIME);

  test("/auth/status", async () => {
    const res = await app.request("/auth/status");
    expect(await res.json()).toEqual({ auth_required: true, invite_required: false });
  });

  test("/count 无记录恒为 {\"count\":0}，无效 id 也返回 {\"count\":0}", async () => {
    const res = await get(`/count?wxId=${WXID}&id=${ID}`);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.text()).toBe('{"count":0}');
    const bad = await app.request("/count?wxId=x&id=zzzz");
    expect(await bad.text()).toBe('{"count":0}');
  });

  test("先打点后注册竞态：/pixel 无状态，/register 后 /count 仍保留已读", async () => {
    for (const ip of ["1.1.1.1", "2.2.2.2", "1.1.1.1", "3.3.3.3"]) {
      const res = await get(`/pixel?wxId=${WXID}&id=${ID}`, undefined, ip);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
    expect(await (await get(`/count?wxId=${WXID}&id=${ID}`)).text()).toBe('{"count":3}');

    const register = await post("/auth/register", { wxId: WXID, password: "password123" }, undefined, "10.0.0.2");
    expect(register.status).toBe(200);
    const sc = register.headers.getSetCookie()[0].split(";")[0];

    const regMsg = await post("/register", { wxId: WXID, content: CONTENT, createTime: Number(CREATE_TIME) }, sc);
    expect(regMsg.status).toBe(200);
    expect((await regMsg.json()).id).toBe(ID);

    // 先打点后注册 → count 不丢
    expect(await (await get(`/count?wxId=${WXID}&id=${ID}`)).text()).toBe('{"count":3}');

    for (const ip of ["4.4.4.4", "5.5.5.5"]) {
      await get(`/pixel?wxId=${WXID}&id=${ID}`, undefined, ip);
    }
    expect(await (await get(`/count?wxId=${WXID}&id=${ID}`)).text()).toBe('{"count":5}');
  });

  test("登录后端点与权限隔离", async () => {
    const sc = await loginCookie(WXID, "password123", "10.0.0.3");

    const msgs = await get("/messages", sc);
    expect(msgs.status).toBe(200);
    const j = await msgs.json();
    expect(j.messages.length).toBe(1);
    expect(j.messages[0].read_count).toBe(5);

    expect((await app.request("/messages")).status).toBe(401);
    expect((await app.request("/leaderboard?period=day&metric=read")).status).toBe(401);

    const reads = await get(`/reads/${ID}`, sc);
    expect(reads.status).toBe(200);
    expect((await reads.json()).count).toBe(5);

    const otherId = sha("wxid_other\0x\0" + "9999999999999");
    expect((await get(`/reads/${otherId}`, sc)).status).toBe(404);

    expect((await get("/admin/users", sc)).status).toBe(403);
  });

  test("排行榜：统计回填后 me 标记", async () => {
    backfillStats();
    const sc = await loginCookie(WXID, "password123", "10.0.0.4");
    const lb = await get("/leaderboard?period=day&metric=read", sc);
    const j = await lb.json();
    expect(j.entries.some((e: any) => e.me && e.count === 5)).toBe(true);
  });

  test("配额清理：level 1 → 20 条，超出时删除最旧且同步清 reads", async () => {
    const sc = await loginCookie(WXID, "password123", "10.0.0.5");
    for (let i = 0; i < 25; i++) {
      const res = await post(
        "/register",
        { wxId: WXID, content: `msg${i}`, createTime: String(1750001000000 + i) },
        sc,
      );
      expect(res.status).toBe(200);
    }
    const msgs = await get("/messages", sc);
    const j = await msgs.json();
    expect(j.messages.length).toBe(20);

    const user = sqlite.query("SELECT message_count c FROM users WHERE wx_id = ?").get(WXID) as { c: number };
    expect(user.c).toBe(20);
  });

  test("限流：pixel/count fail-open，auth/admin fail-closed（各用独立 IP）", async () => {
    // count 超限仍返回 {"count":0}
    let last = "";
    for (let i = 0; i < 65; i++) {
      last = await (await get(`/count?wxId=x&id=${"b".repeat(64)}`, undefined, "10.1.1.1")).text();
    }
    expect(last).toBe('{"count":0}');

    // pixel 超限仍返回 PNG
    let pixelOk = true;
    for (let i = 0; i < 210; i++) {
      const res = await get(`/pixel?wxId=x&id=${"c".repeat(64)}`, undefined, "10.1.1.2");
      if (res.status !== 200 || res.headers.get("content-type") !== "image/png") pixelOk = false;
    }
    expect(pixelOk).toBe(true);

    // auth 超限 429
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await post("/auth/verify", { wxId: WXID, password: "wrong" }, undefined, "10.1.1.3");
      if (res.status === 429) got429 = true;
    }
    expect(got429).toBe(true);

    // admin 超限 429
    const adminRes = await post("/auth/register", { wxId: "wxid_admin", password: "password123" }, undefined, "10.1.1.4");
    expect(adminRes.status).toBe(200);
    const adminSc = adminRes.headers.getSetCookie()[0].split(";")[0];
    let admin429 = false;
    for (let i = 0; i < 35; i++) {
      const res = await get("/admin/users", adminSc, "10.1.1.4");
      if (res.status === 429) admin429 = true;
    }
    expect(admin429).toBe(true);
  });
});
