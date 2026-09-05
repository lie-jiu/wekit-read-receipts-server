import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FormulaStore } from "./levels";

/**
 * .env 文件版公式存储（Bun 部署专用，Workers 构建不含本文件）。
 * 语义与旧版 levels.ts 内置实现一致：.env 位于项目根（与 cwd 无关，兼容 systemd/任意启动目录），
 * 保存时保留无关行、新键追加到文件尾部。
 */
export function envFileStore(): FormulaStore {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const ENV_FILE = join(ROOT, ".env");

  const read = (): Record<string, string> => {
    if (!existsSync(ENV_FILE)) return {};
    const out: Record<string, string> = {};
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      if (m) out[m[1]!] = m[2]!;
    }
    return out;
  };

  const write = (updates: Record<string, string>): void => {
    const env = read();
    for (const [k, v] of Object.entries(updates)) {
      if (v.trim() === "") delete env[k];
      else env[k] = v.trim();
    }
    const lines: string[] = [];
    const seen = new Set<string>();
    if (existsSync(ENV_FILE)) {
      for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/.exec(line.trim());
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
  };

  return { read, write };
}
