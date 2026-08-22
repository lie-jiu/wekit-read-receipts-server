<h1 align="center">wekit-read-receipts-server</h1>

<p align="center">自建「微信已读回执」服务器端 · 为 WeKit ReadReceipts 客户端提供打点、统计、账号与管理后台</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.4%2B-f9f1e1?logo=bun&logoColor=000">
  <img alt="Hono" src="https://img.shields.io/badge/Hono-4.13.3-e36002?logo=hono&logoColor=fff">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-WAL-003b57?logo=sqlite&logoColor=fff">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=fff">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#端点">端点</a> ·
  <a href="#环境变量">环境变量</a> ·
  <a href="#部署">部署</a> ·
  <a href="#管理脚本">管理脚本</a> ·
  <a href="#从-cf-workers-迁移">迁移</a>
</p>

---

## 功能特性

- **轻量打点**：1×1 透明 PNG 像素打点，无状态、无鉴权，打点路径零外部请求
- **双语 IP 定位**：按需触发，中文 ip-api → ipwho.is，英文 ipwho.is → ipinfo.io，两路并发、失败逐级降级
- **等级权益公式**：消息保留条数 / IP 定位次数 / 保留时长均由表达式配置，`x` 代表等级
- **FTS5 全文搜索**：trigram 分词，支持消息内容快速检索
- **管理后台**：用户管理、等级调整、权益公式在线编辑、消息管理（`level 0` = 仅禁止注册新消息）
- **公开消息详情**：发布者本人/管理员可把单条消息详情设为公开（默认关闭）；公开后任何人（含未登录用户）可查看该消息已读明细，未公开消息仅本人与管理员可见
- **IP 黑名单**：全局（仅管理员，admin 后台唯一入口）/ 单条消息 / 账户三级黑名单；已读详情接口在服务端直接过滤黑名单行（API 响应不返回其 IP/定位/时间数据，仅返回隐藏条数；数据库记录保留不删除）；注册消息自动将来源 IP 写入该消息黑名单；独立账户设置页 `/account` 集中管理账户黑名单与修改密码 / 退出登录 / 清除我的
- **多形态部署**：反向代理 / 公网直连 / Cloudflare Tunnel，内置 HTTPS 支持
- **跨平台自启**：Linux systemd、Windows 启动文件夹 + 隐藏窗口、无 systemd 回退 nohup
- **定时任务**：每 10 分钟增量回填统计表，每日清理过期会话、审计日志、孤儿 reads
- **安全会话**：30 天会话，HTTPS 下 `__Host-session` + Secure，HTTP 直连自动降级
- **可信代理**：CIDR 精确信任，公网直连绝不设置，防止 IP 伪造；`X-Forwarded-For` 自右向左取值，抵御反代「追加」模式下的首值伪造
- **注入防护**：内联脚本数据经安全序列化（阻断 `</script>` 逃逸），前端渲染统一转义，SQL 全参数化
- **限流**：per-IP 固定窗口 + `/register` per-wxId 双窗口（分钟/天）

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 运行时 | Bun 1.4+ | 内置 `bun:sqlite`，单二进制部署 |
| 框架 | Hono 4.13.2 | 轻量 Web 框架 |
| 语言 | TypeScript 7 | 原生编译器 tsgo，仅用于 `tsc --noEmit` 类型检查；运行时由 Bun 转译 |
| 数据库 | SQLite (WAL) | schema 由手写原生 SQL + `PRAGMA user_version` 版本化迁移维护 |
| 依赖 | `hono` | 极简依赖树 |

## 项目结构

