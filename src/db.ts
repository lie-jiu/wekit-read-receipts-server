/** 64 位小写 hex 校验（id = SHA-256 hex） */
const HEX_CHECK = "length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'";
const DATE_CHECK = "date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";

const MIGRATIONS: string[] = [
  /* v1：初始 schema */
  `
CREATE TABLE users (
  wx_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL CHECK (length(password_hash) >= 60),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 0 AND 99),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE messages (
  id TEXT PRIMARY KEY CHECK (${HEX_CHECK}),
  wx_id TEXT NOT NULL REFERENCES users(wx_id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 10000),
  timestamp TEXT NOT NULL
) STRICT;
CREATE INDEX idx_messages_wx_id_timestamp ON messages(wx_id, timestamp);

CREATE TABLE reads (
  id TEXT NOT NULL CHECK (${HEX_CHECK}),
  ip TEXT NOT NULL CHECK (length(ip) BETWEEN 1 AND 64),
  timestamp TEXT NOT NULL,
  PRIMARY KEY (id, ip)
) STRICT;
CREATE INDEX idx_reads_id_timestamp ON reads(id, timestamp);
CREATE INDEX idx_reads_timestamp ON reads(timestamp);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  wx_id TEXT NOT NULL REFERENCES users(wx_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at >= created_at)
) STRICT;
CREATE INDEX idx_sessions_wx_id ON sessions(wx_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  wx_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  timestamp TEXT NOT NULL
) STRICT;
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE registration_stats (
  date TEXT NOT NULL CHECK (${DATE_CHECK}),
  wx_id TEXT NOT NULL REFERENCES users(wx_id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (date, wx_id)
) STRICT;

CREATE TABLE read_stats (
  date TEXT NOT NULL CHECK (${DATE_CHECK}),
  wx_id TEXT NOT NULL REFERENCES users(wx_id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (date, wx_id)
) STRICT;

CREATE TABLE message_read_stats (
  date TEXT NOT NULL CHECK (${DATE_CHECK}),
  wx_id TEXT NOT NULL REFERENCES users(wx_id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (date, wx_id)
) STRICT;

CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  tokenize = 'trigram',
  content = 'messages',
  content_rowid = 'rowid'
);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
`,
  /* v2：已读明细扩展——UA 与按需 IP 定位（省市/运营商，不含经纬度） */
  `
ALTER TABLE reads ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN isp TEXT NOT NULL DEFAULT '';
`,
  /* v3：已读明细 i18n——定位信息双语（zh 已存于 v2 列，en 独立存储，前端随语言切换展示） */
  `
ALTER TABLE reads ADD COLUMN country_en TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN region_en TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN city_en TEXT NOT NULL DEFAULT '';
ALTER TABLE reads ADD COLUMN isp_en TEXT NOT NULL DEFAULT '';
`,
  /* v4：IP 定位按等级配额——users 增加累计定位次数（geo_count） */
  `
ALTER TABLE users ADD COLUMN geo_count INTEGER NOT NULL DEFAULT 0 CHECK (geo_count >= 0);
`,
  /* v5：IP 定位配额按日刷新——users 增加当日日期列（geo_date）。
   * geo_count 语义由「历史累计」改为「当日已用次数」：
   * 请求时若 geo_date 非今日则视为当日已用 0 次（惰性归零），每日任务兜底清零。 */
  `
ALTER TABLE users ADD COLUMN geo_date TEXT NOT NULL DEFAULT '';
`,
  /* v6：IP 黑名单——全局（管理员）/ 单条消息 / 账户三类，已读详情接口在服务端过滤命中行（不返回其数据），不删除 reads 记录。
   * 消息/账户表分别外键级联删除，随 messages/users 清理。 */
  `
CREATE TABLE ip_block_global (
  ip TEXT PRIMARY KEY CHECK (length(ip) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE ip_block_message (
  id TEXT NOT NULL CHECK (${HEX_CHECK}),
  ip TEXT NOT NULL CHECK (length(ip) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, ip),
  FOREIGN KEY (id) REFERENCES messages(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE ip_block_account (
  wx_id TEXT NOT NULL REFERENCES users(wx_id) ON DELETE CASCADE,
  ip TEXT NOT NULL CHECK (length(ip) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (wx_id, ip)
) STRICT;
`,
  /* v7：消息详情公开开关——is_public=1 时未登录/非 owner 也可查看详情与已读分页（只读），默认关闭 */
  `
ALTER TABLE messages ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1));
`,
];

