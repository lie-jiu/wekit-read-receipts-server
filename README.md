# wekit-read-receipts-server

自建「微信已读回执」服务器端，为 WeKit `ReadReceipts` 客户端提供打点、统计、账号与管理后台。

- **运行时**：Bun 1.3+（内置 `bun:sqlite`）
- **框架**：Hono 4.13
- **数据**：SQLite（WAL 模式），schema 由手写原生 SQL + `PRAGMA user_version` 版本化迁移维护，Drizzle 仅作薄封装
- **依赖**：仅 `hono`、`drizzle-orm`

## 快速开始

```bash
bun install
bun run mkuser wxid_admin password123 2   # 创建账号（level 2）
ADMIN=wxid_admin bun run dev              # 管理员权限来自 ADMIN 环境变量
```

浏览器打开 `http://localhost:3000`，用刚创建的账号登录。

> `mkuser` 直接写入账号，**不校验邀请码**，适合自建初始化；管理员标记（`ADMIN`）只影响 Web 后台 `/admin` 权限，登录本身不需要。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `BIND_HOST` | `127.0.0.1` | 监听地址。反代/隧道与服务同机时保持默认；**公网直连**或反代/cloudflared 在其它机器时设 `0.0.0.0` |
| `TLS_CERT` / `TLS_KEY` | 无 | PEM 证书与私钥路径，**两者同时设置**启用内置 HTTPS（公网直连免反代） |
| `DB_PATH` | `./data.db` | SQLite 文件路径 |
| `ADMIN` | 无 | 管理员 wxId（逗号分隔多个），此类账号受保护：不可删除、不可降级（level 0） |
| `INVITE_CODE` | 无 | 注册邀请码；未设置时注册直接通过 |
| `TRUSTED_PROXY` | 空 | 信任的代理网段（CIDR，逗号分隔，如 `127.0.0.1/32,::1/128`）；**仅填真正直连服务的代理**，反代/CF Tunnel 场景必填，否则将信任伪造的 `X-Forwarded-For` |
| `ENABLE_GEO` | `1` | 按需 IP 定位开关（`0`/`off`/`false` 关闭）：关闭后隐藏「定位」按钮并拒绝 geo 端点，打点路径始终零外部请求 |

## 端点

### 客户端打点（无状态、无鉴权，需公网可直连）

| 端点 | 说明 |
|---|---|
| `GET /pixel?wxId=&id=` | 1×1 透明 PNG，`INSERT OR IGNORE` 打点；`Cache-Control: no-store` |
| `GET /count?wxId=&id=` | 恒返回 `{"count":n}`，n = `COUNT(DISTINCT ip)`；无效 id 返回 `{"count":0}` |
| `POST /register` | 批量上报（单条或 ≤50 条），未注册 wxId 返回 403 |

### Web 管理（登录后使用）

| 端点 | 说明 |
|---|---|
| `/login`、`/auth/verify`、`/auth/register`、`/auth/logout`、`/auth/password`、`/auth/status` | 会话管理（30 天；HTTPS 下使用 `__Host-session` + Secure，HTTP 直连自动降级为普通 cookie） |
| `/` | 用户仪表盘：消息搜索（FTS5 trigram）、读取明细、删除 |
| `/messages`、`DELETE /messages` | 本人消息列表 / 清空 |
| `/reads/:id` | 单条消息读取明细（IP、UA、时间） |
| `POST /reads/:id/geo` | 按需 IP 定位：为指定已读记录补全省市/运营商双语（幂等，成功缓存 24h；需登录，本人消息或管理员；已定位但缺英文时自动补齐；**次数按用户等级配额累计**） |
| `/leaderboard` | 排行榜：注册数 / 读取数 / 消息数 × 日榜 / 总榜（wxId 脱敏） |
| `/admin/*` | 管理后台：用户管理、等级调整、消息管理（`level 0` = 拉黑并清空该用户数据） |

## 配额与限流

- **消息配额**（超出自动删除最早消息）：

  | level | 1 | 2 | 3 | 4–5 | 6–8 | 9+ |
  |---|---|---|---|---|---|---|
  | 保留条数 | 20 | 50 | 100 | 250 | 500 | 1000 |

- **IP 定位配额**（`/reads/:id/geo` 累计调用次数，随等级递增，耗尽后返回 `429 geo_quota_exceeded`；已定位或 IPv6 的行不消耗次数）：

  | level | 1 | 2 | 3 | 4–5 | 6–8 | 9+ |
  |---|---|---|---|---|---|---|
  | 定位次数 | 50 | 100 | 200 | 500 | 1000 | 2000 |