```
wekit-read-receipts-server/
├── index.ts              # 服务入口：建表、挂载路由、启动监听、定时任务
├── src/
│   ├── app.ts            # Hono 聚合层：全局安全头/限流中间件，以 app.route 挂载子路由，导出 app
│   ├── http-helpers.ts   # 公共 HTTP 辅助：parseBody、clampLimit、鉴权/归属校验等
│   ├── config.ts         # 环境变量读取、安全头、限流档位、像素常量
│   ├── db.ts             # SQLite 连接与版本化迁移（PRAGMA user_version）
│   ├── auth.ts           # 密码哈希/验证、会话（Cookie）签发与审计
│   ├── geo.ts            # IP 地理解析（双语降级）、运营商分类、结果缓存
│   ├── levels.ts         # 等级权益公式引擎（x*…/min/max/pow…）与 .env 读写
│   ├── rate-limit.ts     # per-IP 固定窗口限流 + 可信代理 IP 解析
│   ├── stats.ts          # 统计表增量回填、每日清理
│   ├── utils.ts          # 通用工具（utcNow/校验/脱敏/哈希）
│   ├── routes/           # 按业务职责拆分的子路由模块
│   │   ├── tracking.ts   # /pixel、/count、/register 客户端打点
│   │   ├── auth.ts       # /auth/*、/login 认证与会话
│   │   ├── messages.ts   # /、/messages 仪表盘与消息管理
│   │   ├── reads.ts      # /reads/:id 已读详情与按需 IP 定位
│   │   ├── stats.ts      # /leaderboard、/rank 排行榜
│   │   ├── admin.ts      # /admin/* 管理后台
│   │   └── account.ts    # /account 账户设置页与账户 IP 黑名单
│   └── pages/            # 前端页面 HTML/JS
└── scripts/
    ├── manage.ts         # 管理 CLI 入口（bun run manage <cmd>）
    ├── mkuser.ts         # 快速创建/重置用户
    ├── backfill-isp.ts   # 补全存量运营商双语短名
    ├── migrate-d1.ts     # 从 Cloudflare D1 迁移
    └── manage/           # CLI 实现按职责拆分
        ├── cli.ts        # 命令分发与帮助文本
        ├── platform.ts   # 跨平台工具（run/systemctl/portOpen/启动脚本）
        ├── service.ts    # 服务控制（install/uninstall/start/stop/restart/status）
        ├── env.ts        # .env 读写
        ├── users.ts      # 用户管理
        └── levels.ts     # 等级权益公式管理
```

> 限流中间件（`/auth/*`、`/reads/:id/geo`、`/admin/*`）统一在 `app.ts` 顶层注册，子路由模块不重复挂载；`/register` 打点限流在 `routes/tracking.ts` 内直接调用。

## 快速开始

```bash
git clone <repo-url> && cd wekit-read-receipts-server
bun install
bun run mkuser wxid_admin password123 2   # 创建账号（level 2）
ADMIN=wxid_admin bun run dev              # 管理员权限来自 ADMIN 环境变量
```

浏览器打开 `http://localhost:3000`，用刚创建的账号登录。

> `mkuser` 直接写入账号，**不校验邀请码**，适合自建初始化；管理员标记（`ADMIN`）只影响 Web 后台 `/admin` 权限，登录本身不需要。

## 端点

### 客户端打点（无状态、无鉴权，需公网可直连）

| 端点 | 说明 |
|---|---|
| `GET /pixel?wxId=&id=` | 1×1 透明 PNG，`INSERT OR IGNORE` 打点；`Cache-Control: no-store` |
| `GET /count?wxId=&id=` | 已读人数 = 排除三级黑名单 IP 后的 `COUNT(DISTINCT ip)`；无效 id 返回 `{"count":0}`，超限返回 429 |
| `POST /register` | 批量上报（单条或 ≤50 条），未注册 wxId 返回 403；另有 per-wxId 限流（分钟/天） |

### Web 管理（登录后使用）

