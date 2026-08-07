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
| `DB_PATH` | `./data.db` | SQLite 文件路径 |
| `ADMIN` | 无 | 管理员 wxId（逗号分隔多个），此类账号受保护：不可删除、不可降级（level 0） |
| `INVITE_CODE` | 无 | 注册邀请码；未设置时注册直接通过 |
| `TRUSTED_PROXY` | 空 | 信任的代理网段（CIDR，逗号分隔，如 `127.0.0.1/32,::1/128`）；**Nginx/Caddy 反代时必填**，否则将信任伪造的 `X-Forwarded-For` |

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
| `/reads/:id` | 单条消息读取明细（IP、时间） |
| `/leaderboard` | 排行榜：注册数 / 读取数 / 消息数 × 日榜 / 总榜（wxId 脱敏） |
| `/admin/*` | 管理后台：用户管理、等级调整、消息管理（`level 0` = 拉黑并清空该用户数据） |

## 配额与限流

- **消息配额**（超出自动删除最早消息）：

  | level | 1 | 2 | 3 | 4–5 | 6–8 | 9+ |
  |---|---|---|---|---|---|---|
  | 保留条数 | 20 | 50 | 100 | 250 | 500 | 1000 |

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
- `reads` 表无外键、无 wxId，删用户/删消息由服务端在同一事务内清理对应 reads；残留孤儿 reads 由每日任务清理（保留 7 天）
- 定时任务：每 10 分钟游标增量回填统计表；每日清理过期会话、30 天前审计日志、孤儿 reads 并重建 FTS

## 部署

```bash
# 生产环境必须 HTTPS（__Host-session Secure Cookie 要求）
# 反向代理务必透传真实 IP 并配置 TRUSTED_PROXY，否则会信任伪造的 X-Forwarded-For
# Nginx 示例：
# location / {
#     proxy_pass http://127.0.0.1:3000;
#     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
# }
```

生产建议：HTTPS 终止于反代层、`TRUSTED_PROXY` 仅填反代网段、`DB_PATH` 指向持久化磁盘（WAL 自动开启）、`ADMIN` 声明受保护账号、`INVITE_CODE` 开启邀请码以限制注册。
