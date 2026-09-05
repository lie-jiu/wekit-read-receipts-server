import { afterEach, describe, expect, test } from "bun:test";

// 必须在动态 import 触发 config.ts 求值前设置（bunfig [test] preload 亦已兜底）
process.env.DB_PATH = ":memory:";

const { sqlite, migrate } = await import("./db");
const { hashPassword, login, verifyPassword } = await import("./auth");
const { PBKDF2_ITERATIONS } = await import("./config");
const { hashPassword: crossHash } = await import("./auth");

migrate();

/* bun test 所有文件共享同一内存库：本文件的夹具用户在收尾时清除，避免污染后续测试文件 */
afterEach(() => {
  sqlite.query("DELETE FROM users WHERE wx_id IN ('upgrade_wx', 'keep_wx')").run();
});

/* ── pbkdf2$ 格式与往返 ── */

describe("hashPassword / verifyPassword（pbkdf2$ 规范格式）", () => {
  test("输出格式 pbkdf2$iter$salt32hex$hash64hex", async () => {
    const h = await hashPassword("correct horse battery staple");
    const parts = h.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2");
    expect(parts[1]).toBe(String(PBKDF2_ITERATIONS));
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16 字节盐
    expect(parts[3]).toMatch(/^[0-9a-f]{64}$/); // 32 字节派生
  });

  test("同密码两次哈希盐不同、互可验证", async () => {
    const a = await hashPassword("p4ssw0rd-长密码-🔥");
    const b = await hashPassword("p4ssw0rd-长密码-🔥");
    expect(a).not.toBe(b);
    expect(await verifyPassword("p4ssw0rd-长密码-🔥", a)).toBe(true);
    expect(await verifyPassword("p4ssw0rd-长密码-🔥", b)).toBe(true);
  });

  test("错误密码拒绝", async () => {
    const h = await hashPassword("right-password");
    expect(await verifyPassword("wrong-password", h)).toBe(false);
  });

  test("与 node:crypto pbkdf2Sync 逐位一致（兼容旧 CF/D1 时代哈希）", async () => {
    // 用 Bun 自带的 node:crypto 生成一个「旧 Workers 端」向量，WebCrypto 实现必须能验证它
    const { pbkdf2Sync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const iter = 5000;
    const legacy = `pbkdf2$${iter}$${salt.toString("hex")}$${pbkdf2Sync("legacy-password", salt, iter, 32, "sha256").toString("hex")}`;
    expect(await verifyPassword("legacy-password", legacy)).toBe(true);
    expect(await verifyPassword("other-password", legacy)).toBe(false);
  });

  test("畸形/越界哈希拒绝", async () => {
    expect(await verifyPassword("x", "pbkdf2$")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$abc$zz$zz")).toBe(false); // 非数字迭代
    expect(await verifyPassword("x", "pbkdf2$999$aaaa$bbbb")).toBe(false); // 低于 1000
    expect(await verifyPassword("x", `pbkdf2$${2_000_000}$aaaa$${"b".repeat(64)}`)).toBe(false); // 超 PBKDF2_MAX_ITER
    expect(await verifyPassword("x", "unknown-format")).toBe(false);
  });

  test("argon2id 仅 Bun 运行时可验证（Workers 上安全降级为 false）", async () => {
    const argon = await Bun.password.hash("argon2-legacy", { algorithm: "argon2id" });
    expect(argon.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("argon2-legacy", argon)).toBe(true);
    expect(await verifyPassword("wrong", argon)).toBe(false);
  });
});

/* ── 登录时透明升级 ── */

describe("login() lazy rehash（存量 argon2id → pbkdf2$）", () => {
  test("argon2id 用户登录成功后哈希被升级，旧密码仍可登录", async () => {
    sqlite.query(
      "INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)",
    ).run("upgrade_wx", await Bun.password.hash("old-pass-1234"), "2026-01-01 00:00:00");

    expect(await login("upgrade_wx", "old-pass-1234")).toBe(true);
    const upgraded = (sqlite.query("SELECT password_hash FROM users WHERE wx_id = ?").get("upgrade_wx") as {
      password_hash: string;
    }).password_hash;
    expect(upgraded.startsWith("pbkdf2$")).toBe(true);
    // 升级后再次登录走 pbkdf2 分支
    expect(await login("upgrade_wx", "old-pass-1234")).toBe(true);
    expect(await login("upgrade_wx", "wrong-pass-99")).toBe(false);
  });

  test("pbkdf2$ 用户登录不触发改写", async () => {
    const h = await crossHash("keep-pass-1234");
    sqlite.query(
      "INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)",
    ).run("keep_wx", h, "2026-01-01 00:00:00");
    expect(await login("keep_wx", "keep-pass-1234")).toBe(true);
    expect((sqlite.query("SELECT password_hash FROM users WHERE wx_id = ?").get("keep_wx") as { password_hash: string }).password_hash).toBe(h);
  });

  test("不存在的用户返回 false", async () => {
    expect(await login("ghost_wx", "whatever-123")).toBe(false);
  });
});