- **限流**（per-IP 固定窗口）：

  | 端点 | 限额 | 超出后 |
  |---|---|---|
  | `/pixel` | 200/分 | fail-open（不拦截打点） |
  | `/count` | 60/分 | fail-open |
  | `/register` | 30/分 | fail-open |
  | `/auth/*` | 5/分 | fail-closed（拒绝） |
  | `/admin/*` | 30/分 | fail-closed（拒绝） |

## 数据与维护

- 时间一律 UTC+8；消息 id = `SHA-256(wxId + \x00 + content + \x00 + createTime)`，createTime 为客户端 13 位毫秒十进制字符串，绝不数值化/截断
- 已读明细默认记录 `ip`、`user_agent`、时间；**定位为按需触发**——在已读详情中点「定位」按钮才调用免费接口补全省市/运营商（不含经纬度），结果仅本人/管理员可见，`ENABLE_GEO=0` 可整体关闭。打点路径 `GET /pixel` 不做任何外部请求
- 定位结果**双语存储**：中文取自 ip-api(zh) → ipwho.is(zh)，英文取自 ipwho.is(en) → ipinfo.io，两路并发、失败逐级降级；已读明细的「地区+运营商」随页面语言切换展示（英文缺失时回退中文）。运营商显示为双语短名（如 中国移动 / China Mobile），国外 ISP 仅在英文视图显示原文
- 存量数据的运营商短名可通过 `bun run backfill-isp` 一次性补齐；已定位但缺英文的行会在下次点「定位」时自动重查补齐
- `reads` 表无外键、无 wxId，删用户/删消息由服务端在同一事务内清理对应 reads；残留孤儿 reads 由每日任务清理（保留 7 天）
- 定时任务：每 10 分钟游标增量回填统计表；每日清理过期会话、30 天前审计日志、孤儿 reads 并重建 FTS

## 部署

### 部署形态总览

生产环境建议 HTTPS（`__Host-session` + Secure Cookie）。真实 IP 的获取取决于「谁直连服务」：

| 形态 | BIND_HOST | TRUSTED_PROXY | 真实 IP 来源 | HTTPS |
|---|---|---|---|---|
| A. 公网服务器 + 反代（推荐） | 默认 | `127.0.0.1/32`（同机） | `X-Forwarded-For` 首项 | 反代终止（自动证书） |
| B. 公网服务器直连 | `0.0.0.0` | **不设** | 直连公网 IP | 内置 TLS / 裸 HTTP |
| C. 无公网 IP 机器 + Cloudflare Tunnel | 默认（同机）/ `0.0.0.0`（异机） | `127.0.0.1/32`（同机） | `CF-Connecting-IP`（内置优先） | CF 终止 |

> **安全铁律**：`TRUSTED_PROXY` 只填真正直连服务的代理网段。公网直连（无代理）时绝不设置，否则任何人都能伪造 `CF-Connecting-IP` / `X-Forwarded-For` 冒充任意 IP，绕过限流与审计。监听 `127.0.0.1` 时只有本机进程（反代/cloudflared）能访问，客户端无法直接伪造。

生产建议：`DB_PATH` 指向持久化磁盘（WAL 自动开启）、`ADMIN` 声明受保护账号、`INVITE_CODE` 开启邀请码以限制公网注册、`NODE_ENV=production`。

### A. 公网服务器 + 反向代理（推荐）

HTTPS 由反代自动续期，服务保持仅本机可见：

```bash
bun run manage env TRUSTED_PROXY=127.0.0.1/32   # 反代与服务同机；异机则 BIND_HOST=0.0.0.0 + TRUSTED_PROXY=<反代IP>/32
sudo bun run manage install
```

Caddy（自动 Let's Encrypt）：

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

