# 自建服务器已读计划
该项目会上传至github仓库公开，先进行仓库初始化（仓库已创建）。
客户端的上传逻辑在该md文件的同级目录：`ReadReceipts.kt`禁止修改客户端代码。

## 技术栈

- 运行时：**Bun 1.3+**（当前稳定版 1.3.14；1.4.0 尚在 canary；原生 TS、零构建）
- 框架：**Hono 4.13+**（当前最新 4.13.x）
- ORM：**Drizzle ORM**（`drizzle-orm/bun-sqlite` 驱动；用 npm 的 `latest` 稳定线，勿装 `@rc`/`@beta`）
- 数据库：**SQLite**（STRICT 表 + WAL 模式；Bun 内置，Linux 打包 3.53+，满足 STRICT ≥3.37 / FTS5 trigram ≥3.34）
- 密码哈希：**Argon2id**（Bun 内置 `Bun.password.hash/verify`，默认即 argon2id；不兼容旧 PBKDF2，新账号重新注册）
- 依赖仅 2 个：`hono`、`drizzle-orm`
- 前端：TS 模板字符串内联（移植 `src/pages/` 三个页面，含中英 i18n）

> ⚠️ 实施时须在启动时打印 `SELECT sqlite_version()` 验证：Linux 部署没问题；macOS 开发机可能回退到系统 SQLite 3.43.2。开发机建议 `Database.setCustomSQLite()` 指向新版 SQLite，或直接在 Linux 上开发/测试。

## 目录结构

```
src/
├── index.ts        # 入口：Bun.serve + Hono + 定时任务（Bun.cron() 进程内调度）
├── app.ts          # 全部路由
├── db.ts           # bun:sqlite + Drizzle；启动时执行版本化迁移（PRAGMA user_version）
│                   # 连接 PRAGMA：journal_mode=WAL / synchronous=NORMAL / busy_timeout=5000
├── config.ts       # 常量、安全头、CSP（移植 src/config.js）、环境判断（控制 __Host 前缀）
├── utils.ts        # 哈希、脱敏、computeId、时间格式化、LIKE 转义、审计、timing-safe 比较
├── auth.ts         # 会话 Cookie、管理员、等级配额（移植 src/auth.js 逻辑）
├── rate-limit.ts   # 进程内固定窗口限流（Map，替代 Workers Cache API）
├── stats.ts        # 排行榜统计回填（Bun.cron 惰性累计 reads → read_stats / message_read_stats）
├── png.ts          # 1×1 追踪像素
└── pages/          # login.ts / dashboard.ts / admin.ts（移植 src/pages/）
scripts/mkuser.ts   # bun run mkuser <wxid> <密码> 建号
tests/              # bun test 端到端（Hono app.request() + :memory: 库）
```

## 数据库 schema（加固版，核心：reads 无外键）

1. **外键策略（分层）**：
   - **保留 CASCADE 外键**：`messages.wx_id → users`、`sessions.wx_id → users`、三张统计表 `wx_id → users`
   - **`reads` 表不设任何外键、不含 wx_id**，只存 `(id, ip, timestamp)`。理由见下方 /pixel 设计（先打点后注册竞态）
   - 删除消息/用户时，reads 由**应用层手动级联**：所有删除 messages 的代码路径（配额清理、admin 删用户/删消息、用户删全部）**必须在同一个数据库事务中**同步执行 `DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)` 或按 id 删除
   - 孤儿 reads（id 在 messages 中不存在）由 Bun.cron 兜底清理（见定时任务）
2. **CHECK 约束兜底**：`level 0-99`、`count >= 0`、`content ≤ 10000`、`id 必须 64 位 hex`、`ip 1-64 字符`、`password_hash ≥ 60`、`date 格式 YYYY-MM-DD`、`expires_at >= created_at`。
3. **STRICT 表与 Drizzle 适配**：强类型（SQLite ≥3.37）。**注意：Drizzle ORM 对 STRICT 表和 FTS5 虚拟表声明支持不佳，所有表结构、FTS5、触发器必须手写原生 SQL 放入版本化迁移脚本中执行**。Drizzle 仅用于日常的 SELECT/INSERT/UPDATE/DELETE 查询构建。audit_logs.id 用 `INTEGER PRIMARY KEY`（rowid 别名）。
4. **FTS5 全文搜索**（替代 `LIKE %q%`，仅 messages 表）：
   - `CREATE VIRTUAL TABLE messages_fts USING fts5(content, tokenize='trigram', content='messages', content_rowid='rowid')`
   - AFTER INSERT / AFTER DELETE 触发器同步索引
   - 查询 ≥3 字符走 FTS，≤2 字符回退 LIKE（trigram 需要 3 字符起）
