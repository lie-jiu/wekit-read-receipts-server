import { describe, expect, mock, test } from "bun:test";

// 与 routes.test.ts 同构：必须在 config.ts 求值前设定环境
process.env.DB_PATH = ":memory:";
process.env.ADMIN = "admin_wx";

mock.module("./geo", () => ({
  lookupIpLocation: async () => null,
}));

const { CSP, normalizeSpaPath } = await import("./config");
const { migrate } = await import("./db");
const { default: app } = await import("./app");
const { resolveStatic, setStaticReader, headersFor, staticFallback } = await import("./spa");
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
});

describe("resolveStatic（哪些路径属于 SPA 产物）", () => {
  test("文档与其斜杠重定向", () => {
    expect(resolveStatic("/insights")).toEqual({ kind: "redirect", to: "/insights/" });
    expect(resolveStatic("/insights/")).toEqual({ kind: "file", file: "index.html", html: true });
  });

  test("产物资源：哈希 js/css 与根目录静态文件", () => {
    expect(resolveStatic("/assets/index-C5wqmxCe.js")).toEqual({
      kind: "file",
      file: "assets/index-C5wqmxCe.js",
      html: false,
    });
    expect(resolveStatic("/favicon.svg")).toEqual({ kind: "file", file: "favicon.svg", html: false });
  });

  test("SPA_PATH 下的其它路径不属于产物：宁可 404 JSON 也不吐 HTML", () => {
    expect(resolveStatic("/insights/me")).toBeNull();
    expect(resolveStatic("/insights/index.html")).toBeNull();
    expect(resolveStatic("/insights/assets/x.js")).toBeNull();
  });

  test("业务路径与未知路径一律交回路由层", () => {
    for (const p of ["/", "/login", "/messages", "/reads/abc/data", "/rank", "/admin", "/me", "/pixel", "/nope"]) {
      expect(resolveStatic(p)).toBeNull();
    }
  });

  test("不做 percent-decode：编码后的穿越序列留在白名单之外", () => {
    for (const p of [
      "/assets/..%2F..%2Fetc%2Fpasswd",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/..%2F.env",
      "/assets/x%00.js",
    ]) {
      expect(resolveStatic(p)).toBeNull();
    }
  });

  test("SPA_PATH 置空 = 接管根路径（旧 SSR 页面退役后的形态），产物路径不受挂载点影响", () => {
    expect(resolveStatic("/", "")).toEqual({ kind: "file", file: "index.html", html: true });
    expect(resolveStatic("/assets/x.js", "")).toEqual({ kind: "file", file: "assets/x.js", html: false });
    expect(resolveStatic("/favicon.svg", "")).toEqual({ kind: "file", file: "favicon.svg", html: false });
    expect(resolveStatic("/me", "")).toBeNull();
    expect(resolveStatic("/messages", "")).toBeNull();
  });

  test("白名单之外的文件名与多级路径不接受", () => {
    for (const p of [
      "/assets/",
      "/assets/a/b.js", // 只允许一层
      "/assets/x.sh",
      "/index.html", // 文档只有 SPA_PATH 一个地址，不留第二个
      "/etc/passwd",
      "/deep/nested/file.svg",
      "/assets/x y.js",
      "/robots.txt.bak",
    ]) {
      expect(resolveStatic(p)).toBeNull();
    }
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
    // 产物全是带哈希的同源 module script：这两条是这道防线的全部意义，退化即失守
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

/** 独立小应用：复刻 app.ts 的注册顺序（业务路由在前、静态兜底在后） */
function makeApp() {
  const a = new Hono();
  a.get("/", (c) => c.text("SSR root"));
  a.get("/login", (c) => c.text("SSR login"));
  a.get("/messages", (c) => c.text("SSR messages"));
  a.use("*", staticFallback);
  a.notFound((c) => c.json({ error: "not found" }, 404));
  return a;
}

describe("staticFallback", () => {
  test("未注入 reader（Workers 形态）时完全放行", async () => {
    setStaticReader(null);
    const a = makeApp();
    const res = await a.request("/insights/");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  test("文档 / 资源 / 重定向各自的响应头", async () => {
    setStaticReader(async (rel) =>
      FILES[rel] ? new Response(FILES[rel].body, { headers: { "content-type": FILES[rel].type } }) : null,
    );
    const a = makeApp();

    const doc = await a.request("/insights/");
    expect(doc.status).toBe(200);
    expect(doc.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(doc.headers.get("content-security-policy")).toBe(CSP.INSIGHTS);
    expect(doc.headers.get("cache-control")).toBe("no-store");

    const js = await a.request("/assets/index-abc.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(js.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(js.headers.get("content-security-policy")).toBeNull();

    const redir = await a.request("/insights");
    expect(redir.status).toBe(307);
    expect(redir.headers.get("location")).toBe("http://localhost/insights/");
  });

  test("旧 SSR 路径优先级高于产物", async () => {
    setStaticReader(async (rel) =>
      FILES[rel] ? new Response(FILES[rel].body, { headers: { "content-type": FILES[rel].type } }) : null,
    );
    const a = makeApp();
    expect(await (await a.request("/")).text()).toBe("SSR root");
    expect(await (await a.request("/login")).text()).toBe("SSR login");
    expect(await (await a.request("/messages")).text()).toBe("SSR messages");
  });

  test("产物里没有这个文件 → 404 JSON，且不带 SPA 头", async () => {
    setStaticReader(async () => null);
    const a = makeApp();
    const res = await a.request("/assets/gone-abc.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});

/* ── 真应用集成：静态兜底不能改变任何既有端点的行为 ── */

describe("挂载进 app.ts 之后", () => {
  const reader = async (rel: string): Promise<Response | null> =>
    FILES[rel] ? new Response(FILES[rel].body, { headers: { "content-type": FILES[rel].type } }) : null;

  test("六个旧 SSR 路径仍未被产物接管", async () => {
    setStaticReader(reader);
    for (const p of ["/", "/login", "/messages", "/reads/abc123/data", "/rank", "/admin"]) {
      const res = await app.request(p);
      // 产物一旦被抢到前面，这几页会静默变成那份 <title>spa</title> 的文档
      expect(await res.text()).not.toContain("<title>spa</title>");
      expect(res.headers.get("content-security-policy")).not.toBe(CSP.INSIGHTS);
    }
    // 逐页确认仍是服务端自己的语义（未登录）
    expect((await app.request("/")).status).toBe(302);
    expect((await app.request("/login")).headers.get("content-security-policy")).toBe(CSP.LOGIN);
    expect((await app.request("/messages")).status).toBe(401);
    expect((await app.request("/rank")).status).toBe(302);
    expect((await app.request("/admin")).status).toBe(302);
    setStaticReader(null);
  });

  test("SPA 文档在真应用里同样可达", async () => {
    setStaticReader(reader);
    const res = await app.request("/insights/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe(CSP.INSIGHTS);
    // 安全头仍由最外层中间件补齐（静态响应也不例外）
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    setStaticReader(null);
  });

  // 回归：兜底中间件若不往下走 next()，真应用里外层的 compress/etag 拿不到响应，
  // 一个本该 404 的请求会变成 500（小应用测不出来，只有挂上完整中间件栈才暴露）
  test("兜底不吞掉 404", async () => {
    setStaticReader(null); // Workers 形态：Bun 侧没有 reader
    expect((await app.request("/nope.js")).status).toBe(404);
    expect((await app.request("/insights/me")).status).toBe(404);
    expect((await app.request("/insights")).status).toBe(307);

    setStaticReader(reader); // 有 reader，但产物里没有这个文件
    const gone = await app.request("/assets/gone-abc.js");
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "not found" });
    setStaticReader(null);
  });
});