Nginx：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    # ssl_certificate / ssl_certificate_key 由 certbot --nginx 生成
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
}
```

### B. 公网服务器直连（无反代）

```bash
bun run manage env BIND_HOST=0.0.0.0
# 推荐启用内置 HTTPS（证书用 certbot / acme.sh 申请，续期后需 restart）：
bun run manage env TLS_CERT=/etc/letsencrypt/live/your-domain.com/fullchain.pem
bun run manage env TLS_KEY=/etc/letsencrypt/live/your-domain.com/privkey.pem
sudo bun run manage install
```

安全组/防火墙放行 `PORT`。裸 HTTP 可用但会话 cookie 明文传输，仅限测试。

### C. 无公网 IP 机器 + Cloudflare Tunnel

1. 配置并启动服务（详见上方命令，`TRUSTED_PROXY=127.0.0.1/32` 为同机场景）：
   ```bash
   bun run manage env TRUSTED_PROXY=127.0.0.1/32
   sudo bun run manage install
   ```
   > cloudflared 在**其它机器**时：`BIND_HOST=0.0.0.0` + `TRUSTED_PROXY=<cloudflared 机器 IP>/32`，并把该机器 IP 加入防火墙白名单。
2. Zero Trust → Networks → Tunnels → Create（Named tunnel），按页面安装 cloudflared 并登录：
   ```bash
   curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i /tmp/cloudflared.deb && cloudflared tunnel login
   ```
3. 创建隧道与配置：
   ```bash
   cloudflared tunnel create wekit
   ```
   `~/.cloudflared/config.yml`：
   ```yaml
   tunnel: wekit
   credentials-file: /root/.cloudflared/wekit.json
   ingress:
     - hostname: rr.example.com
       service: http://127.0.0.1:3000
     - service: http_status:404
   ```
4. 绑定域名并注册为服务：
   ```bash
   cloudflared tunnel route dns wekit rr.example.com
   sudo cloudflared service install
   ```
5. 验证：手机流量访问 `https://rr.example.com/pixel?wxId=<wxid>&id=<64位hex>`，服务端查询 `reads` 应记录运营商公网 IP（优先取 `CF-Connecting-IP`，客户端不可伪造）。

## 从 CF Workers 迁移（wekit-read-receipts-cf-workers）

将 D1 中的历史数据迁移到本服务（`scripts/migrate-d1.ts`，经 D1 REST API 分页拉取）：

**迁移范围**：`users`（含 message_count 重算）、`messages`、`reads`（丢弃 D1 的 wx_id 列）、`registration_stats`（本地按北京时间重算）。
**跳过**：`sessions`（用户需重新登录）、`audit_logs`（D1 无 wx_id/ip）、`read_stats` / `message_read_stats`（服务启动时自动重建）。

> **时区**：D1 存储 UTC，本服务存储北京时间（UTC+8），迁移时自动转换。

1. 创建 CF API Token（权限 `D1` → Read），并取得 **Account ID**（控制台右上角）与 **D1 Database ID**（D1 数据库页 URL 中的 UUID）
2. 配置凭据（写入 `.env`，已 gitignore，不会进仓库）：
   ```bash
   bun run manage env CF_ACCOUNT_ID=<账户ID>
   bun run manage env CF_D1_DATABASE_ID=<数据库ID>
   bun run manage env CF_API_TOKEN=<令牌>
   ```
3. 执行迁移（脚本幂等，可重复运行；会清空本地 users/messages/reads/registration_stats 后写入）：
   ```bash
   bun run migrate-d1
   ```
4. 启动服务（首次启动自动重建 read_stats / message_read_stats），并在 Web 后台核对数据与 IP：
   ```bash
   sudo bun run manage install
   bun run manage status
   ```
5. 迁移完成后**吊销该 API Token**（令牌已接触生产数据）。

## 管理脚本

`bun run manage <command>`（帮助：`bun run manage`）：

```bash
# 服务控制
bun run manage install          # 安装开机自启并启动
bun run manage uninstall        # 停止并移除自启
bun run manage start|stop|restart
bun run manage status           # 端口/自启状态与访问地址

# 配置（写入 .env，restart 后生效）
bun run manage admin set <wxId[,wxId...]>   # 设置管理员
bun run manage admin clear
bun run manage invite set <code>            # 设置注册邀请码
bun run manage invite clear
bun run manage env <KEY>=<VALUE>            # 任意环境变量，如 PORT=8080

# 用户管理
bun run manage user add <wxId> <password> [level]
bun run manage user list
bun run manage user delete <wxId>
bun run manage user level <wxId> <level>    # 0 = 拉黑清空
bun run manage user pass <wxId> <password>  # 重置密码
```

平台行为：
- **Windows**：开机自启 = 启动文件夹 + 隐藏窗口（免管理员）
- **Linux（systemd）**：`install` 需 `sudo bun run manage install`，注册为系统服务（崩溃自动重启、开机自启）
- **Linux（无 systemd，如 WSL/Docker）**：回退为 nohup 后台运行，PID 记录在 `.wekit/server.pid`，仅 `start/stop/status` 可用

日志位于 `.wekit/logs/server.log`。
