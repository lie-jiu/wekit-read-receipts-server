import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ENV_FILE } from "./platform";

/** 读取 .env 为键值对象（用于运行脚本，与 src/levels.ts 的 readEnvFile 实现一致） */
export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      const key = m?.[1];
      if (key !== undefined) out[key] = m?.[2] ?? "";
    }
  }
  return out;
}

/** 写回 .env：覆盖已存在键、追加新键，保留其它行（空行与纯注释行会被过滤） */
export function saveEnv(env: Record<string, string>): void {
  const lines: string[] = [];
  const seen = new Set<string>();
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line.trim());
      const key = m?.[1];
      if (key !== undefined && key in env) {
        lines.push(`${key}=${env[key]}`);
        seen.add(key);
      } else {
        lines.push(line);
      }
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (!seen.has(k)) lines.push(`${k}=${v}`);
  }
  writeFileSync(ENV_FILE, lines.filter((l) => l.trim() !== "").join("\n") + "\n");
}

/** 从 .env 文件中移除指定键（saveEnv 只会新增/覆盖，不会删除既有行） */
export function removeEnvKeys(keys: string[]): void {
  if (!existsSync(ENV_FILE)) return;
  const lines = readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line.trim());
      const key = m?.[1];
      return key === undefined || !keys.includes(key);
    })
    .filter((l) => l.trim() !== "");
  writeFileSync(ENV_FILE, lines.length ? lines.join("\n") + "\n" : "");
}

/** 写单个配置项 */
export function setEnv(key: string, value: string): void {
  const env = loadEnv();
  env[key] = value;
  saveEnv(env);
  console.log(`已写入 .env: ${key}=${value}`);
  console.log("重启服务后生效（bun run manage restart）。");
}

/** 移除单个配置项 */
export function clearEnv(key: string): void {
  removeEnvKeys([key]);
  console.log(`已从 .env 移除 ${key}。`);
}
