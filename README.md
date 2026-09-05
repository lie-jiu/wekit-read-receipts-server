<h1 align="center">wekit-read-receipts-server</h1>

<p align="center">自建「微信已读回执」服务器端 · 为 WeKit ReadReceipts 客户端提供打点、统计、账号与管理后台</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.4%2B-f9f1e1?logo=bun&logoColor=000">
  <img alt="Hono" src="https://img.shields.io/badge/Hono-4.13.5-e36002?logo=hono&logoColor=fff">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-WAL-003b57?logo=sqlite&logoColor=fff">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=fff">
  <img alt="license" src="https://img.shields.io/badge/license-AGPL--3.0-blue">
  <img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#开发与测试">开发与测试</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#端点">端点</a> ·
  <a href="#环境变量">环境变量</a> ·
  <a href="#部署">部署</a> ·
  <a href="#管理脚本">管理脚本</a> ·
  <a href="#从-cf-workers-迁移">迁移</a>
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lie-jiu/wekit-read-receipts-server">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" width="200">
  </a>
</p>
<p align="center">
  <sub>一键部署到 Cloudflare Workers（自动创建数据库，见<a href="#d-cloudflare-workers免服务器">部署形态 D</a>；<a href="https://developers.cloudflare.com/workers/platform/deploy-buttons/">官方文档</a>）</sub>
</p>

---

## 功能特性

### 打点与数据

- **轻量打点**：1×1 透明 PNG，无状态、无鉴权，打点路径零外部请求
- **双语 IP 定位**：按需触发；中文 ip-api → ipwho.is，英文 ipwho.is → ipinfo.io，两路并发、逐级降级
- **FTS5 全文搜索**：trigram 分词，消息内容快速检索
- **等级权益公式**：消息保留条数 / 定位次数 / 保留时长均由 `x`（等级）表达式配置
- **消息分页**：仪表盘每页 10 条 + 上一页/下一页 + 页码，服务端返回 `X-Total-Count`（与列表过滤口径一致）

### 管理与账户

- **管理后台**：用户管理、等级调整（`level 0` = 仅禁止注册新消息）、权益公式在线编辑、消息管理
- **僵尸用户自动清理**：「从未注册消息 / 长期沉寂」两类规则，支持预演、立即执行与审计留痕
- **三级 IP 黑名单**：全局 / 单条消息 / 账户；已读详情在服务端直接过滤黑名单行
- **公开消息详情**：发布者 / 管理员可把单条消息已读明细设为公开（默认关闭）
- **账户设置页** `/account`：账户黑名单、修改密码、退出登录、清除我的

### 安全

- **限流**：per-IP 固定窗口 + `/register` per-wxId 双窗口（分钟/天）
- **安全会话**：30 天；HTTPS 下 `__Host-session` + Secure，HTTP 直连自动降级
- **可信代理**：CIDR 精确信任，公网直连绝不设置；`X-Forwarded-For` 自右向左取值，抵御反代「追加」模式下的首值伪造
- **注入防护**：内联脚本数据安全序列化（阻断 `</script>` 逃逸）、前端渲染统一转义、SQL 全参数化

### 界面与部署

- **明暗主题**：6 个页面浅色 / 深色切换，默认跟随系统 `prefers-color-scheme`，选择经 `localStorage` 持久化，`meta theme-color` 随主题联动
- **键盘可访问性**：`:focus-visible` 焦点环 + `prefers-reduced-motion` 兜底；模态框 Esc 关闭 + Tab 焦点陷阱 + 焦点还原；表格行 Enter / Space 可达
- **移动端响应式**：`1rem` 字号防 iOS 缩放、`touch-action` 优化、表格横向滚动、关键按钮 40×40 命中区（断点 480 / 640px）
- **多形态部署**：反向代理 / 公网直连 / Cloudflare Tunnel / Cloudflare Workers（免服务器），内置 HTTPS 支持
- **跨平台自启**：Linux systemd、Windows 启动文件夹 + 隐藏窗口、无 systemd 回退 nohup
- **定时任务**：每 10 分钟增量回填统计表；每日清理过期会话、审计日志、孤儿 reads

