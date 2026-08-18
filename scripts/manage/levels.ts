import { LEVEL_ENV_KEYS, validateFormula } from "../../src/levels";
import { loadEnv, removeEnvKeys, saveEnv } from "./env";

export function levelsSet(pairs: string[]): void {
  if (!pairs.length) {
    console.error("用法: bun run manage levels set <dim>=<formula> [...]（dim: message|geo|retention，空公式恢复默认 x）");
    process.exit(1);
  }
  const env = loadEnv();
  const removed: string[] = [];
  let changed = false;
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      console.error(`格式错误: ${pair}（应为 dim=formula）`);
      process.exit(1);
    }
    const dimRaw = pair.slice(0, eq).trim();
    const dim = dimRaw === "retention" ? "retentionMonths" : (dimRaw as keyof typeof LEVEL_ENV_KEYS);
    const formula = pair.slice(eq + 1).trim();
    const key = LEVEL_ENV_KEYS[dim];
    if (!key) {
      console.error(`未知维度: ${dimRaw}（应为 message|geo|retention）`);
      process.exit(1);
    }
    if (formula === "") {
      delete env[key];
      removed.push(key);
      console.log(`已移除 ${key}（回退默认公式 x）。`);
    } else {
      const err = validateFormula(formula);
      if (err) {
        console.error(`公式无效: ${err}`);
        process.exit(1);
      }
      env[key] = formula;
      console.log(`已设置 ${key}=${formula}。`);
    }
    changed = true;
  }
  if (changed) {
    if (removed.length) removeEnvKeys(removed);
    if (Object.keys(env).length) saveEnv(env);
  }
  console.log("重启服务后生效（bun run manage restart）。");
}

export function levelsShow(): void {
  const env = loadEnv();
  for (const [dim, key] of Object.entries(LEVEL_ENV_KEYS)) {
    console.log(`${key}=${env[key] ?? "x（默认）"}  # ${dim}`);
  }
}