5. **索引**：messages(wx_id,timestamp)、reads(id,timestamp)（详情倒序）、reads(timestamp)（孤儿清理与游标扫描）、sessions(wx_id)、sessions(expires_at)、audit_logs(timestamp)。
6. **版本化迁移**：`PRAGMA user_version` 管理，按版本依次执行（各包事务），替代重跑整个 schema。

表清单：users、messages、reads(id,ip,timestamp)、sessions、audit_logs、meta(key,value)、registration_stats、read_stats、message_read_stats（+ messages_fts）。统计表"只增不减"。`reads(id, ip)` 唯一去重语义保留。

## 时间与时区（统一规范：全 UTC+8 中国时区）

- **数据库全部直接存 UTC+8 时间**：`timestamp`/`created_at` 统一使用 `chinaNow()`（`new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')`）。
- **禁止**使用 SQLite 的 `datetime('now')`（其返回 UTC）或依赖 VPS 系统本地时区。
- **createTime（客户端传入）是 UTC 毫秒时间戳字符串**（`System.currentTimeMillis()`，13 位十进制），只作 computeId 的输入，**不进库、不参与展示**。
- 所有的统计/榜单/脱敏展示、自然日划分，一律基于数据库中已存的 UTC+8 时间直接截取比对（如 `WHERE date(timestamp) = ?`），彻底消除偏移计算误差。

## 端点设计（客户端兼容为最高优先级）

### 公开端点

**`GET /pixel?wxId=&id=`（1×1 PNG 打点）— 无状态设计，核心！**
- **不查 messages 表、不校验 wxId 是否注册**，仅校验 `id` 格式（64 位 hex，`wxId` 仅做格式长度校验）
- 直接 `INSERT OR IGNORE INTO reads (id, ip, timestamp)` —— `timestamp` 使用 `chinaNow()` 写入。容忍"先打点、后 /register"的竞态，第一批已读数据不丢失
- 记录失败（如孤儿数据）不影响响应，恒返回 1×1 PNG
- **限流放宽为每 IP 200 次/分**（fail-open）：群聊 20+ 人同时打开不会打爆；微信加载失败重试也不会连带失败。超限返回 PNG 不报错。
- 说明：wxId 仅保留在 URL 中，用于日后日志排查，不参与写入

**`POST /register`（注册消息）— 服务端重算 id，绝不信任客户端**
- 只接受 `wxId`、`content`、`createTime` 三个字段（JSON），**不含 id**。服务端接收时强制 `String(createTime)` 防精度丢失。
- `id = SHA-256( utf8(wxId) + 0x00 + utf8(content) + 0x00 + utf8(String(createTime)) )`
- **createTime 必须原样按十进制字符串拼接**（13 位毫秒），不得转 Date、不得截断毫秒、不得数值化丢失精度——否则 id 与客户端 XML 不一致，永远查不到已读
- 其余校验照旧：wxId 已注册、level≠0（拉黑）、长度限制、`INSERT OR IGNORE`、新插入时触发等级配额惰性清理
- 返回 `{"id": ...}`

**`GET /count?wxId=&id=` — 返回格式严格固定**
- **恒返回 `application/json`，Body 严格为 `{"count": 数字}`**（客户端解析 `["count"]?.jsonPrimitive?.content?.toIntOrNull()`）
- **不查 messages 是否存在**：直接 `SELECT COUNT(DISTINCT ip) FROM reads WHERE id = ?`，无记录返回 `{"count": 0}`，**不允许返回 null/404/纯数字**
- **限流 60 次/分（fail-open）**：超限直接返回 `{"count": 0}` 防止客户端崩溃。
- 注意：由于 NAT 同局域网多设备查看可能只计 1 次，此限制需在 README 说明。

**`GET /auth/status`**：返回 `{auth_required: true, invite_required: !!INVITE_CODE}`（原样）
**`POST /auth/register|verify|logout`**：注册/登录/登出（原逻辑）

### 登录后端点

- `GET /`（仪表盘）、`GET/DELETE /messages`、`GET/DELETE /messages/:wxId`（限本人）、`GET /reads/:id`（限本人）、`POST /auth/password`、`GET /leaderboard`（day|total × reg|read|msg，前十，wxid/内容脱敏，me 标记）

### 管理员端点

