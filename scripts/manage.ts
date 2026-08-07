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
const SH_FILE = join(WEKIT_DIR, "start-server.sh");
const PID_FILE = join(WEKIT_DIR, "server.pid");
const UNIT_NAME = "wekit-read-receipts.service";
const UNIT_FILE = `/etc/systemd/system/${UNIT_NAME}`;
const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";
const isSystemd = isLinux && existsSync("/run/systemd/system");
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

async function portOpen(port: number): Promise<boolean> {
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
  try {
    const sock = await Bun.connect({ hostname: "127.0.0.1", port });
    sock.end();
    return true;
  } catch {
    return false;
  }
}

/* ────────────── 安装 / 卸载 / 服务控制 ──────────────
 * Windows：启动文件夹 + 隐藏窗口（免管理员）
 * Linux：优先 systemd（install 需 sudo）；无 systemd（WSL/Docker）回退 nohup + pidfile
 */

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
  writeFileSync(
    SH_FILE,
    [
      "#!/usr/bin/env bash",
      `cd "${ROOT}" || exit 1`,
      `exec "${process.execPath}" start >> "${LOG_FILE}" 2>&1`,
    ].join("\n"),
  );
}

function systemdUser(): string {
  return process.env.SUDO_USER || process.env.USER || "root";
}

function installSystemd(): void {
  if (process.getuid?.() !== 0 && process.env.SUDO_USER === undefined) {
    console.error("systemd 安装需要 root 权限，请用 sudo 执行：\n  sudo bun run manage install");
    process.exit(1);
  }
  const user = systemdUser();
  const unit = [
    "[Unit]",
    "Description=wekit-read-receipts",
    "After=network.target",
    "",
    "[Service]",
    `WorkingDirectory=${ROOT}`,
    `ExecStart=${process.execPath} start`,
    `User=${user}`,
    "Restart=always",
    "RestartSec=3",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  try {
    writeFileSync(UNIT_FILE, unit);
  } catch (e) {
    console.error("写入 " + UNIT_FILE + " 失败，请用 sudo 执行 install。");
    process.exit(1);
  }
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["enable", "--now", UNIT_NAME]);
  console.log("已安装 systemd 服务并启动（" + UNIT_FILE + "）。");
}

async function install(): Promise<void> {
  if (isWin) {
    ensureRunFiles();
    writeFileSync(
      startupVbs,
      `CreateObject("WScript.Shell").Run "cmd /c ""${CMD_FILE}"", 0, False`,
    );
    console.log("已写入开机自启（启动文件夹，登录后隐藏窗口运行）。");
    serviceStart();
    console.log("服务已启动。日志: " + LOG_FILE);
  } else if (isLinux) {
    if (isSystemd) {
      installSystemd();
    } else {
      ensureRunFiles();
      serviceStart();
      console.log("已启动（无 systemd，进程退出后不会自动重启；开机自启请自行配置，如 rc.local 执行 " + SH_FILE + "）。");
      console.log("日志: " + LOG_FILE);
    }
  } else {
    console.error("仅支持 Windows / Linux。");
    process.exit(1);
  }
}

function uninstall(): void {  if (isWin) {
    if (existsSync(startupVbs)) {
      rmSync(startupVbs);
      console.log("已移除开机自启。");
    }
    serviceStop();
  } else if (isLinux) {
    if (isSystemd) {
      if (process.getuid?.() !== 0) {
        console.error("卸载 systemd 服务需要 root 权限，请用 sudo 执行：\n  sudo bun run manage uninstall");
        process.exit(1);
      }
      run("systemctl", ["disable", "--now", UNIT_NAME]);
      if (existsSync(UNIT_FILE)) rmSync(UNIT_FILE);
      run("systemctl", ["daemon-reload"]);
      console.log("已停止并移除 systemd 服务。");
    } else {
      serviceStop();
      console.log("已停止服务。");
    }
  }
}

function serviceStart(): void {
  if (isWin) {
    ensureRunFiles();
    run("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      `Start-Process -FilePath "cmd.exe" -ArgumentList '/c','"${CMD_FILE}"' -WindowStyle Hidden`,
    ]);
    console.log("已发送启动指令。");
    return;
  }
  if (isSystemd) {
    run("systemctl", ["start", UNIT_NAME]);
    console.log("已发送启动指令（systemctl start）。");
    return;
  }
  if (isLinux) {
    ensureRunFiles();
    if (existsSync(PID_FILE)) {
      const pid = Number(readFileSync(PID_FILE, "utf8").trim());
      if (pid > 0) {
        try {
          process.kill(pid, 0);
          console.log("服务已在运行（PID " + pid + "）。");
          return;
        } catch {
          /* 陈旧 pidfile，继续启动 */
        }
      }
    }
    const r = run("bash", ["-c", `nohup bash "${SH_FILE}" >/dev/null 2>&1 & echo $! > "${PID_FILE}"`]);
    if (!r.ok) {
      console.error("启动失败: " + (r.err || r.out));
      process.exit(1);
    }
    console.log("已发送启动指令。");
    return;
  }
  console.error("仅支持 Windows / Linux。");
  process.exit(1);
}

function serviceStop(): void {
  if (isWin) {
    const ps = [
      "-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'bun.exe' -and $_.CommandLine -like '*index.ts*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
    ];
    const r = run("powershell", ps);
    if (r.err.trim()) console.error(r.err.trim());
    console.log("已发送停止指令。");
    return;
  }
  if (isSystemd) {
    run("systemctl", ["stop", UNIT_NAME]);
    console.log("已发送停止指令（systemctl stop）。");
    return;
  }
  if (isLinux) {
    if (existsSync(PID_FILE)) {
      const pid = Number(readFileSync(PID_FILE, "utf8").trim());
      if (pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
          rmSync(PID_FILE);
          console.log("已发送停止指令（PID " + pid + "）。");
        } catch {
          rmSync(PID_FILE);
          console.log("未发现运行中的服务。");
        }
        return;
      }
    }
    console.log("未发现运行中的服务（无 pidfile）。");
    return;
  }
  console.error("仅支持 Windows / Linux。");
  process.exit(1);
}

async function status(): Promise<void> {
  const { PORT } = requireConfigPort();
  const running = await portOpen(PORT);
  let auto = "";
  if (isWin) auto = existsSync(startupVbs) ? "已注册（启动文件夹）" : "未注册";
  else if (isSystemd) auto = run("systemctl", ["is-enabled", UNIT_NAME]).out.trim() === "enabled" ? "已启用（systemd）" : "未启用";
  else if (isLinux) auto = "无 systemd（手动/nohup 模式）";
  console.log(
    `端口 ${PORT}: ${running ? "服务运行中" : "未监听"}` +
      (auto ? `\n开机自启: ${auto}` : ""),
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
  bun run manage install           安装开机自启并启动服务（Win 免管理员 / Linux systemd 需 sudo）
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
  case "install": await install(); break;
  case "uninstall": uninstall(); break;
  case "start": serviceStart(); break;
  case "stop": serviceStop(); break;
  case "restart": serviceStop(); serviceStart(); break;
  case "status": await status(); break;
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
