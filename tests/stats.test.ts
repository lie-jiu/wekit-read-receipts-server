import { describe, expect, test, beforeAll } from "bun:test";
import { sqlite, migrate } from "../src/db";
import { backfillStats, dailyCleanup, getCursor } from "../src/stats";
import { chinaNow } from "../src/utils";

beforeAll(() => {
  migrate();
  sqlite.exec(
    "DELETE FROM reads; DELETE FROM messages; DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM users; DELETE FROM meta;",
  );
});

function seedUser(wxId: string): void {
  sqlite.query("INSERT INTO users (wx_id, password_hash, level, message_count, created_at) VALUES (?, ?, 1, 0, ?)").run(
    wxId,
    "x".repeat(60),
    chinaNow(),
  );
}

function seedMessage(id: string, wxId: string, timestamp: string): void {
  sqlite
    .query("INSERT INTO messages (id, wx_id, content, timestamp) VALUES (?, ?, ?, ?)")
    .run(id, wxId, "content-" + id.slice(0, 8), timestamp);
}

function readStats(wxId: string): number {
  const row = sqlite
    .query("SELECT COALESCE(SUM(count), 0) s FROM read_stats WHERE wx_id = ?")
    .get(wxId) as { s: number };
  return row.s;
}

function msgReadStats(wxId: string): number {
  const row = sqlite
    .query("SELECT COALESCE(SUM(count), 0) s FROM message_read_stats WHERE wx_id = ?")
    .get(wxId) as { s: number };
  return row.s;
}

describe("stats backfill", () => {
  test("游标事务：增量回填、跳过孤儿、不重复累计", () => {
    migrate();
    seedUser("wxid_a");
    seedUser("wxid_b");

    const idA = "a".repeat(64);
    const idB = "b".repeat(64);
    const t1 = "2026-08-07 10:00:00";
    const t2 = "2026-08-07 11:00:00";
    const t3 = "2026-08-07 12:00:00";
    seedMessage(idA, "wxid_a", t1);
    seedMessage(idB, "wxid_b", t2);

    // 匹配 reads + 孤儿 reads（无对应 message）
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run(idA, "1.1.1.1", t1);
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run(idA, "2.2.2.2", t2);
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run(idB, "3.3.3.3", t2);
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run("f".repeat(64), "4.4.4.4", t3);

    expect(getCursor()).toBe("0000-00-00 00:00:00");
    backfillStats();

    // 孤儿不计入；读次数正确
    expect(readStats("wxid_a")).toBe(2);
    expect(readStats("wxid_b")).toBe(1);
    expect(msgReadStats("wxid_a")).toBe(1);
    expect(msgReadStats("wxid_b")).toBe(1);
    // 游标推进到最大 timestamp（含孤儿行）
    expect(getCursor()).toBe(t3);

    // 再次回填 → 不重复累计
    backfillStats();
    expect(readStats("wxid_a")).toBe(2);
    expect(readStats("wxid_b")).toBe(1);

    // 模拟游标丢失（崩溃前未提交）：回退到 epoch 重扫会重复累计，证明游标事务的必要性
    sqlite.query("UPDATE meta SET value = '0000-00-00 00:00:00' WHERE key = 'stats_cursor'").run();
    backfillStats();
    expect(getCursor()).toBe(t3);
    expect(readStats("wxid_a")).toBe(4);
    expect(readStats("wxid_b")).toBe(2);
  });
});

describe("daily cleanup", () => {
  test("过期会话、>30 天审计、7 天前孤儿 reads、FTS rebuild", () => {
    migrate();
    seedUser("wxid_c");
    sqlite
      .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run("h".repeat(64), "wxid_c", "2026-01-01 00:00:00", "2026-02-01 00:00:00");
    sqlite
      .query("INSERT INTO sessions (token_hash, wx_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run("i".repeat(64), "wxid_c", chinaNow(), "2999-01-01 00:00:00");
    sqlite.query("INSERT INTO audit_logs (wx_id, action, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?)").run(
      "wxid_c",
      "login",
      null,
      "1.2.3.4",
      "2026-01-01 00:00:00",
    );
    const oldOrphan = "2026-01-01 00:00:00";
    const freshOrphan = chinaNow();
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run("5".repeat(64), "1.2.3.4", oldOrphan);
    sqlite.query("INSERT INTO reads (id, ip, timestamp) VALUES (?, ?, ?)").run("6".repeat(64), "1.2.3.5", freshOrphan);

    dailyCleanup();

    expect(sqlite.query("SELECT COUNT(*) c FROM sessions WHERE token_hash = ?").get("h".repeat(64))).toEqual({ c: 0 });
    expect(sqlite.query("SELECT COUNT(*) c FROM sessions WHERE token_hash = ?").get("i".repeat(64))).toEqual({ c: 1 });
    expect(sqlite.query("SELECT COUNT(*) c FROM audit_logs").get()).toEqual({ c: 0 });
    expect(sqlite.query("SELECT COUNT(*) c FROM reads WHERE id = ?").get("5".repeat(64))).toEqual({ c: 0 });
    expect(sqlite.query("SELECT COUNT(*) c FROM reads WHERE id = ?").get("6".repeat(64))).toEqual({ c: 1 });
  });
});