- `/admin` 页面 + `GET/POST /admin/users`、`POST /admin/level`（0=拉黑清数据）、`POST /admin/password`、`DELETE /admin/users/:wxId`、`GET/DELETE /admin/messages`、`DELETE /admin/messages/:id`、`GET /admin/reads/:id`

## 定时任务（Bun.cron()，进程内调度）

1. **每日一次**：清理过期 sessions、>30 天 audit_logs、**孤儿 reads（`id NOT IN (SELECT id FROM messages)` 且 `timestamp` 早于 7 天前的保留）**——保留 7 天内的孤儿，给迟到的 /register 留出匹配窗口；FTS5 `rebuild`
2. **每 10 分钟一次**：排行榜统计回填（见下）
3. **启动时**：各执行一次（含 FTS rebuild）

### 统计回填（stats.ts）——持久化游标防重启刷爆

由于 /pixel 无状态打点，read_stats / message_read_stats **不再在打点时内联更新**，改为 Bun.cron 增量回填：

- 数据库新增 `meta` 表，记录上次回填游标 `stats_cursor`。
- 扫描 `reads.timestamp > 上次游标` 的行，`JOIN messages` 取 wx_id/content；仅在 messages 有记录时累计（按 `reads.timestamp` 的 UTC+8 日期归入中国自然日）。
- **游标更新与统计累加必须在同一个数据库事务中执行**，防止进程崩溃导致重复累计。
- 优点：杜绝攻击者用假 wxId 参数刷 read_stats；缺点：榜单延迟最多 10 分钟，可接受

## 安全

- 限流 5 档：**pixel 200/分**（fail-open）、**count 60/分**（fail-open）、auth 5/分（fail-closed）、admin 30/分（fail-closed）、register 30/分（fail-open）
- 会话：生产环境强制使用 `__Host-session=sess_` 随机 ID + 服务端存 SHA-256 哈希，30 天，登录后 JOIN users 取最新 level。**开发环境（localhost）退化为 `session=` 且不设 Secure**，避免浏览器丢弃 Cookie 导致永远登不上。
- **`__Host-` Cookie 强制 HTTPS**：生产**必须** Nginx/Caddy + TLS；IP 直连或非 443 标准端口访问会登录失败，部署文档必须注明。
- IP 获取：配置 `TRUSTED_PROXY` 网段时读 X-Forwarded-For，否则用 socket 地址
- 安全响应头 + CSP（LOGIN/DASHBOARD 两套原样移植）；登录失败随机延迟 250-750ms；timing-safe 比较
- 环境变量：`ADMIN`（逗号分隔 wxid）、`INVITE_CODE`（可选）、`PORT`、`DB_PATH`、`TRUSTED_PROXY`、`NODE_ENV`

## 部署

VPS + systemd（或 Docker oven/bun 镜像）+ **Nginx/Caddy 反代并强制 TLS**（`__Host-` 前提）；SQLite 放 /var/lib；每日 `sqlite3 .backup`（或 Litestream→S3）备份。

## 实施顺序

1. 脚手架（package.json / tsconfig strict / db.ts 原生 SQL 迁移框架 + user_version + meta 表）
2. utils / config / png 移植（实现 `chinaNow()` 获取 UTC+8，`computeId` 严格按字符串拼接实现）
3. auth / rate-limit（区分 dev/prod 的 Cookie 策略）
4. app.ts 全部路由（**先做 /pixel 无状态打点 + /count 固定格式与 fail-open 限流**，公开 → 登录 → 管理）
5. stats.ts 回填（读取/更新 meta 表游标，事务包裹）+ 定时任务（孤儿 reads / 会话 / 审计 / FTS rebuild）
6. pages 三页移植
7. mkuser 脚本
8. 测试全绿，**必测竞态与格式**：
   - /pixel 在 /register 之前打点 → 之后 /register → /count 仍返回 1（先打点后注册）
   - /count 恒返回 `{"count": n}`（含无记录时 `{"count": 0}`，超限限流时也返回 `{"count": 0}`）
   - computeId 与客户端算法一致性（用固定 wxId/content/createTime 断言 64 位 hex）
   - 游标事务测试：模拟统计回填中途失败，验证重启后不会重复累加统计数
   - 注册/登录/改密、IP 去重、配额清理（含 reads 手动级联事务回滚验证）、权限隔离、限流、排行榜脱敏、孤儿 reads 清理
9. README（部署、环境变量、HTTPS 强制要求、NAT 去重限制说明、备份）