| 端点 | 说明 |
|---|---|
| `/login`、`/auth/verify`、`/auth/register`、`/auth/logout`、`/auth/password`、`/auth/status` | 会话管理（30 天；HTTPS 下 `__Host-session` + Secure，HTTP 直连自动降级为普通 cookie） |
| `/` | 用户仪表盘：消息搜索（FTS5 trigram）、读取明细、删除 |
| `/messages`、`DELETE /messages` | 本人消息列表 / 清空 |
| `/reads/:id` | 单条消息读取明细（IP、UA、时间）；`GET /reads/:id/data` 在服务端过滤黑名单 IP 行（响应不含其数据，仅返回 `blockedCount` 隐藏条数与 `visibleTotal` 可见分页数）；`DELETE /reads/:id` 删除该消息（发布者本人或管理员，同事务清理 reads）；`POST /reads/:id/public` 切换公开详情（发布者本人或管理员，默认关闭） |
| `/reads/:id` 公开详情 | `is_public=1` 时任何人（含未登录用户）均可只读访问详情页与 `/reads/:id/data`（黑名单过滤仍生效）；未公开时仅发布者本人与管理员可见，未登录跳转登录页。匿名访客隐藏删除/公开开关/IP 黑名单等管理功能 |
| `GET/POST/DELETE /reads/:id/block` | 单条消息 IP 黑名单（消息所有者）；`POST` 支持 `{ ip }` 自定义或 `{ "action": "current" }` 一键拉黑当前访问 IP |
| `/account`、`GET/POST/DELETE /account/ip-block` | 独立账户设置页：账户 IP 黑名单（跨本人全部消息生效，仅自定义添加，无一键拉黑）+ 修改密码 / 退出登录 / 清除我的（自首页迁移） |
| `GET/POST/DELETE /admin/ip-block` | 全局 IP 黑名单（仅管理员，唯一入口位于管理后台页签；仅支持自定义 IP，无一键拉黑） |
| `POST /reads/:id/geo` | 按需 IP 定位：补全省市/运营商双语（幂等，缓存 24h；需登录，本人或管理员；按等级配额累计） |
| `/leaderboard` | 排行榜：`?metric=reg\|read\|msg` × `?scope=day\|total`（均按 UTC 自然日；wxId 脱敏），无效参数返回 400 |
| `/admin/*` | 管理后台：用户管理、等级调整、权益公式、消息管理 |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `BIND_HOST` | `127.0.0.1` | 监听地址。反代/隧道与服务同机时保持默认；**公网直连**或反代在其它机器时设 `0.0.0.0` |
| `TLS_CERT` / `TLS_KEY` | 无 | PEM 证书与私钥路径，**两者同时设置**启用内置 HTTPS（公网直连免反代） |
| `DB_PATH` | `./data.db` | SQLite 文件路径 |
| `ADMIN` | 无 | 管理员 wxId（逗号分隔多个），此类账号受保护：不可删除、不可降级 |
| `INVITE_CODE` | 无 | 注册邀请码；未设置时注册直接通过 |
| `TRUSTED_PROXY` | 空 | 信任的代理网段（CIDR，逗号分隔）；**仅填真正直连服务的代理**，反代/CF Tunnel 场景必填。命中时从 `X-Forwarded-For` 自右向左取首个非受信代理 IP（抵御反代「追加」模式下的首值伪造），否则信任伪造头 |
| `ENABLE_GEO` | `1` | 按需 IP 定位开关（`0`/`off`/`false` 关闭）：隐藏「定位」按钮并拒绝 geo 端点，打点路径始终零外部请求 |
| `GEO_ALLOW_HTTP` | `0` | 是否允许明文本地化接口 ip-api.com（仅 HTTP）；默认关闭，中文定位缺失时由英文兜底 |
| `MESSAGE_QUOTA_FORMULA` | `x` | 等级消息保留条数公式（`x` = 等级），超出自动删除最早消息 |
| `GEO_QUOTA_FORMULA` | `x` | 等级 IP 定位次数公式（每日配额），耗尽返回 `429`，每日 0 点（UTC）刷新 |
| `RETENTION_MONTHS_FORMULA` | `x` | 等级消息保留时长（月），结果 0 表示不限制 |
| `REGISTER_PER_WXID_PER_MIN` | `30` | `/register` 单个 wxId 每分钟注册条数上限（公开端点，无鉴权） |
| `REGISTER_PER_WXID_PER_DAY` | `500` | `/register` 单个 wxId 每天注册条数上限 |
| `PBKDF2_MAX_ITER` | `1000000` | PBKDF2 哈希迭代次数上限（拒绝被污染/恶意构造的超大 iter，防登录 DoS） |
| `AUDIT_RETENTION_DAYS` | `30` | 审计日志保留天数（`0` = 不清理，长期留存） |

<details>
<summary><b>配额与限流详情</b></summary>

### 等级权益公式

`x` 代表用户等级，未设置时默认 `x`（权益值 = 等级）：

