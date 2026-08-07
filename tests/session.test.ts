import { describe, expect, test } from "bun:test";

process.env.NODE_ENV = "production";
process.env.ADMIN = "wxid_admin_1";

const { default: app } = await import("../src/app");
const { migrate } = await import("../src/db");

migrate();

const get = (path: string, cookie?: string, origin = "http://lan.local") =>
  app.request(origin + path, { headers: { Cookie: cookie ?? "" } });

const post = (path: string, body: unknown, cookie?: string, origin = "http://lan.local") =>
  app.request(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
    body: JSON.stringify(body),
  });

describe("会话 cookie 随协议自适应（生产模式）", () => {
  test("HTTP 直连：session cookie，无 Secure，可正常登录", async () => {
    const reg = await post("/auth/register", { wxId: "wxid_http", password: "password123" }, undefined, "http://lan.local");
    expect(reg.status).toBe(200);
    const cookie = reg.headers.getSetCookie()[0];
    expect(cookie.startsWith("session=")).toBe(true);
    expect(cookie.includes("Secure")).toBe(false);
    const sc = cookie.split(";")[0];

    const page = await get("/", sc);
    expect(page.status).toBe(200);
  });

  test("HTTPS 直连：__Host-session + Secure", async () => {
    const reg = await post("/auth/register", { wxId: "wxid_tls", password: "password123" }, undefined, "https://wekit.example");
    expect(reg.status).toBe(200);
    const cookie = reg.headers.getSetCookie()[0];
    expect(cookie.startsWith("__Host-session=")).toBe(true);
    expect(cookie.includes("Secure")).toBe(true);
    expect(cookie.includes("Path=/")).toBe(true);
  });

  test("logout 删除同名 cookie", async () => {
    const reg = await post("/auth/register", { wxId: "wxid_http2", password: "password123" }, undefined, "http://lan.local");
    const sc = reg.headers.getSetCookie()[0].split(";")[0];

    const out = await post("/auth/logout", {}, sc, "http://lan.local");
    expect(out.status).toBe(200);
    const cleared = out.headers.getSetCookie()[0];
    expect(cleared.startsWith("session=")).toBe(true);
    expect(cleared.includes("Max-Age=0")).toBe(true);
  });
});