/* ────────────── 同步 SQLite 后端抽象 ──────────────
 * 业务代码面向本接口编写，运行时由入口注入具体后端：
 *   - Bun 部署：src/backends/bun-sqlite.ts（bun:sqlite，WAL/PRAGMA 等本地优化）
 *   - Cloudflare Workers：worker/do-sqlite.ts（Durable Objects 内置 SQLite，ctx.storage.sql）
 * 两个后端语义对齐：同步 get/all/run、同步事务（回调抛异常即回滚）、run().changes。
 */

export type SqliteRunResult = { changes: number; lastInsertRowid?: number | bigint };

export interface SqliteStmt {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): SqliteRunResult;
}

export interface SqliteBackend {
  query(sql: string): SqliteStmt;
  prepare(sql: string): SqliteStmt;
  /** 多语句脚本（迁移 DDL），不支持绑定参数 */
  exec(sql: string): void;
  /** 同步事务：与 bun:sqlite 一致，返回待调用的事务函数，回调抛异常即回滚 */
  transaction<T>(fn: () => T): () => T;
  close(): void;
  /** schema 版本存取：bun 后端用 PRAGMA user_version，DO 后端用 meta 表 */
  getVersion(): number;
  setVersion(version: number): void;
}

let _backend: SqliteBackend | null = null;

/**
 * 注入 SQLite 后端。所有运行时入口（index.ts / worker/index.ts / 测试预载 / 脚本）必须在使用前调用。
 * 允许重复注入：Workers 上 DO 实例被平台回收重建是常态（模块级状态可能留存），新实例必须重绑自己的 storage。
 */
export function setSqliteBackend(backend: SqliteBackend): void {
  _backend = backend;
  sqlite = backend;
  /* 预编译语句捕获的是旧后端的连接/storage，重绑后必须失效重取（见 stmt()） */
  _stmt = null;
}

/** 当前注入的后端（未注入时为 null），供 ensure* 幂等初始化判断 */
export function getSqliteBackend(): SqliteBackend | null {
  return _backend;
}

/** 全局数据库句柄（ESM live binding：setSqliteBackend 重赋值后所有导入方即时可见） */
export let sqlite: SqliteBackend;

/** 预编译高频 statement（懒加载，确保 migrate() 完成后才 prepare） */
let _stmt: {
  insertRead: ReturnType<typeof sqlite.prepare>;
  countReads: ReturnType<typeof sqlite.prepare>;
} | null = null;

export function stmt() {
  if (!_stmt) {
    _stmt = {
      insertRead: sqlite.prepare(
        "INSERT OR IGNORE INTO reads (id, ip, timestamp, user_agent) VALUES (?, ?, ?, ?)",
      ),
      countReads: sqlite.prepare(
        `SELECT COUNT(DISTINCT ip) AS n FROM reads
         WHERE id = ?
           AND ip NOT IN (SELECT ip FROM ip_block_global)
           AND ip NOT IN (SELECT ip FROM ip_block_message WHERE id = ?)
           AND ip NOT IN (SELECT ip FROM ip_block_account WHERE wx_id = ?)`,
      ),
    };
  }
  return _stmt;
}

export function migrate(): void {
  const current = sqlite.getVersion();
  if (!Number.isInteger(current) || current < 0) {
    throw new Error(`[migrate] 非法 schema 版本: ${current}，拒绝迁移`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    try {
      sqlite.transaction(() => {
        sqlite.exec(MIGRATIONS[v]!);
        sqlite.setVersion(v + 1);
      })();
      console.log(`[migrate] v${v + 1} 完成`);
    } catch (e) {
      console.error(`[migrate] v${v + 1} 失败:`, e);
      throw e;
    }
  }
}
