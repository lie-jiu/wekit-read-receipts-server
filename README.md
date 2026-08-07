# wekit-read-receipts-server

自建「微信已读回执」服务器端：为 WeKit `ReadReceipts` 客户端提供打点、统计、账号与管理后台。

- 运行时：Bun 1.3+（内置 `bun:sqlite`，SQLite 3.53+）
- 框架：Hono 4.13
- ORM：Drizzle 仅用于日常查询；schema 由手写原生 SQL 维护，`PRAGMA user_version` 版本化迁移
- 依赖仅 2 个：`hono`、`drizzle-orm`

## 快速开始

```bash
bun install
ADMIN=wxid_admin_1 INVITE_CODE=你的邀请码 bun run mkuser wxid_username 你的密码 2   # 建管理员账号
bun run dev                                                                    # 监听 :3000
```

> `mkuser` 的 `ADMIN` 只是账号标记（受保护）；`INVITE_CODE` 仅注册阶段校验，均可不设。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `DB_PATH` | `./data.db` | SQLite 文件路径（测试用 `:memory:`） |
| `ADMIN` | 无 | 管理员 wxId（逗号分隔可多个），账号受保护不可删/降级 |
| `INVITE_CODE` | 无 | 注册邀请码；未设置时注册直接通过 |
| `TRUSTED_PROXY` | 空 | 信任的代理网段（CIDR，逗号分隔，如 `127.0.0.1/32,::1/128`）；**Nginx/Caddy 反代时必填**，否则将信任伪造的 X-Forwarded-For |
| `LOGIN_DELAY_MS` | `300` | 登录/注册失败应答延迟（毫秒） |

## 端点

客户端兼容（无状态、无鉴权，需公网可直连）：

| 端点 | 说明 |
|---|---|
| `GET /pixel?wxId=&id=` | 1×1 透明 PNG；`INSERT OR IGNORE` 打点，不校验注册、不查询消息；`Cache-Control: no-store` |
| `GET /count?wxId=&id=` | 恒 `application/json`，Body 严格 `{"count":n}`；无效 id/无记录均返回 `{"count":0}`；计数为 `COUNT(DISTINCT ip)` |

管理接口（浏览器页面，登录后使用）：

| 端点 | 说明 |
|---|---|
| `/login` `/auth/register` `/auth/verify` `/auth/logout` `/auth/password` `/auth/status` | 会话（30 天，生产环境 `__Host-session` Secure Cookie） |
| `/` | 用户仪表盘：消息搜索（FTS5 trigram）、读取明细、删除消息 |
| `/messages` `DELETE /messages` `DELETE /messages/:wxId` | 消息列表/清空/删除（仅本人） |
| `/reads/:id` | 单条消息的读取明细（IP、时间） |
| `/leaderboard` | 排行榜（注册数/读取数/消息数 × 日榜/总榜，wxId 脱敏） |
| `/admin/users` `/admin/level` `/admin/password` `/admin/messages` | 管理后台（level 0 = 拉黑并清空数据） |
| `POST /register` | 打点量大的客户端批量上报接口（单条/≤50 条），未注册 wxId 返回 403 |

## 数据与维护

- 时间一律 UTC+8；消息 id = `SHA-256(wxId + \x00 + content + \x00 + createTime)`，createTime 为客户端 13 位毫秒十进制字符串，绝不数值化/截断
- `reads` 表无外键、无 wxId，删用户/删消息由服务端在同一事务内清理对应 reads；残留孤儿 reads 由每日任务清理（保留 7 天）
- 定时任务：每 10 分钟游标增量回填统计表；每日清理过期会话/30 天前审计日志/孤儿 reads/重建 FTS
- 配额：免费用户最多保留 20 条消息（超出删最旧）；付费（level 2）不限
- 限流：`/pixel` 200/分、`/count` 60/分（fail-open，打点不因限流失效）；`/register` 30/分；`/auth/*` 5/分、`/admin/*` 30/分（fail-closed）

## 部署

```bash
# 反向代理：透传 WebSocket 不需要，但务必设置 X-Forwarded-For 并配置 TRUSTED_PROXY
# Nginx 示例：
# location / {
#     proxy_pass http://127.0.0.1:3000;
#     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
# }
# 生产环境必须启用 HTTPS（Secure Cookie 要求）
```

生产环境建议：HTTPS（`__Host-session` 要求）、`TRUSTED_PROXY` 仅填你自己的反代网段、`DB_PATH` 指向持久化磁盘（WAL 模式自动开启）。

## 测试

```bash
bun test
```

21 个用例：schema/FTS/外键、id 算法与客户端一致性、统计回填游标事务、每日清理、端到端（含竞态、去重计数、限流 fail-open/fail-closed、配额清理、ban/unban 会话失效）。
