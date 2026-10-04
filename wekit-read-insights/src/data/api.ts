// ============================================================
// 数据层 · 传输
// ------------------------------------------------------------
// 只解决三件事：带 cookie 发请求、把服务器的错误响应变成可判别的类型、
// 401 广播给会话层（受保护页面不必各自写一遍"未登录就跳登录"）。
//
// 刻意不引入 react-query 之类的数据库：这里每个页面就是「取一次、可重取」，
// 缓存/失效/重试策略一旦上来到处都要调，反而比手写这段更难读。
// ============================================================

/** 服务器统一返回 { error: string }，这里把它连同 status 一起留着供分支判断 */
export class ApiError extends Error {
  readonly status: number;
  /** 服务器给的原始 error 文案（未本地化，用于兜底显示与排查） */
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? `HTTP ${status}: ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }
  get forbidden(): boolean {
    return this.status === 403;
  }
  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * 同源部署时 BASE 为空串；本地开发由 vite 代理把 /auth、/me、/messages… 转发到 Bun 服务。
 * VITE_API_BASE 留给"前端和 API 不同源"的场景（那时服务器还要把 cookie 换成 CORS + SameSite=None，
 * 目前不支持，所以默认值就是唯一受支持的部署形态）。
 */
const BASE = import.meta.env.VITE_API_BASE ?? "";

/** 401 订阅：会话层注册一次，任何资源请求发现登录态失效都能收到 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(fn: UnauthorizedListener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

function looksLikeJson(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").includes("application/json");
}

async function toError(res: Response, quietUnauthorized = false): Promise<ApiError> {
  if (res.status === 401 && !quietUnauthorized) {
    // 广播而不是在这里跳转：路由跳转会和 React 的渲染阶段打架
    for (const fn of [...unauthorizedListeners]) fn();
  }
  let code = "";
  let bodyRead = false;
  if (looksLikeJson(res)) {
    bodyRead = true;
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (typeof body?.error === "string") code = body.error;
  }
  if (code) return new ApiError(res.status, code);
  // 没有 { error } 文案时，把响应体前缀留着当线索：
  // 命中未清理的 SSR 页面、或网关返回 HTML 错误页，都长这样
  const snippet = bodyRead ? "" : truncate(await res.text().catch(() => ""));
  return new ApiError(res.status, snippet ? `${res.status} ${snippet}` : String(res.status));
}

function truncate(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

export type RequestOptions = {
  signal?: AbortSignal;
  /** POST/PATCH 的 JSON body；GET 不要传 */
  body?: unknown;
  /**
   * 这个请求的 401 不代表会话失效，不要广播。
   * /auth/password 就是这种情况：它回 401 说的是「当前密码填错了」，
   * 而广播会把用户当成会话过期踢回登录页 —— 实测过：填错一次旧密码就整个人被登出。
   */
  quietUnauthorized?: boolean;
};

async function send<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      // 会话 cookie 是 HttpOnly + SameSite=Lax，同源 fetch 默认就会带上；写死以免被打包配置改掉
      credentials: "same-origin",
      headers: opts.body ? { "content-type": "application/json" } : undefined,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    // 断网 / 代理没起 / 服务端没起：fetch 抛的是无 status 的 TypeError
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "network_unavailable", "无法连接服务器");
  }
  if (!res.ok) throw await toError(res, opts.quietUnauthorized);
  if (res.status === 204) return undefined as T;
  if (!looksLikeJson(res)) {
    // 2xx 但不是 JSON：几乎一定是命中了 SSR 页面，宁可抛错也不要静默返回垃圾
    const ctype = truncate(res.headers.get("content-type") ?? "未知类型");
    throw new ApiError(res.status, "not_json", `期望 JSON，实际是 ${ctype}`);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>("GET", path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => send<T>("POST", path, { body, signal }),
  /** 401 不广播会话失效的 POST —— 见 RequestOptions.quietUnauthorized */
  postQuiet: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    send<T>("POST", path, { body, signal, quietUnauthorized: true }),
  del: <T>(path: string, signal?: AbortSignal) => send<T>("DELETE", path, { signal }),
  /**
   * 列表接口里 GET /messages 用 X-Total-Count 给总数（裸数组 body），
   * 需要连头一起拿的场合只有它，所以单独开一个方法而不是把 send 复杂化。
   */
  getList: async <T>(path: string, signal?: AbortSignal): Promise<{ items: T; total: number | null }> => {
    const res = await fetch(BASE + path, { credentials: "same-origin", signal });
    if (!res.ok) throw await toError(res);
    const header = res.headers.get("x-total-count");
    const parsed = header === null ? NaN : Number(header);
    return { items: (await res.json()) as T, total: Number.isFinite(parsed) ? parsed : null };
  },
};
