import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  CMD_FILE,
  LOG_FILE,
  PID_FILE,
  ROOT,
  SH_FILE,
  UNIT_FILE,
  UNIT_NAME,
  ensureRunFiles,
  isLinux,
  isSystemd,
  isWin,
  portOpen,
  run,
  startupVbs,
  systemctlRun,
  systemdUser,
} from "./platform";

/* ────────────── 安装 / 卸载 / 服务控制 ──────────────
 * Windows：启动文件夹 + 隐藏窗口（免管理员）
 * Linux：优先 systemd（install 需 sudo）；无 systemd（WSL/Docker）回退 nohup + pidfile
 */

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

export async function install(): Promise<void> {
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

export function uninstall(): void {  if (isWin) {
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

export function serviceStart(): void {
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
    systemctlRun("start");
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

export function serviceStop(): void {
  if (isWin) {
    // 优先按 PID 文件精确停止（服务端 index.ts 启动时写入，退出时清除）；
    // 校验目标进程确为 bun 再杀，防 PID 复用误伤无关进程
    if (existsSync(PID_FILE)) {
      const pid = Number(readFileSync(PID_FILE, "utf8").trim());
      rmSync(PID_FILE, { force: true });
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        const chk = run("powershell", [
          "-NoProfile", "-NonInteractive", "-Command",
          `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName -eq 'bun'`,
        ]);
        if (!chk.ok || chk.out.trim() !== "True") {
          console.log("未发现运行中的服务（PID " + pid + "）。");
          return;
        }
        const r = run("powershell", [
          "-NoProfile", "-NonInteractive", "-Command",
          `Stop-Process -Id ${pid} -Force`,
        ]);
        if (r.err.trim()) console.error(r.err.trim());
        console.log("已发送停止指令（PID " + pid + "）。");
        return;
      }
    }
    // 无 PID 文件（旧版本安装/手动启动）：回退按命令行匹配
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
    systemctlRun("stop");
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

export function serviceRestart(): void {
  if (isSystemd) {
    systemctlRun("restart");
    console.log("已发送重启指令（systemctl restart）。");
  } else {
    serviceStop();
    serviceStart();
  }
}

export async function status(): Promise<void> {
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

export function requireConfigPort(): { PORT: number } {
  return { PORT: Number(process.env.PORT ?? 3000) };
}