| 权益 | 环境变量 | 默认 | 说明 |
|---|---|---|---|
| 消息保留条数 | `MESSAGE_QUOTA_FORMULA` | `x` | 超出自动删除最早消息 |
| IP 定位次数 | `GEO_QUOTA_FORMULA` | `x` | `/reads/:id/geo` 当日调用次数（每日 0 点（UTC）刷新），耗尽返回 `429 geo_quota_exceeded`；已定位或 IPv6 的行不消耗 |
| 保留时长（月） | `RETENTION_MONTHS_FORMULA` | `x` | 超时自动删除；结果 0 表示不限制 |

- **公式语法**：变量 `x`；运算符 `+ - * / % ^`；括号、一元正负号；函数 `floor / ceil / round / abs / min(a,b) / max(a,b) / pow(a,b)`。结果取整、负值归 0。示例：`x*2-1`、`min(x*100, 1000)`、`max(20, x*50)`
- **修改方式**：管理后台「等级权益」页签可查看公式与 1-20 级预览、在线编辑（写 `.env`，重启生效）；或用命令 `bun run manage levels set message=x*2 geo=x*5 retention=x`（`manage levels show` 查看，空公式恢复默认 `x`）

### 限流（per-IP 固定窗口，非等级权益）

| 端点 | 限额 | 超出后 |
|---|---|---|
| `/pixel` | 200/分 | fail-open（超限仅跳过打点记录，仍返回像素） |
| `/count` | 60/分 | 超限返回 429 |
| `/register` | 30/分（per-IP）+ 30/分·500/天（per-wxId） | 超限返回 429 |
| `/auth/*` | 5/分 | fail-closed（拒绝） |
| `/admin/*` | 30/分 | fail-closed（拒绝） |

</details>

<details>
<summary><b>数据与维护</b></summary>

- 时间统一以 UTC 存储（`YYYY-MM-DD HH:MM:SS`）；Web 中文界面显示北京时间（UTC+8），英文界面显示 UTC；消息 id = `SHA-256(wxId + \x00 + content + \x00 + createTime)`，createTime 为客户端 13 位毫秒十进制字符串，绝不数值化/截断
- 已读明细默认记录 `ip`、`user_agent`、时间；**定位为按需触发**——在已读详情中点「定位」按钮才调用免费接口补全省市/运营商（不含经纬度），结果仅本人/管理员可见，`ENABLE_GEO=0` 可整体关闭
- 定位结果**双语存储**：中文取自 ip-api(zh) → ipwho.is(zh)，英文取自 ipwho.is(en) → ipinfo.io，两路并发、失败逐级降级；已读明细的「地区+运营商」随页面语言切换展示（英文缺失时回退中文）
- 运营商显示为双语短名（如 中国移动 / China Mobile），国外 ISP 仅在英文视图显示原文
- 存量数据的运营商短名可通过 `bun run backfill-isp` 一次性补齐；已定位但缺英文的行会在下次点「定位」时自动重查补齐
- `reads` 表无外键、无 wxId，删用户/删消息由服务端在同一事务内清理对应 reads；残留孤儿 reads 由每日任务清理（保留 7 天）
- 定时任务：每 10 分钟游标增量回填统计表；每日清理过期会话、`AUDIT_RETENTION_DAYS`（默认 30）天前审计日志、孤儿 reads 并重建 FTS

</details>

## 部署

> **安全铁律**：`TRUSTED_PROXY` 只填真正直连服务的代理网段。公网直连（无代理）时绝不设置，否则任何人都能伪造 `CF-Connecting-IP` / `X-Forwarded-For` 冒充任意 IP，绕过限流与审计。

### 部署形态总览

| 形态 | BIND_HOST | TRUSTED_PROXY | 真实 IP 来源 | HTTPS |
|---|---|---|---|---|
| A. 公网服务器 + 反代（推荐） | 默认 | `127.0.0.1/32`（同机） | `X-Forwarded-For`（自右向左首个非受信 IP） | 反代终止（自动证书） |
| B. 公网服务器直连 | `0.0.0.0` | **不设** | 直连公网 IP | 内置 TLS / 裸 HTTP |
| C. 无公网 IP + Cloudflare Tunnel | 默认 / `0.0.0.0` | `127.0.0.1/32`（同机） | `CF-Connecting-IP` | CF 终止 |

