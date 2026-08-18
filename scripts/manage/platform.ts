import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 项目根目录（与 cwd 无关，兼容 systemd/任意启动目录） */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENV_FILE = join(ROOT, ".env");
export const WEKIT_DIR = join(ROOT, ".wekit");
export const LOG_FILE = join(WEKIT_DIR, "logs", "server.log");
export const CMD_FILE = join(WEKIT_DIR, "start-server.cmd");
export const SH_FILE = join(WEKIT_DIR, "start-server.sh");
export const PID_FILE = join(WEKIT_DIR, "server.pid");
export const UNIT_NAME = "wekit-read-receipts.service";
export const UNIT_FILE = `/etc/systemd/system/${UNIT_NAME}`;
export const isWin = process.platform === "win32";
export const isLinux = process.platform === "linux";
export const isSystemd = isLinux && existsSync("/run/systemd/system");
export const startupVbs = isWin
  ? join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "wekit-read-receipts.vbs")
  : "";

export function run(cmd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = Bun.spawnSync([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** 带 sudo 前缀的 systemctl 调用：非 root 自动加 sudo，失败时打印明确错误而非假成功 */
export function systemctlRun(action: string): { ok: boolean; out: string; err: string } {
  if (process.getuid?.() === 0) {
    return run("systemctl", [action, UNIT_NAME]);
  }
  // 非 root：检查 sudo 是否存在（which 是独立可执行文件，command 为 shell 内建故不可用）
  const hasSudo = run("which", ["sudo"]).ok;
  if (!hasSudo) {
    console.error(`systemctl ${action} 需要 root 权限，但系统未安装 sudo。请用 root 执行，或安装 sudo 后重试。`);
    process.exit(1);
  }
  const r = run("sudo", ["systemctl", action, UNIT_NAME]);
  if (!r.ok) {
    console.error(`sudo systemctl ${action} 失败:\n${r.err || r.out}`.trim());
    process.exit(1);
  }
  return r;
}

export async function portOpen(port: number): Promise<boolean> {
  if (isWin) {
    try {
      const r = run("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue) -ne $null`,
      ]);
      return r.ok && r.out.trim() === "True";
    } catch {
      return false;
    }
  }
  /* Linux：解析 ss -tln（备选 /proc/net/tcp{,6}），不依赖主动建连 */
  const r = run("ss", ["-tln"]);
  if (r.ok && r.out) {
    return new RegExp(`[:.]${port}\\s`).test(r.out);
  }
  const hex = port.toString(16).padStart(4, "0");
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      const content = readFileSync(f, "utf8");
      if (content.includes(":" + hex + " ") && content.includes("0A")) return true;
    } catch {
      /* 文件不存在则跳过 */
    }
  }
  return false;
}

/** 生成启动脚本（Windows cmd / Linux bash）并确保日志目录存在 */
export function ensureRunFiles(): void {
  if (!existsSync(join(WEKIT_DIR, "logs"))) mkdirSync(join(WEKIT_DIR, "logs"), { recursive: true });
  writeFileSync(
    CMD_FILE,
    [
      "@echo off",
      `cd /d "${ROOT}"`,
      `"${process.execPath}" start >> "${LOG_FILE}" 2>&1`,
    ].join("\r\n"),
  );
  writeFileSync(
    SH_FILE,
    [
      "#!/usr/bin/env bash",
      `cd "${ROOT}" || exit 1`,
      `exec "${process.execPath}" start >> "${LOG_FILE}" 2>&1`,
    ].join("\n"),
  );
}

export function systemdUser(): string {
  return process.env.SUDO_USER || process.env.USER || "root";
}
