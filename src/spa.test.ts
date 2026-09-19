import { describe, expect, mock, test } from "bun:test";

// 与 routes.test.ts 同构：必须在 config.ts 求值前设定环境
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

mock.module("./geo", () => ({
  lookupIpLocation: async () => null,
}));

const { CSP, SPA_PATH, normalizeSpaPath } = await import("./config");
const { migrate } = await import("./db");
const { default: app } = await import("./app");
const { resolveStatic, setStaticReader, headersFor, spaHash, staticFallback } = await import("./spa");
const { Hono } = await import("hono");

migrate();

/* ── 纯路径判定 ── */

describe("normalizeSpaPath", () => {
  test("补前导斜杠、去尾部斜杠；空串表示接管根路径", () => {
    expect(normalizeSpaPath("/insights")).toBe("/insights");
    expect(normalizeSpaPath("insights")).toBe("/insights");
    expect(normalizeSpaPath("/insights/")).toBe("/insights");
    expect(normalizeSpaPath("/insights///")).toBe("/insights");
    expect(normalizeSpaPath("  ")).toBe("");
  });

  test("默认接管根路径（旧 SSR 页面已退役）", () => {
    expect(SPA_PATH).toBe("");
  });
});

describe("resolveStatic（哪些路径属于 SPA 产物）", () => {
  test("挂在子路径下：文档、斜杠重定向与前缀内的其它路径", () => {
    expect(resolveStatic("/insights", "/insights")).toEqual({ kind: "redirect", to: "/insights/" });
    expect(resolveStatic("/insights/", "/insights")).toEqual({ kind: "file", file: "index.html", html: true });
    // SPA 用 HashRouter，子路径下的其它地址都不是我们的路由 → 交回路由层给 JSON 404
    expect(resolveStatic("/insights/me", "/insights")).toBeNull();
    expect(resolveStatic("/insights/index.html", "/insights")).toBeNull();
  });

  test("挂在根路径下（默认形态）：/ 就是文档，没有重定向那一步", () => {
    expect(resolveStatic("/", "")).toEqual({ kind: "file", file: "index.html", html: true });
    expect(resolveStatic("/index.html", "")).toBeNull(); // 不留第二个文档地址
  });

  test("产物资源路径与挂载点无关（Vite base 保持根绝对）", () => {
    for (const base of ["", "/insights"]) {
      expect(resolveStatic("/assets/index-C5wqmxCe.js", base)).toEqual({
        kind: "file",
        file: "assets/index-C5wqmxCe.js",
        html: false,
      });
      expect(resolveStatic("/favicon.svg", base)).toEqual({ kind: "file", file: "favicon.svg", html: false });
    }
  });

  test("业务路径一律交回路由层", () => {
    for (const p of ["/login", "/messages", "/reads/abc/data", "/rank", "/admin", "/me", "/pixel", "/nope"]) {
      expect(resolveStatic(p, "")).toBeNull();
      expect(resolveStatic(p, "/insights")).toBeNull();
    }
  });

  test("不做 percent-decode：编码后的穿越序列留在白名单之外", () => {
    for (const p of [
      "/assets/..%2F..%2Fetc%2Fpasswd",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/..%2F.env",
      "/assets/x%00.js",
    ]) {
      expect(resolveStatic(p, "")).toBeNull();
    }
  });

  test("白名单之外的文件名与多级路径不接受", () => {
    for (const p of [
      "/assets/",
      "/assets/a/b.js", // 只允许一层
      "/assets/x.sh",
      "/index.html",
      "/etc/passwd",
      "/deep/nested/file.svg",
      "/assets/x y.js",
      "/robots.txt.bak",
    ]) {
      expect(resolveStatic(p, "")).toBeNull();
    }
  });
});

describe("spaHash（旧服务端页面的新去处）", () => {
  test("跟着挂载点走，不写死根路径", () => {
    expect(spaHash("/login")).toBe("/#/login");
    expect(spaHash("/reads/abc")).toBe("/#/reads/abc");
  });
});

