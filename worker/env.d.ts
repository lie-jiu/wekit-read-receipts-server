/**
 * nodejs_compat 下 workerd 提供 process 对象，vars/secrets 会在请求处理阶段注入 process.env
 * （compat date >= 2025-04-01 的默认行为）。@cloudflare/workers-types 未包含该全局，此处补最小类型。
 */
declare var process: {
  env: Record<string, string | undefined>;
};
