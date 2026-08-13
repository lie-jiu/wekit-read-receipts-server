import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { DB_PATH } from "./config";

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
];

export const sqlite = new Database(DB_PATH, { create: true });

sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA synchronous = NORMAL");
sqlite.exec("PRAGMA busy_timeout = 5000");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite);

function currentVersion(): number {
  const row = sqlite.query("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

export function migrate(): void {
  const current = currentVersion();
  for (let v = current; v < MIGRATIONS.length; v++) {
    sqlite.transaction(() => {
      sqlite.exec(MIGRATIONS[v]);
      sqlite.exec(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}