<details>
<summary><b>IP 黑名单细则</b></summary>

- 三级作用域：全局（仅管理员，admin 后台唯一入口）/ 单条消息 / 账户（跨本人全部消息生效）
- 已读详情接口在服务端直接过滤黑名单行：API 响应不返回其 IP / 定位 / 时间数据，仅返回隐藏条数；数据库记录保留不删除
- 注册消息时自动将来源 IP 写入该消息黑名单

</details>

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 运行时 | Bun 1.4+ | 内置 `bun:sqlite`，单二进制部署 |
| 备选运行时 | Cloudflare Workers | 同一代码库经适配层运行于单实例 Durable Object（部署形态 D） |
| 框架 | Hono 4.13.5 | 轻量 Web 框架 |
| 语言 | TypeScript 7 | 原生编译器 tsgo，仅用于 `tsc --noEmit` 类型检查；运行时由 Bun 转译 |
| 数据库 | SQLite (WAL) | schema 由手写原生 SQL + 版本化迁移维护；Bun 用 `PRAGMA user_version`，Workers 存 `meta` 表 |
| 依赖 | `hono` | 极简依赖树 |

## 项目结构

```
wekit-read-receipts-server/
├── index.ts          # Bun 服务入口：注入 SQLite 后端与公式存储、建表、启动监听、定时任务
├── worker/           # Cloudflare Workers 入口：Worker 转发 + 单实例 Durable Object（部署形态 D）
├── src/
│   ├── app.ts        # Hono 聚合层：全局安全头/限流中间件，挂载子路由
│   ├── routes/       # 子路由：tracking / auth / messages / reads / stats / admin / account
│   ├── pages/        # 前端页面：dashboard / admin / account / login（服务端拼接 HTML + 内联 JS）
│   ├── backends/     # SQLite 后端（Bun：bun:sqlite；Workers 后端在 worker/do-sqlite.ts）
│   ├── *.ts          # 核心模块：config / db / auth / geo / levels / rate-limit / stats / retention / utils / http-helpers
│   └── *.test.ts     # 单元测试：auth / levels / retention / routes / security（bun test）
└── scripts/
    ├── manage/       # 管理 CLI 实现：cli / platform / service / env / users / levels
    └── *.ts          # manage / mkuser / migrate-d1 / backfill-isp / cleanup-orphans / test-preload
```

<details>
<summary><b>完整目录树</b></summary>

