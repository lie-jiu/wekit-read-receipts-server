import type { Context } from "hono";
import { CSP, SPA_PATH } from "./config";

/**
 * SPA（wekit-read-insights/）静态托管：路径判定与两种运行时的取文件方式解耦。
 *
 * 为什么产物里的资源路径是根绝对（/assets/…）而文档挂在 SPA_PATH 下：
 * Vite 的 base 保持默认 "/"，同一份 dist 既能挂在 /insights/，也能在旧 SSR 页面
 * 退役后直接挂到 "/"，不必重新构建；代价是 /assets/* 与 /favicon.svg 这两个命名空间
 * 被产物占用（服务端自己从不使用它们，旧页面的样式与图片全部内联）。
 *
 * 两个运行时各自负责取文件，但路径判定只有这一份：
 *   · Bun    —— index.ts 注入 bunStaticReader(dist)，本模块的 fallback 中间件读磁盘；
 *   · Workers—— wrangler 的 assets 绑定在边缘直接回文件，worker/index.ts 用同一个
 *               resolveStatic 的结果决定「取资源」还是「转进 DO」，不注入 reader。
 */

/** dist 下的一个文件；file 已按 SAFE_* 白名单校验，只可能是 assets/<名> 或根目录 <名>.<扩展> */
export type StaticTarget =
  | { kind: "redirect"; to: string }
  | { kind: "file"; file: string; html: boolean };

/**
 * 哈希文件名可永久缓存；HTML 外壳必须每次回源 —— 它换了，缓存里指向旧哈希的引用就再也追不回来。
 * CSP 只随 HTML 下发：JS/CSS 分组的执行权限由加载它们的那份文档决定。
 */
export function headersFor(target: StaticTarget): Record<string, string> {
  if (target.kind !== "file") return {};
  return target.html
    ? { "Cache-Control": "no-store", "Content-Security-Policy": CSP.INSIGHTS }
    : { "Cache-Control": "public, max-age=31536000, immutable" };
}

/**
 * Vite 产物文件名只含字母数字与 . _ -，且扩展名限死在构建真正会产出的那些。
 * 刻意不做 percent-decode（decode 会把 ".." 拼回来），也刻意不含 html：
 * 这样 `/index.html` 这个"第二个文档地址"不存在，对外只有 SPA_PATH 一个入口
 * （assets 绑定内部的文件名重写不经过这个判定函数）。
 */
const EXT = "js|mjs|css|map|json|svg|png|jpe?g|webp|ico|webmanifest|txt|woff2?|ttf";
const SAFE_ASSET = new RegExp(`^assets/[A-Za-z0-9._-]+\\.(?:${EXT})$`);
const SAFE_ROOT_FILE = new RegExp(`^[A-Za-z0-9._-]+\\.(?:${EXT})$`);

/**
 * base 传 SPA_PATH；显式留一个入参是为了能测到「SPA 接管根路径」（旧 SSR 页面退役后的形态，
 * 那时 base 为空串，文档就是 `/`，而产物资源仍在 /assets/* 下）。
 */
export function resolveStatic(pathname: string, base: string = SPA_PATH): StaticTarget | null {
  const doc = base === "" ? "/" : `${base}/`;
  if (base !== "" && pathname === base) return { kind: "redirect", to: doc };
  // SPA 用 HashRouter，全部内部路由都在 hash 段（服务端看不见），所以 SPA_PATH 下的
  // 其它路径不属于我们：返回 null 让路由层照常给 JSON 404，而不是静默吐出 HTML
  // 把接口错误伪装成页面。index.html 也不额外暴露，避免多一条指向同一文档的路径。
  if (pathname === doc) return { kind: "file", file: "index.html", html: true };
  if (base !== "" && pathname.startsWith(doc)) return null;

  const rel = pathname.slice(1);
  if (SAFE_ASSET.test(rel) || SAFE_ROOT_FILE.test(rel)) return { kind: "file", file: rel, html: false };
  return null;
}

/** 由运行时注入的取文件后端；返回 null 表示该文件不存在（交回路由层） */
export type StaticReader = (relPath: string) => Promise<Response | null>;

let reader: StaticReader | null = null;

export function setStaticReader(fn: StaticReader | null): void {
  reader = fn;
}

/** 替换/补齐静态响应头（读到的响应可能已经带同名头，必须覆盖而不是追加） */
export function withStaticHeaders(res: Response, target: StaticTarget): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(headersFor(target))) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Bun 侧的兜底中间件：注册在所有 API 路由之后、notFound 之前，
 * 因此只有「没有任何路由处理」的请求才会走到这里。
 * 不归我们管（或文件不存在）时必须 `await next()` 而不是 return undefined ——
 * 外层的 compress/etag 已经在链上，链子不往下走它们就拿不到响应，
 * 一个本该 404 的请求会变成 500（实测：未注入 reader 的 Workers 形态同理）。
 */
export async function staticFallback(
  c: Context,
  next: () => Promise<void>,
): Promise<Response | undefined> {
  const target = resolveStatic(new URL(c.req.url).pathname);
  if (target) {
    // 斜杠补齐与「有没有可读的产物」无关，是路由事实，放在 reader 判定之前
    if (target.kind === "redirect") return c.redirect(new URL(target.to, c.req.url).href, 307);
    if (reader) {
      const file = await reader(target.file);
      // 命中即返回；产物里没有这个文件时继续往下走，交回路由层给 JSON 404
      if (file) return withStaticHeaders(file, target);
    }
  }
  await next();
  return undefined;
}