生产建议：`DB_PATH` 指向持久化磁盘、`ADMIN` 声明受保护账号、`INVITE_CODE` 开启邀请码、`NODE_ENV=production`。

### A. 公网服务器 + 反向代理（推荐）

```bash
bun run manage env TRUSTED_PROXY=127.0.0.1/32   # 反代与服务同机；异机则 BIND_HOST=0.0.0.0 + TRUSTED_PROXY=<反代IP>/32
sudo bun run manage install
```

<details>
<summary><b>Caddy 配置（自动 Let's Encrypt）</b></summary>

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

</details>

<details>
<summary><b>Nginx 配置</b></summary>

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

</details>

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

1. 配置并启动服务：
   ```bash
   bun run manage env TRUSTED_PROXY=127.0.0.1/32
   sudo bun run manage install
   ```
   > cloudflared 在**其它机器**时：`BIND_HOST=0.0.0.0` + `TRUSTED_PROXY=<cloudflared 机器 IP>/32`，并把该机器 IP 加入防火墙白名单。
2. Zero Trust → Networks → Tunnels → Create（Named tunnel），安装 cloudflared 并登录：
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

## 从 CF Workers 迁移

将 D1 中的历史数据迁移到本服务（`scripts/migrate-d1.ts`，经 D1 REST API 分页拉取）：

- **迁移范围**：`users`（含 message_count 重算）、`messages`、`reads`（丢弃 D1 的 wx_id 列）、`registration_stats`（本地按 UTC 自然日重算）
- **跳过**：`sessions`（用户需重新登录）、`audit_logs`（D1 无 wx_id/ip）、`read_stats` / `message_read_stats`（服务启动时自动重建）
- **时区**：D1 存储 UTC，本服务同样存储 UTC，迁移时无需转换

<details>
<summary><b>迁移步骤</b></summary>

1. 创建 CF API Token（权限 `D1` → Read），取得 **Account ID** 与 **D1 Database ID**
2. 配置凭据（写入 `.env`，已 gitignore）：
   ```bash
   bun run manage env CF_ACCOUNT_ID=<账户ID>
   bun run manage env CF_D1_DATABASE_ID=<数据库ID>
   bun run manage env CF_API_TOKEN=<令牌>
   ```
3. 执行迁移（脚本幂等，可重复运行）：
   ```bash
   bun run migrate-d1
   ```
4. 启动服务（首次启动自动重建 read_stats / message_read_stats）：
   ```bash
   sudo bun run manage install
   bun run manage status
   ```
5. 迁移完成后**吊销该 API Token**（令牌已接触生产数据）

</details>

## 管理脚本

`bun run manage <command>`（帮助：`bun run manage`）：

<details>
<summary><b>服务控制</b></summary>

```bash
bun run manage install          # 安装开机自启并启动
bun run manage uninstall        # 停止并移除自启
bun run manage start|stop|restart
bun run manage status           # 端口/自启状态与访问地址
```

</details>

<details>
<summary><b>配置（写入 .env，restart 后生效）</b></summary>

```bash
bun run manage admin set <wxId[,wxId...]>   # 设置管理员
bun run manage admin clear
bun run manage invite set <code>            # 设置注册邀请码
bun run manage invite clear
bun run manage levels set <dim>=<formula>   # 等级权益公式（dim: message|geo|retention，空公式恢复默认 x）
bun run manage levels show                  # 查看当前公式
bun run manage env <KEY>=<VALUE>            # 任意环境变量，如 PORT=8080
```

</details>

<details>
<summary><b>用户管理</b></summary>

```bash
bun run manage user add <wxId> <password> [level]
bun run manage user list
bun run manage user delete <wxId>
bun run manage user level <wxId> <level>    # 0 = 仅禁止注册新消息
bun run manage user pass <wxId> <password>  # 重置密码
```

</details>

**平台行为**：

- **Windows**：开机自启 = 启动文件夹 + 隐藏窗口（免管理员）
- **Linux（systemd）**：`install` 需 `sudo`，注册为系统服务（崩溃自动重启、开机自启）
- **Linux（无 systemd，如 WSL/Docker）**：回退为 nohup 后台运行，PID 记录在 `.wekit/server.pid`，仅 `start/stop/status` 可用

日志位于 `.wekit/logs/server.log`。

## 许可证

MIT