```
wekit-read-receipts-server/
├── index.ts              # Bun 服务入口：注入 SQLite 后端与公式存储、建表、启动监听、定时任务
├── wrangler.jsonc        # Cloudflare Workers 部署配置（DO 绑定、Cron Triggers、nodejs_compat）
├── worker/               # Workers 入口（部署形态 D）
│   ├── index.ts          # Worker 默认导出（fetch 转发 + scheduled）与 App DO 类（惰性迁移、内部 cron 端点）
│   ├── do-sqlite.ts      # Durable Objects 内置 SQLite 后端（ctx.storage.sql，同步语义对齐 bun:sqlite）
│   ├── levels-env-db.ts  # meta 表版等级公式存储
│   └── env.d.ts          # process 最小类型声明（nodejs_compat）
├── src/
│   ├── app.ts            # Hono 聚合层：全局安全头/请求体上限/限流中间件，以 app.route 挂载子路由，导出 app
│   ├── http-helpers.ts   # 公共 HTTP 辅助：parseBody、clampLimit、鉴权/归属校验等
│   ├── config.ts         # 环境变量读取、安全头、限流档位、像素常量
│   ├── db.ts             # SQLite 后端抽象（同步接口）与版本化迁移（Bun: PRAGMA user_version / Workers: meta 表）
│   ├── backends/
│   │   └── bun-sqlite.ts # bun:sqlite 后端（打开文件 + PRAGMA 配置 + ensureBunSqlite 幂等初始化）
│   ├── auth.ts           # 密码哈希/验证（WebCrypto PBKDF2，双运行时一致）、会话（Cookie）签发与审计
│   ├── geo.ts            # IP 地理解析（双语降级）、运营商分类、结果缓存
│   ├── levels.ts         # 等级权益公式引擎（x*…/min/max/pow…），公式存储按运行时注入
│   ├── levels-env-file.ts # .env 文件版公式存储（Bun 专用）
│   ├── rate-limit.ts     # per-IP 固定窗口限流 + 可信代理 / 边缘 IP 解析
│   ├── stats.ts          # 统计表增量回填、每日清理
│   ├── retention.ts      # 僵尸用户自动清理：策略读写、预演、执行（含排行榜级联清空）
│   ├── utils.ts          # 通用工具（utcNow/校验/脱敏/纯 TS SHA-256）
│   ├── *.test.ts         # 单元测试：auth / levels / retention / routes / security（bun test）
│   ├── routes/           # 按业务职责拆分的子路由模块
│   │   ├── tracking.ts   # /pixel、/count、/register 客户端打点
│   │   ├── auth.ts       # /auth/*、/login 认证与会话
│   │   ├── messages.ts   # /、/messages 仪表盘与消息管理
│   │   ├── reads.ts      # /reads/:id 已读详情与按需 IP 定位
│   │   ├── stats.ts      # /leaderboard、/rank 排行榜
│   │   ├── admin.ts      # /admin/* 管理后台
│   │   └── account.ts    # /account 账户设置页与账户 IP 黑名单
│   ├── pages/            # 前端页面 HTML/JS（服务端拼接整段 HTML + 内联 JS 返回）
│   │   ├── shared.ts             # 统一的浏览器端 helper（esc/escAttr 严格版/t/applyI18n），以字符串插值注入各页面 <script>
│   │   ├── shared-style.ts       # 共享设计令牌（themeTokens()：24 令牌 + 浅色板 + 焦点环 + reduced-motion）+ 6 页一致的公共 CSS（sharedStyle()）
│   │   ├── types.ts              # 页面层视图模型类型（BasicSession / DashboardSession 等），路由 → 页面的收窄投影，与 auth.ts SessionUser 解耦
│   │   ├── index.ts              # 桶文件：重导出各页面模块，路由统一 import { ... } from "../pages"
│   │   ├── dashboard/            # 仪表盘三页面
│   │   │   ├── dashboard-page.ts # 消息仪表盘 htmlPage
│   │   │   ├── leaderboard-page.ts # 排行榜 leaderboardPage
│   │   │   ├── read-details-page.ts # 已读详情 readDetailsPage
│   │   │   └── index.ts          # 桶文件：重导出三个页面
│   │   ├── admin/                # 管理后台
│   │   │   ├── admin-style.ts    # adminStyle() 内联 CSS
│   │   │   └── admin-script.ts   # adminScript() 内联 JS（6 大功能模块）
│   │   ├── admin.ts              # adminPage() 薄组合层（拼 style + script）
│   │   ├── account.ts            # 账户设置页
│   │   └── login.ts              # 登录页
└── scripts/
    ├── manage.ts         # 管理 CLI 入口（bun run manage <cmd>）
    ├── mkuser.ts         # 快速创建/重置用户
    ├── backfill-isp.ts   # 补全存量运营商双语短名
    ├── migrate-d1.ts     # 从 Cloudflare D1 迁移
    ├── cleanup-orphans.ts # 清理孤儿排行榜行（父用户已删除）：bun run cleanup-orphans [--dry-run]
    ├── test-preload.ts   # bun test 预载（bunfig.toml [test] preload）：强制内存库，防止误写 data.db
    └── manage/           # CLI 实现按职责拆分
        ├── cli.ts        # 命令分发与帮助文本
        ├── platform.ts   # 跨平台工具（run/systemctl/portOpen/启动脚本）
        ├── service.ts    # 服务控制（install/uninstall/start/stop/restart/status）
        ├── env.ts        # .env 读写
        ├── users.ts      # 用户管理
        └── levels.ts     # 等级权益公式管理
```

</details>

