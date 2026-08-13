import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 项目根目录（与 cwd 无关，兼容 systemd/任意启动目录） */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env");

/** 未设置公式时的默认公式：x（权益值 = 用户等级） */
export const DEFAULT_FORMULA = "x";

/** 等级范围由 users 表 CHECK 约束（0-99），此处按 0..99 预计算 */
const MAX_LEVEL = 99;
const LEVEL_COUNT = MAX_LEVEL + 1;

/* ────────────── 公式求值器（安全解析，不使用 eval） ──────────────
 * 语法：x 代表用户等级；支持 + - * / % ^ 括号、一元正负号；
 * 函数：floor/ceil/round/abs/min(a,b)/max(a,b)/pow(a,b)
 */

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" }
  | { type: "end" };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      const value = Number(src.slice(i, j));
      if (!Number.isFinite(value)) throw new Error(`无效数字：${src.slice(i, j)}`);
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      tokens.push({ type: "id", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new Error(`无法识别的字符「${ch}」`);
  }
  tokens.push({ type: "end" });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private expect(type: string, value?: string): Token {
    const t = this.next();
    if (t.type !== type) throw new Error("公式语法错误");
    if (value !== undefined && (t as { value: string }).value !== value) {
      throw new Error("公式语法错误");
    }
    return t;
  }

  parse(): (x: number) => number {
    const fn = this.expr();
    this.expect("end");
    return fn;
  }

  private expr(): (x: number) => number {
    let left = this.term();
    for (;;) {
      const t = this.peek();
      if (t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      const op = t.value;
      this.next();
      const right = this.term();
      const l = left;
      left = op === "+" ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }

  private term(): (x: number) => number {
    let left = this.factor();
    for (;;) {
      const t = this.peek();
      if (t.type !== "op" || !["*", "/", "%"].includes(t.value)) break;
      const op = t.value;
      this.next();
      const right = this.factor();
      const l = left;
      left =
        op === "*" ? (x) => l(x) * right(x) : op === "/" ? (x) => l(x) / right(x) : (x) => l(x) % right(x);
    }
    return left;
  }

  private factor(): (x: number) => number {
    let base = this.unary();
    const t = this.peek();
    if (t.type === "op" && t.value === "^") {
      this.next();
      const exp = this.factor();
      const b = base;
      base = (x) => Math.pow(b(x), exp(x));
    }
    return base;
  }

  private unary(): (x: number) => number {
    const t = this.peek();
    if (t.type === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      const f = this.unary();
      return t.value === "-" ? (x) => -f(x) : f;
    }
    return this.primary();
  }

  private primary(): (x: number) => number {
    const t = this.next();
    if (t.type === "num") return () => t.value;
    if (t.type === "id") {
      if (t.value === "x") return (x) => x;
      const fn = FUNCTIONS[t.value];
      if (fn) {
        this.expect("paren", "(");
        const args: Array<(x: number) => number> = [this.expr()];
        while (this.peek().type === "comma") {
          this.next();
          args.push(this.expr());
        }
        this.expect("paren", ")");
        return (x) => fn(...args.map((a) => a(x)));
      }
      throw new Error(`未知标识符「${t.value}」`);
    }
    if (t.type === "paren" && t.value === "(") {
      const f = this.expr();
      this.expect("paren", ")");
      return f;
    }
    throw new Error("公式语法错误");
  }
}

/** 编译公式为可复用函数；语法错误抛异常 */
export function compileFormula(formula: string): (x: number) => number {
  return new Parser(tokenize(formula.trim())).parse();
}

/** 校验公式：可解析且 level 0..99 均能求出有限数值；返回错误信息或 null */
export function validateFormula(formula: string): string | null {
  try {
    computeValues(formula);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** 按公式计算 level 0..99 的权益值：取整、非有限值归 0、负值截断为 0、超大值截断到安全整数上限
 * （避免超出 SQLite 64 位整数 / JS 安全整数范围导致 OFFSET 绑定等运行时错误） */
export function computeValues(formula: string): number[] {
  const fn = compileFormula(formula);
  return Array.from({ length: LEVEL_COUNT }, (_, level) => {
    const v = fn(level);
    if (!Number.isFinite(v)) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(v)));
  });
}

export type LevelSource = "formula" | "default";

export type LevelConfig = {
  formula: string;
  source: LevelSource;
  values: number[];
};

function buildConfig(formula: string | null, label: string): LevelConfig {
  if (formula === null || formula.trim() === "") {
    return { formula: DEFAULT_FORMULA, source: "default", values: computeValues(DEFAULT_FORMULA) };
  }
  try {
    return { formula: formula.trim(), source: "formula", values: computeValues(formula) };
  } catch (e) {
    console.error(`[levels] 公式无效（${label}）：${formula} —— ${(e as Error).message}，已回退默认公式 x`);
    return { formula: DEFAULT_FORMULA, source: "default", values: computeValues(DEFAULT_FORMULA) };
  }
}

function envFormula(key: string): string | null {
  const v = (process.env[key] ?? "").trim();
  return v === "" ? null : v;
}

/** 各权益维度与对应环境变量键 */
export const LEVEL_ENV_KEYS = {
  message: "MESSAGE_QUOTA_FORMULA",
  geo: "GEO_QUOTA_FORMULA",
  retentionMonths: "RETENTION_MONTHS_FORMULA",
} as const;

export type LevelDim = keyof typeof LEVEL_ENV_KEYS;

const MESSAGE = buildConfig(envFormula(LEVEL_ENV_KEYS.message), LEVEL_ENV_KEYS.message);
const GEO = buildConfig(envFormula(LEVEL_ENV_KEYS.geo), LEVEL_ENV_KEYS.geo);
const RETENTION = buildConfig(envFormula(LEVEL_ENV_KEYS.retentionMonths), LEVEL_ENV_KEYS.retentionMonths);

/** 消息保留条数（超出自动删除最早消息） */
export function quotaFor(level: number): number {
  return MESSAGE.values[level] ?? 0;
}

/** IP 定位次数（/reads/:id/geo 累计可用次数） */
export function geoQuotaFor(level: number): number {
  return GEO.values[level] ?? 0;
}

/** 消息保留时长（月），0 表示不限制 */
export function retentionMonthsFor(level: number): number {
  return RETENTION.values[level] ?? 0;
}

/* ────────────── .env 读写（等级公式持久化，管理后台使用） ────────────── */

export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

function writeEnvFile(env: Record<string, string>): void {
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

/** 保存公式：空串移除对应键（回退默认公式 x），其余覆盖 */
export function saveLevelFormulas(updates: Record<string, string>): void {
  const env = readEnvFile();
  for (const [k, v] of Object.entries(updates)) {
    if (v.trim() === "") delete env[k];
    else env[k] = v.trim();
  }
  writeEnvFile(env);
}

/** 根据 .env 中的持久化配置构建各维度配置（与进程内生效值可能不同，保存后需重启） */
export function persistedLevelConfigs(): Record<LevelDim, LevelConfig> {
  const env = readEnvFile();
  return {
    message: buildConfig(env[LEVEL_ENV_KEYS.message] ?? null, LEVEL_ENV_KEYS.message),
    geo: buildConfig(env[LEVEL_ENV_KEYS.geo] ?? null, LEVEL_ENV_KEYS.geo),
    retentionMonths: buildConfig(env[LEVEL_ENV_KEYS.retentionMonths] ?? null, LEVEL_ENV_KEYS.retentionMonths),
  };
}

/** 预览任意公式的 level 1..N 取值（范围取 1..previewN） */
export function previewValues(formula: string, previewN = 20): number[] {
  return computeValues(formula).slice(1, previewN + 1);
}