describe("headersFor", () => {
  test("HTML 带 CSP 且不缓存，资源可永久缓存", () => {
    expect(headersFor({ kind: "file", file: "index.html", html: true })).toEqual({
      "Cache-Control": "no-store",
      "Content-Security-Policy": CSP.INSIGHTS,
    });
    expect(headersFor({ kind: "file", file: "assets/a.js", html: false })).toEqual({
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  test("CSP：脚本收紧到只有同源，内联只让给样式", () => {
    const directives = new Map(
      CSP.INSIGHTS.split(";").map((d) => {
        const [name, ...rest] = d.trim().split(/\s+/);
        return [name!, rest.join(" ")] as const;
      }),
    );
    // 产物全是带哈希的同源 module script：这几条是这道防线的全部意义，退化即失守
    expect(directives.get("script-src")).toBe("'self'");
    expect(directives.get("default-src")).toBe("'none'");
    expect(directives.get("object-src")).toBe("'none'");
    expect(directives.get("base-uri")).toBe("'none'");
    expect(directives.get("frame-ancestors")).toBe("'none'");
    // style-src 的让步是实测出来的（sonner/主题原语运行时插 <style>），
    // 记录在此是为了让它停在"只有样式"这一处，别哪天蔓延回 script-src
    expect(directives.get("style-src")).toBe("'self' 'unsafe-inline'");
  });
});

/* ── 中间件行为（注入内存版 reader） ── */

const FILES: Record<string, { body: string; type: string }> = {
  "index.html": { body: "<!doctype html><title>spa</title>", type: "text/html; charset=utf-8" },
  "assets/index-abc.js": { body: "console.log(1)", type: "text/javascript; charset=utf-8" },
  "favicon.svg": { body: "<svg/>", type: "image/svg+xml" },
};

const reader = async (rel: string): Promise<Response | null> =>
  FILES[rel] ? new Response(FILES[rel].body, { headers: { "content-type": FILES[rel].type } }) : null;

/** 复刻 app.ts 的注册顺序（业务路由在前、静态兜底在后）；routes 参数用来模拟"某个路径已被路由占用" */
function makeApp(routes: Record<string, string> = {}) {
  const a = new Hono();
  for (const [p, body] of Object.entries(routes)) a.get(p, (c) => c.text(body));
  a.use("*", staticFallback);
  a.notFound((c) => c.json({ error: "not found" }, 404));
  return a;
}

describe("staticFallback", () => {
  test("未注入 reader（Workers 形态）时完全放行", async () => {
    setStaticReader(null);
    const res = await makeApp().request("/");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  test("文档与资源各自的响应头", async () => {
    setStaticReader(reader);
    const a = makeApp();

    const doc = await a.request("/");
    expect(doc.status).toBe(200);
    expect(doc.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(doc.headers.get("content-security-policy")).toBe(CSP.INSIGHTS);
    expect(doc.headers.get("cache-control")).toBe("no-store");

    const js = await a.request("/assets/index-abc.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(js.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(js.headers.get("content-security-policy")).toBeNull();
  });

  test("先注册的路由赢过产物：谁占了 `/`，SPA 文档就进不去", async () => {
    // 退役仪表盘时踩过的坑：messages.ts 里留一个 GET("/") 就会把新界面挡在门外，
    // 而且症状是"首页还是旧页面 / 首页变成 JSON 404"，看不出根因在注册顺序
    setStaticReader(reader);
    const res = await makeApp({ "/": "占位路由" }).request("/");
    expect(await res.text()).toBe("占位路由");
  });

  test("产物里没有这个文件 → 404 JSON，且不带 SPA 头", async () => {
    setStaticReader(async () => null);
    const res = await makeApp().request("/assets/gone-abc.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});

/* ── 真应用集成：静态兜底与旧路径重定向 ── */

describe("挂载进 app.ts 之后", () => {
  test("SPA 文档接管 `/`，并补齐全站安全头", async () => {
    setStaticReader(reader);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe(CSP.INSIGHTS);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    setStaticReader(null);
  });

  test("五个旧服务端页面路径 302 到 SPA 的 hash 路由", async () => {
    const targets: Record<string, string> = {
      "/login": "/#/login",
      "/rank": "/#/leaderboard",
      "/account": "/#/account",
      "/admin": "/#/admin/users",
      "/reads/abc123": "/#/reads/abc123",
    };
    for (const [from, to] of Object.entries(targets)) {
      const res = await app.request(from);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(to);
    }
  });

  test("JSON 端点没有被重定向误伤", async () => {
    // /admin 重定向，但 /admin/users 仍是 JSON 接口；/messages 同理。
    // 断言"不是 302 且回 JSON"而不是钉死状态码：401 还是 403 取决于各端点的鉴权层级，
    // 这条用例要守的是"别把接口变成一次跳转"
    for (const p of ["/admin/users", "/messages", "/account/ip-block", "/leaderboard"]) {
      const res = await app.request(p);
      expect(res.status).not.toBe(302);
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });

  // 回归：兜底中间件若不往下走 next()，真应用里外层的 compress/etag 拿不到响应，
  // 一个本该 404 的请求会变成 500（小应用测不出来，只有挂上完整中间件栈才暴露）
  test("兜底不吞掉 404", async () => {
    setStaticReader(null); // Workers 形态：Bun 侧没有 reader
    expect((await app.request("/nope.js")).status).toBe(404);
    expect((await app.request("/insights/me")).status).toBe(404);

    setStaticReader(reader); // 有 reader，但产物里没有这个文件
    const gone = await app.request("/assets/gone-abc.js");
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "not found" });
    setStaticReader(null);
  });
});
