#!/usr/bin/env bun
/**
 * 服务管理脚本：安装/卸载（开机自启）、启停、管理员/邀请码、用户管理
 *
 * 用法: bun run manage <command> [args]
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlite, migrate } from "../src/db";
import { hashPassword } from "../src/auth";
import { isValidWxId } from "../src/utils";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env");
const WEKIT_DIR = join(ROOT, ".wekit");
const LOG_FILE = join(WEKIT_DIR, "logs", "server.log");
const CMD_FILE = join(WEKIT_DIR, "start-server.cmd");
const isWin = process.platform === "win32";
const startupVbs = isWin
  ? join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "wekit-read-receipts.vbs")
  : "";

/* ────────────── .env 读写 ────────────── */

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2];
    }
  }
  return out;
}

function saveEnv(env: Record<string, string>): void {
  const lines: string[] = [];
  const seen = new Set<string>();
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line.trim());
      if (m && m[1] in env) {
        lines.push(`${m[1]}=${env[m[1]]}`);
        seen.add(m[1]);
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

/* ────────────── 系统命令 ────────────── */

function run(cmd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = Bun.spawnSync([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString() };
}

function portOpen(port: number): boolean {
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

/* ────────────── 安装 / 卸载（启动文件夹自启，无需管理员权限） ────────────── */

function ensureRunFiles(): void {
  if (!existsSync(join(WEKIT_DIR, "logs"))) mkdirSync(join(WEKIT_DIR, "logs"), { recursive: true });
  writeFileSync(
    CMD_FILE,
    [
      "@echo off",
      `cd /d "${ROOT}"`,
      `"${process.execPath}" start >> "${LOG_FILE}" 2>&1`,
    ].join("\r\n"),
  );
}

function install(): void {
  if (isWin) {
    ensureRunFiles();
    writeFileSync(
      startupVbs,
      `CreateObject("WScript.Shell").Run "cmd /c ""${CMD_FILE}"", 0, False`,
    );
    console.log("已写入开机自启（启动文件夹，登录后隐藏窗口运行）。");
    serviceStart();
    console.log("服务已启动。日志: " + LOG_FILE);
  } else {
    console.error(
      "非 Windows 平台请使用 systemd 或手动运行 `bun start`。\n" +
        "systemd 示例（/etc/systemd/system/wekit-read-receipts.service）：\n" +
        `[Unit]\nDescription=wekit-read-receipts\n[Service]\nWorkingDirectory=${ROOT}\nExecStart=${process.execPath} start\nRestart=always\n[Install]\nWantedBy=multi-user.target`,
    );
    process.exit(1);
  }
}

function uninstall(): void {
  if (existsSync(startupVbs)) {
    rmSync(startupVbs);
    console.log("已移除开机自启。");
  }
  serviceStop();
}

function serviceStart(): void {
  if (!isWin) {
    console.error("非 Windows 平台请用 systemctl / 手动进程管理。");
    process.exit(1);
  }
  ensureRunFiles();
  run("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    `Start-Process -FilePath "cmd.exe" -ArgumentList '/c','"${CMD_FILE}"' -WindowStyle Hidden`,
  ]);
  console.log("已发送启动指令。");
}

function serviceStop(): void {
  if (!isWin) {
    console.error("非 Windows 平台请用 systemctl / 手动进程管理。");
    process.exit(1);
  }
  const ps = [
    "-NoProfile", "-NonInteractive", "-Command",
    `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'bun.exe' -and $_.CommandLine -like '*index.ts*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
  ];
  const r = run("powershell", ps);
  if (r.err.trim()) console.error(r.err.trim());
  console.log("已发送停止指令。");
}

function status(): void {
  const { PORT } = requireConfigPort();
  const running = portOpen(PORT);
  console.log(
    `端口 ${PORT}: ${running ? "服务运行中" : "未监听"}` +
      (existsSync(startupVbs) ? "\n开机自启: 已注册（启动文件夹）" : "\n开机自启: 未注册"),
  );
  if (running) console.log(`访问地址: http://localhost:${PORT}`);
}

function requireConfigPort(): { PORT: number } {
  return { PORT: Number(process.env.PORT ?? 3000) };
}

/* ────────────── 配置项（.env） ────────────── */

function setEnv(key: string, value: string): void {
  const env = loadEnv();
  env[key] = value;
  saveEnv(env);
  console.log(`已写入 .env: ${key}=${value}`);
  console.log("重启服务后生效（bun run manage restart）。");
}

function clearEnv(key: string): void {
  const env = loadEnv();
  delete env[key];
  saveEnv(env);
  console.log(`已从 .env 移除 ${key}。`);
}

/* ────────────── 用户管理 ────────────── */

async function userAdd(wxId: string, password: string, level: number): Promise<void> {
  if (!isValidWxId(wxId)) {
    console.error("wxId 无效：需 1-64 位可打印 ASCII 字符。");
    process.exit(1);
  }
  if (password.length < 8 || password.length > 128) {
    console.error("密码需 8-128 位。");
    process.exit(1);
  }
  migrate();
  const exists = sqlite.query("SELECT 1 FROM users WHERE wx_id = ?").get(wxId);
  if (exists) {
    console.error(`用户 ${wxId} 已存在（可用 user level 修改等级 / user pass 重置密码）。`);
    process.exit(1);
  }
  sqlite
    .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(wxId, await hashPassword(password), level, new Date().toISOString().slice(0, 19).replace("T", " "));
  console.log(`已创建用户 ${wxId}（level=${level}）。`);
}

function userList(): void {
  migrate();
  const rows = sqlite
    .query("SELECT wx_id, level, message_count, created_at FROM users ORDER BY created_at")
    .all() as { wx_id: string; level: number; message_count: number; created_at: string }[];
  if (!rows.length) {
    console.log("暂无用户。");
    return;
  }
  console.log("wx_id\tlevel\t消息数\t创建时间");
  for (const r of rows) console.log(`${r.wx_id}\t${r.level}\t${r.message_count}\t${r.created_at}`);
}

function userDelete(wxId: string): void {
  migrate();
  const n = sqlite.transaction(() => {
    sqlite.query("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)").run(wxId);
    sqlite.query("DELETE FROM messages WHERE wx_id = ?").run(wxId);
    sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
    return sqlite.query("DELETE FROM users WHERE wx_id = ?").run(wxId).changes;
  })();
  if (!n) {
    console.error(`用户 ${wxId} 不存在。`);
    process.exit(1);
  }
  console.log(`已删除用户 ${wxId} 及其消息/会话。`);
}

function userLevel(wxId: string, level: number): void {
  migrate();
  const r = sqlite.query("UPDATE users SET level = ? WHERE wx_id = ?").run(level, wxId);
  if (!r.changes) {
    console.error(`用户 ${wxId} 不存在。`);
    process.exit(1);
  }
  if (level === 0) {
    sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
  }
  console.log(`已设置 ${wxId} level=${level}（level 0 = 拉黑，其消息已清空/会话失效）。`);
}

async function userPass(wxId: string, password: string): Promise<void> {
  if (password.length < 8 || password.length > 128) {
    console.error("密码需 8-128 位。");
    process.exit(1);
  }
  migrate();
  const r = sqlite.query("UPDATE users SET password_hash = ? WHERE wx_id = ?").run(await hashPassword(password), wxId);
  if (!r.changes) {
    console.error(`用户 ${wxId} 不存在。`);
    process.exit(1);
  }
  sqlite.query("DELETE FROM sessions WHERE wx_id = ?").run(wxId);
  console.log(`已重置 ${wxId} 的密码（旧会话已失效）。`);
}

/* ────────────── 入口 ────────────── */

const [cmd, ...args] = process.argv.slice(2);
const help = `wekit-read-receipts 管理脚本

服务控制:
  bun run manage install           安装开机自启并启动服务（Windows，免管理员）
  bun run manage uninstall         停止服务并移除开机自启
  bun run manage start|stop|restart
  bun run manage status            查看服务状态与访问地址

配置（写入 .env，restart 后生效）:
  bun run manage admin set <wxId[,wxId...]>   设置管理员账号
  bun run manage admin clear                  清除全部管理员
  bun run manage invite set <code>            设置注册邀请码
  bun run manage invite clear                 取消邀请码
  bun run manage env <KEY>=<VALUE>            写任意环境变量（如 PORT=8080）

用户管理:
  bun run manage user add <wxId> <password> [level]
  bun run manage user list
  bun run manage user delete <wxId>
  bun run manage user level <wxId> <level>    0 = 拉黑清空，1-99 按配额
  bun run manage user pass <wxId> <password>  重置密码`;

switch (cmd) {
  case "install": install(); break;
  case "uninstall": uninstall(); break;
  case "start": serviceStart(); break;
  case "stop": serviceStop(); break;
  case "restart": serviceStop(); serviceStart(); break;
  case "status": status(); break;
  case "admin":
    if (args[0] === "set" && args[1]) setEnv("ADMIN", args[1]);
    else if (args[0] === "clear") clearEnv("ADMIN");
    else { console.error(help); process.exit(1); }
    break;
  case "invite":
    if (args[0] === "set" && args[1]) setEnv("INVITE_CODE", args[1]);
    else if (args[0] === "clear") clearEnv("INVITE_CODE");
    else { console.error(help); process.exit(1); }
    break;
  case "env":
    if (args[0] && args[0].includes("=")) {
      const i = args[0].indexOf("=");
      setEnv(args[0].slice(0, i), args[0].slice(i + 1));
    } else {
      console.error("用法: bun run manage env <KEY>=<VALUE>");
      process.exit(1);
    }
    break;
  case "user":
    switch (args[0]) {
      case "add": {
        const level = args[3] === undefined ? 1 : Number(args[3]);
        if (!args[1] || !args[2] || !Number.isInteger(level) || level < 0 || level > 99) {
          console.error("用法: bun run manage user add <wxId> <password> [level 0-99]");
          process.exit(1);
        }
        userAdd(args[1], args[2], level);
        break;      }
      case "list": userList(); break;
      case "delete":
        if (!args[1]) { console.error("用法: bun run manage user delete <wxId>"); process.exit(1); }
        userDelete(args[1]);
        break;
      case "level": {
        const level = Number(args[2]);
        if (!args[1] || !Number.isInteger(level) || level < 0 || level > 99) {
          console.error("用法: bun run manage user level <wxId> <level 0-99>");
          process.exit(1);
        }
        userLevel(args[1], level);
        break;
      }
      case "pass":
        if (!args[1] || !args[2]) { console.error("用法: bun run manage user pass <wxId> <password>"); process.exit(1); }
        userPass(args[1], args[2]);
        break;      default:
        console.error(help);
        process.exit(1);
    }
    break;
  default:
    console.log(help);
}