> 限流中间件（`/auth/*`、`/reads/:id/geo`、`/admin/*`）统一在 `app.ts` 顶层注册，子路由模块不重复挂载；`/register` 打点限流在 `routes/tracking.ts` 内直接调用。

## 快速开始

```bash
git clone <repo-url> && cd wekit-read-receipts-server
bun install
bun run mkuser wxid_admin password123 2   # 创建账号（level 2）
ADMIN=wxid_admin bun run dev              # 管理员权限来自 ADMIN 环境变量
```

浏览器打开 `http://localhost:3000`，用刚创建的账号登录。

> `mkuser` 直接写入账号，**不校验邀请码**，适合自建初始化（密码 ≥8 位，level 0–99）；管理员标记（`ADMIN`）只影响 Web 后台 `/admin` 权限，登录本身不需要。

## 开发与测试

```bash
bun run dev        # 开发模式（--watch 热重载）
bun run typecheck  # tsc --noEmit 类型检查（tsgo）
bun run test       # bun test：levels / retention / routes / security
```

测试经 `bunfig.toml` 的 `[test] preload` 预载 `scripts/test-preload.ts`，强制 `DB_PATH=:memory:`（全部测试共享内存库），不会读写仓库内的 `data.db`。

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
| `/` | 用户仪表盘：消息搜索（FTS5 trigram）、读取明细、删除；消息分页（每页 10 条，`X-Total-Count`） |
| `/messages`、`DELETE /messages` | 本人消息列表 / 清空 |
| `/reads/:id` | 单条消息已读详情页（IP、UA、时间） |
| `GET /reads/:id/data` | 已读明细分页数据；服务端过滤黑名单 IP 行（仅返回 `blockedCount` 隐藏条数与 `visibleTotal` 可见数） |
| `DELETE /reads/:id` | 删除该消息（发布者本人或管理员，同事务清理 reads） |
| `POST /reads/:id/public` | 切换公开详情（发布者本人或管理员，默认关闭） |
| `GET/POST/DELETE /reads/:id/block` | 单条消息 IP 黑名单（消息所有者）；`POST` 支持 `{ ip }` 自定义或 `{ "action": "current" }` 一键拉黑当前访问 IP |
| `/account`、`GET/POST/DELETE /account/ip-block` | 账户设置页：账户 IP 黑名单（跨本人全部消息生效，仅自定义添加，无一键拉黑）+ 修改密码 / 退出登录 / 清除我的 |
| `GET/POST/DELETE /admin/ip-block` | 全局 IP 黑名单（仅管理员，admin 后台页签唯一入口；仅自定义 IP，无一键拉黑） |
| `POST /reads/:id/geo` | 按需 IP 定位：补全省市/运营商双语（幂等，缓存 24h；需登录，本人或管理员；按等级配额累计） |
| `/leaderboard` | 排行榜：`?metric=reg\|read\|msg` × `?scope=day\|total`（均按 UTC 自然日；wxId 脱敏），无效参数返回 400 |
| `/admin/*` | 管理后台：用户管理、等级调整、权益公式、消息管理、僵尸用户清理 |

**公开消息详情**：`is_public=1` 时任何人（含未登录用户）均可只读访问详情页与 `/reads/:id/data`（黑名单过滤仍生效）；未公开时仅发布者本人与管理员可见，未登录跳转登录页；匿名访客隐藏删除 / 公开开关 / IP 黑名单等管理功能。

