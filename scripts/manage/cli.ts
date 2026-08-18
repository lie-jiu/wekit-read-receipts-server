import { clearEnv, setEnv } from "./env";
import { install, serviceRestart, serviceStart, serviceStop, status, uninstall } from "./service";
import { levelsSet, levelsShow } from "./levels";
import { userAdd, userDelete, userLevel, userList, userPass } from "./users";

export const help = `wekit-read-receipts 管理脚本

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
  bun run manage levels set <dim>=<formula>   设置等级权益公式（dim: message|geo|retention，空公式恢复默认 x）
  bun run manage levels show                  查看当前等级权益公式

用户管理:
  bun run manage user add <wxId> <password> [level]
  bun run manage user list
  bun run manage user delete <wxId>
  bun run manage user level <wxId> <level>    0 = 仅禁止注册新消息，1-99 按配额
  bun run manage user pass <wxId> <password>  重置密码`;

export async function run(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "install": await install(); break;
    case "uninstall": uninstall(); break;
    case "start": serviceStart(); break;
    case "stop": serviceStop(); break;
    case "restart": serviceRestart(); break;
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
    case "levels":
      if (args[0] === "set") levelsSet(args.slice(1));
      else if (args[0] === "show") levelsShow();
      else { console.error(help); process.exit(1); }
      break;
    case "user":
      switch (args[0]) {
        case "add": {
          const level = args[3] === undefined ? 1 : Number(args[3]);
          if (!args[1] || !args[2] || !Number.isInteger(level) || level < 0 || level > 99) {
            console.error("用法: bun run manage user add <wxId> <password> [level 0-99]");
            process.exit(1);
          }
          await userAdd(args[1], args[2], level);
          break;
        }
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
          await userPass(args[1], args[2]);
          break;
        default:
          console.error(help);
          process.exit(1);
      }
      break;
    default:
      console.log(help);
  }
}
