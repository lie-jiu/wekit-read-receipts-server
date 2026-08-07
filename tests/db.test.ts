import { describe, expect, test, beforeAll } from "bun:test";
import { sqlite, migrate } from "../src/db";
import { chinaNow } from "../src/utils";

beforeAll(() => {
  migrate();
  sqlite.exec(
    "DELETE FROM reads; DELETE FROM messages; DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM users; DELETE FROM meta;",
  );
});

describe("schema", () => {
  test("迁移与表结构", () => {
    migrate();
    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_fts%'")
      .all()
      .map((r: any) => r.name)
      .sort();
    expect(tables).toEqual([
      "audit_logs",
      "message_read_stats",
      "messages",
      "meta",
      "read_stats",
      "reads",
      "registration_stats",
      "sessions",
      "users",
    ]);
    const triggers = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all()
      .map((r: any) => r.name)
      .sort();
    expect(triggers).toEqual(["messages_ad", "messages_ai"]);
    expect((sqlite.query("PRAGMA user_version").get() as any).user_version).toBe(1);
  });

  test("CHECK：id 必须 64 位小写 hex", () => {
    migrate();
    const id = "a".repeat(64);
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run(id, "1.2.3.4", chinaNow());
    expect(() =>
      sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run("zz".repeat(32), "1.2.3.5", chinaNow()),
    ).toThrow();
    expect(() =>
      sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run("A".repeat(64), "1.2.3.6", chinaNow()),
    ).toThrow();
    expect(() =>
      sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run("a".repeat(63), "1.2.3.7", chinaNow()),
    ).toThrow();
  });

  test("CHECK：level 0-99、count >= 0、content <= 10000、date 格式", () => {
    migrate();
    sqlite.query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)").run(
      "wxid_ck",
      "x".repeat(60),
      chinaNow(),
    );
    expect(() =>
      sqlite
        .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 100, 0, ?)")
        .run("wxid_ck2", "x".repeat(60), chinaNow()),
    ).toThrow();
    expect(() =>
      sqlite
        .query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, -1, ?)")
        .run("wxid_ck3", "x".repeat(60), chinaNow()),
    ).toThrow();
    expect(() =>
      sqlite
        .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
        .run("b".repeat(64), "wxid_ck", "x".repeat(10001), chinaNow()),
    ).toThrow();
    expect(() =>
      sqlite
        .query("INSERT INTO registration_stats (date, wx_id, count) VALUES (?, ?, 1)")
        .run("2026/08/07", "wxid_ck"),
    ).toThrow();
  });

  test("reads 无外键：删用户/消息后孤儿 reads 保留", () => {
    migrate();
    sqlite.query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)").run(
      "wxid_r1",
      "x".repeat(60),
      chinaNow(),
    );
    const id = "c".repeat(64);
    sqlite
      .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
      .run(id, "wxid_r1", "hello", chinaNow());
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run(id, "1.2.3.4", chinaNow());

    sqlite.query("DELETE FROM users WHERE wx_id = ?").run("wxid_r1");
    expect(sqlite.query("SELECT COUNT(*) c FROM messages").get()).toEqual({ c: 0 });
    expect(sqlite.query("SELECT COUNT(*) c FROM reads WHERE id = ?").get(id)).toEqual({ c: 1 });
  });

  test("FTS5 trigram 与触发器同步", () => {
    migrate();
    sqlite.query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)").run(
      "wxid_f1",
      "x".repeat(60),
      chinaNow(),
    );
    const id = "d".repeat(64);
    sqlite
      .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
      .run(id, "wxid_f1", "微信已读回执测试内容", chinaNow());
    const hit = sqlite
      .query("SELECT COUNT(*) c FROM messages_fts WHERE messages_fts MATCH ?")
      .get('"微信已读"') as any;
    expect(hit.c).toBe(1);
    sqlite.query("DELETE FROM messages WHERE id = ?").run(id);
    const miss = sqlite
      .query("SELECT COUNT(*) c FROM messages_fts WHERE messages_fts MATCH ?")
      .get('"微信已读"') as any;
    expect(miss.c).toBe(0);
  });
});