<details>
<summary><b>僵尸清理端点（/admin/retention/*）</b></summary>

| 端点 | 说明 |
|---|---|
| `GET /admin/retention`、`POST /admin/retention` | 读取 / 保存清理策略（两项天数：`newUserDays` 注册后从未注册消息、`dormantDays` 注册后沉寂；均存 `meta` 表，0 = 不清理，保存立即生效）；写审计 `admin_set_retention` |
| `GET /admin/retention/preview?page=&pageSize=` | 预演：仅统计不删，返回命中数量（never/dormant 拆分）、受豁免数、样例；`page`/`pageSize` 分页（`pageSize` 兼容旧 `limit`，1–100），`purgeable`/`never`/`dormant` 等全量计数跨页不变 |
| `POST /admin/retention/run` | 立即执行一次清理（与每日任务同一套逻辑），写审计 `admin_run_retention`（含 `by=/deleted=/skipped=`） |
| `GET /admin/retention/orphans` | 检测孤儿排行榜行：返回 `registration_stats` / `read_stats` / `message_read_stats` 三表「父用户已不存在」的行数（历史遗留：外部/FK 关闭删除用户所致） |
| `POST /admin/retention/orphans` | 清理孤儿排行榜行（删除三表中 `wx_id` 不在 `users` 的行），写审计 `admin_cleanup_orphans`（含 `by=/total=/逐表计数`）；对应管理后台「僵尸清理」页签的「清理孤儿排行榜」按钮 |

</details>

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `BIND_HOST` | `127.0.0.1` | 监听地址。反代/隧道与服务同机时保持默认；**公网直连**或反代在其它机器时设 `0.0.0.0` |
| `TLS_CERT` / `TLS_KEY` | 无 | PEM 证书与私钥路径，**两者同时设置**启用内置 HTTPS（公网直连免反代） |
| `DB_PATH` | 开发 `./data.db`；`NODE_ENV=production` 时 `/var/lib/read-receipts.db` | SQLite 文件路径 |
| `ADMIN` | 无 | 管理员 wxId（逗号分隔多个），此类账号受保护：不可删除、不可降级 |
| `INVITE_CODE` | 无 | 注册邀请码；未设置时注册直接通过 |
| `TRUSTED_PROXY` | 空 | 信任的代理网段（CIDR，逗号分隔）；**仅填真正直连服务的代理**，反代/CF Tunnel 场景必填。命中时从 `X-Forwarded-For` 自右向左取首个非受信代理 IP（抵御反代「追加」模式下的首值伪造），否则信任伪造头 |
| `ENABLE_GEO` | `1` | 按需 IP 定位开关（`0`/`off`/`false` 关闭）：隐藏「定位」按钮并拒绝 geo 端点，打点路径始终零外部请求 |
| `GEO_ALLOW_HTTP` | `0` | 是否允许明文本地化接口 ip-api.com（仅 HTTP）；默认关闭，中文定位缺失时由英文兜底 |
| `MESSAGE_QUOTA_FORMULA` | `x` | 等级消息保留条数公式（`x` = 等级），超出自动删除最早消息 |
| `GEO_QUOTA_FORMULA` | `x` | 等级 IP 定位次数公式（每日配额），耗尽返回 `429`；按 **UTC 自然日惰性归零**（跨天首次定位即从 1 起算，不继承昨日用量），非当日的陈旧计数由 `dailyCleanup` 回收（幂等，重启不会重置当日配额） |
| `RETENTION_MONTHS_FORMULA` | `x` | 等级消息保留时长（月），结果 0 表示不限制 |
| `REGISTER_PER_WXID_PER_MIN` | `30` | `/register` 单个 wxId 每分钟注册条数上限（公开端点，无鉴权） |
| `REGISTER_PER_WXID_PER_DAY` | `500` | `/register` 单个 wxId 每天注册条数上限 |
| `PBKDF2_MAX_ITER` | `1000000` | PBKDF2 哈希迭代次数上限（拒绝被污染/恶意构造的超大 iter，防登录 DoS） |
| `PBKDF2_ITERATIONS` | `100000` | 新哈希的 PBKDF2 迭代次数（下限 1000）。**Workers 免费档（10ms CPU）应设 `20000`**，付费档保持默认；`wrangler.jsonc` 已为 Workers 预置 `20000` |
| `CRON_KEY` | 无 | **仅 Workers 形态**：Cron Triggers 转发进 DO 的鉴权密钥（`wrangler secret put CRON_KEY`），未设置时定时任务拒绝执行 |
| `AUDIT_RETENTION_DAYS` | `30` | 审计日志保留天数（`0` = 不清理，长期留存） |

> **仅 Bun 部署适用**：`PORT` / `BIND_HOST` / `TLS_CERT` / `TLS_KEY` / `DB_PATH` / `TRUSTED_PROXY`。Workers 形态恒为边缘 HTTPS、真实 IP 由边缘注入 `CF-Connecting-IP`，这些变量不适用（见部署形态 D）。

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
- **修改方式**：管理后台「等级权益」页签可查看公式与 1-20 级预览、在线编辑（Bun 写 `.env`、Workers 写 meta 表，**保存即生效**，无需重启）；或用命令 `bun run manage levels set message=x*2 geo=x*5 retention=x`（`manage levels show` 查看，空公式恢复默认 `x`，重启后生效）

### 限流（per-IP 固定窗口，非等级权益）

| 端点 | 限额 | 超出后 |
|---|---|---|
| `/pixel` | 200/分 | fail-open（超限仅跳过打点记录，仍返回像素） |
| `/count` | 60/分 | 超限返回 429 |
| `/register` | 30/分（per-IP）+ 30/分·500/天（per-wxId） | 超限返回 429 |
| `/auth/*` | 5/分 | fail-closed（拒绝） |
| `/admin/*` | 30/分 | fail-closed（拒绝） |
| `/reads/:id/geo` | 30/分 | fail-closed（拒绝） |

</details>

<details>
<summary><b>数据与维护</b></summary>

- 时间统一以 UTC 存储（`YYYY-MM-DD HH:MM:SS`）；Web 中文界面显示北京时间（UTC+8），英文界面显示 UTC；消息 id = `SHA-256(wxId + \x00 + content + \x00 + createTime)`，createTime 为客户端 13 位毫秒十进制字符串，绝不数值化/截断
- 已读明细默认记录 `ip`、`user_agent`、时间；**定位为按需触发**——在已读详情中点「定位」按钮才调用免费接口补全省市/运营商（不含经纬度），结果仅本人/管理员可见，`ENABLE_GEO=0` 可整体关闭
- 定位结果**双语存储**：中文取自 ip-api(zh,需开 `GEO_ALLOW_HTTP`) → ipwho.is(zh)，英文取自 ipwho.is(en) → ipinfo.io → api.ip.sb → freeipapi（对数据中心/共享出口宽容的备用源），两路并发、失败逐级降级，中文缺失时以英文结果兜底；已读明细的「地区+运营商」随页面语言切换展示
- **Workers 部署注意**：免费定位接口对共享出口限流较严，失败结果有 1 小时缓存；定位失败时可稍后重试或切换网络，外呼失败也会消耗当日定位配额（防刷设计）
- 运营商显示为双语短名（如 中国移动 / China Mobile），国外 ISP 仅在英文视图显示原文
- 存量数据的运营商短名可通过 `bun run backfill-isp` 一次性补齐；已定位但缺英文的行会在下次点「定位」时自动重查补齐
- `reads` 表无外键、无 wxId，删用户/删消息由服务端在同一事务内清理对应 reads；残留孤儿 reads 由每日任务清理（保留 7 天）
- 定时任务：每 10 分钟游标增量回填统计表；每日清理过期会话、`AUDIT_RETENTION_DAYS`（默认 30）天前审计日志、孤儿 reads 并重建 FTS；**若启用了僵尸清理策略，每日任务还会自动执行用户清理**（见下）

### 僵尸用户自动清理

针对「注册后从未使用 / 长期沉寂」的账号，避免库里堆积大量无意义用户与幽灵排行榜条目。策略在管理后台「僵尸清理」页签配置，**两项规则独立生效，均为 0 表示不清理**：

| 规则 | 字段 | 含义 |
|---|---|---|
| 从未注册消息 | `newUserDays` | 注册后 N 天内**从未注册过任何消息** → 删除 |
| 长期沉寂 | `dormantDays` | 注册过消息，但最后一次注册消息距今超过 N 天 → 删除 |

- **「是否注册过消息」以 `registration_stats` 累计值为准**，不能用 `messages` 表判断（消息会按等级配额 `MESSAGE_QUOTA_FORMULA` 与保留时长 `RETENTION_MONTHS_FORMULA` 被裁剪，老用户的消息可能早已清空但仍属活跃用户）
- **删除范围**：用户 + 其全部 `messages` + 这些消息的 `reads` + `sessions`；`registration_stats` / `read_stats` / `message_read_stats` / `ip_block_account` 在删除事务中**显式清空**（不再单纯依赖外键 `ON DELETE CASCADE`）——即**排行榜中该用户的记录一并清空**，不留幽灵条目。
  > ⚠️ SQLite 的外键级联仅在执行删除的连接开启了 `PRAGMA foreign_keys = ON` 时才生效。若曾用外部工具（DB Browser、`sqlite3` 命令、导入导出）或旧版服务删除用户，级联不会触发，会在排行榜三表留下孤儿行。可用 `bun run cleanup-orphans [--dry-run]` 脚本按「父用户已不存在」清理历史孤儿行（支持 `--dry-run` 预演）。
  >
  > 此外 `dailyCleanup` 每日还会对 `registration_stats` / `read_stats` / `message_read_stats` 统一做一次孤儿清理。`read_stats` / `message_read_stats` 因有「增量回填」会在大量删除后被全量重建、孤儿行会自然消失，而 `registration_stats` 不参与重建，历史上仅靠此每日清理兜底，故尤其要注意——**排行榜查询本身也已 `JOIN users`，孤儿行绝不会展示在榜上**。
- **豁免**：`ADMIN` 列表内的账号、以及被管理员停用（`level = 0`）的账号永不自动删除
- **单次上限 `PURGE_BATCH_LIMIT = 1000`**：避免首次启用时一次性长事务阻塞读写，超出的候选留待次日任务继续（预演与执行均返回 `truncated` 标记）
- **触发**：管理后台「保存」后立即生效、无需重启；`dailyCleanup` 自动执行；页面另提供「预演」（只统计不删，展示样例）与「立即清理」（二次确认后执行，写审计留痕）手动入口
- 天数上限 `MAX_RETENTION_DAYS = 36500`（≈100 年），后端校验 `0..上限` 的整数，越界 / 非整数 / 负数 / 字符串一律拒绝

</details>

## 部署

> **安全铁律**：`TRUSTED_PROXY` 只填真正直连服务的代理网段。公网直连（无代理）时绝不设置，否则任何人都能伪造 `CF-Connecting-IP` / `X-Forwarded-For` 冒充任意 IP，绕过限流与审计。

### 部署形态总览

| 形态 | BIND_HOST | TRUSTED_PROXY | 真实 IP 来源 | HTTPS |
|---|---|---|---|---|
| A. 公网服务器 + 反代（推荐） | 默认 | `127.0.0.1/32`（同机） | `X-Forwarded-For`（自右向左首个非受信 IP） | 反代终止（自动证书） |
| B. 公网服务器直连 | `0.0.0.0` | **不设** | 直连公网 IP | 内置 TLS / 裸 HTTP |
| C. 无公网 IP + Cloudflare Tunnel | 默认 / `0.0.0.0` | `127.0.0.1/32`（同机） | `CF-Connecting-IP` | CF 终止 |
| D. Cloudflare Workers（免服务器） | 不适用 | 不适用 | `CF-Connecting-IP`（边缘写入，不可伪造） | 边缘终止（恒 HTTPS） |

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

### D. Cloudflare Workers（免服务器）

> **⚠️ 一键部署为 Cloudflare 开放测试（Open Beta）功能**，部署流程与资源开通行为以[官方文档](https://developers.cloudflare.com/workers/platform/deploy-buttons/)为准。

#### 一键部署（推荐）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lie-jiu/wekit-read-receipts-server)

点击按钮后 Cloudflare 会：把仓库克隆到你的 GitHub/GitLab 账号并建立 CI/CD（后续 push 自动重新部署）；读取 `wrangler.jsonc` **自动开通资源——包括 Durable Object 及其内置 SQLite 数据库**（无需单独创建数据库，schema 在首次请求时自动建表）；按仓库根目录 `.dev.vars.example` **逐项询问机密**（`ADMIN`、`CRON_KEY`，可选 `INVITE_CODE`），填写的值存为 Worker Secrets。

部署完成后：打开分配的 `*.workers.dev` 地址 → 以 `ADMIN` 声明的 wxId 在登录页注册即获管理员权限。

<details>
<summary><b>一键部署后核对清单</b></summary>

- **数据库**：由 Durable Object 自动开通（`durable_objects` + `migrations` 配置），首次访问任一页面即自动建表（schema v1→v7）；无需（也不支持）用 `wrangler d1` 操作
- **机密**：若部署时未填写，随时可在 Dashboard → Worker → Settings → Variables 补设，或 `wrangler secret put ADMIN` / `wrangler secret put CRON_KEY`。`CRON_KEY` 未设置时定时任务不会执行
- **免费计划必读**：`PBKDF2_ITERATIONS` 变量已默认 `20000` 以适配免费档 10ms CPU 限制；付费计划可删除该变量（回退 10 万迭代）
- **大陆访问**：`*.workers.dev` 在大陆普遍不可达，绑定自有域名（Worker → Settings → Domains & Routes）
- **验证**：登录后台 → 注册消息 → 打点像素后查看已读数；`wrangler tail` 观察 Cron Triggers 日志

</details>

#### 手动部署

同一代码库经适配层运行于 **单实例 Durable Object**：Worker 只做转发，Hono 应用与全部业务逻辑整体在 DO 内执行，数据库为 DO 内置 SQLite（同步 API 与 `bun:sqlite` 语义对齐，FTS5 全文搜索可用）。单实例还让进程内限流与定位缓存恢复「全局唯一进程」语义。

```bash
bun install
bunx wrangler login
bun run deploy                      # 首次部署（配置见 wrangler.jsonc）
bunx wrangler secret put ADMIN      # 管理员 wxId
bunx wrangler secret put CRON_KEY   # 定时任务鉴权密钥（openssl rand -hex 32 自取）
bunx wrangler secret put INVITE_CODE  # 可选：注册邀请码
```

- 首次请求自动建表（schema v1→v7，版本存 `meta` 表）；数据从零开始，`mkuser` / `manage` 脚本不可用：先用 `wrangler secret put ADMIN=<wxId>` 声明管理员，再在登录页以该 wxId 注册，即获管理员权限
- 定时任务由 Cron Triggers（每 10 分钟统计回填 / 每日 UTC 0 点清理）经 `CRON_KEY` 鉴权转发进 DO 执行
- 等级公式持久化在 meta 表，管理后台保存即时生效

<details>
<summary><b>与 Bun 形态的差异与注意事项</b></summary>

- **恒 HTTPS**：会话 cookie 恒为 `__Host-session` + Secure，HSTS 恒下发；`PORT` / `BIND_HOST` / `TLS_*` / `DB_PATH` / `TRUSTED_PROXY` 等变量不适用
- **免费档 CPU 上限 10ms/请求**：登录验证的 PBKDF2 计算约需 30–50ms（10 万次迭代）。`wrangler.jsonc` 已预置 `PBKDF2_ITERATIONS=20000` 适配免费档；付费档（$5/月，30s CPU）建议删除该变量回退 10 万迭代
- **计费**：按请求数 + CPU + SQLite 行读写计费；每次 `/pixel` 命中写一行 `reads`（含索引约 3 rows written），个人规模月成本可忽略
- **大陆可达性**：`workers.dev` 域名在大陆普遍不可用，正式使用请在 CF 托管的域名上绑定**自定义域**（Workers → Settings → Domains & Routes）
- **单 DO 软上限约 1000 req/s**；DO 实例被平台回收重启后，内存中的限流窗口与定位缓存会清空（无数据风险，数据全在 SQLite），限流短暂放宽属预期行为
- **本地开发**：`bun run dev:cf`（miniflare 模拟 DO SQLite，数据存 `.wrangler/`）；机密写入 `.dev.vars`（已 gitignore），如 `CRON_KEY=xxx`。类型检查 `bun run typecheck` 同时覆盖 Bun 与 Workers 两套 tsconfig

</details>

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

AGPL-3.0（GNU Affero General Public License v3.0）
