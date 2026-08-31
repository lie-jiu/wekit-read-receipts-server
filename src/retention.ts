import { sqlite } from "./db";
import { isAdmin } from "./config";
import { utcDateDaysAgo, utcDaysAgo } from "./utils";

/**
 * 僵尸用户自动清理。
 *
 * 两条独立规则（都存于 meta 表，0 表示不启用，改完立即生效、无需重启）：
 *  - newUserDays：注册后 N 天内**从未注册过任何消息** → 删除。
 *  - dormantDays：**注册过消息**，但最后一次注册消息距今超过 N 天 → 删除。
 *
 * 「是否注册过消息」以 registration_stats 累计值为准，不能用 messages 表判断：
 * 消息会按等级配额（quotaFor）与保留时长（retentionMonthsFor）被裁剪，
 * 老用户的 messages 可能早已清空，但他们仍是活跃用户。
 *
 * 删除范围：用户 + 其消息 + 这些消息的 reads + 会话。
 * registration_stats / read_stats / message_read_stats / ip_block_account 由外键
 * ON DELETE CASCADE 自动清理，即排行榜中该用户的记录一并消失（不留幽灵条目）。
 *
 * 豁免：ADMIN 列表内的账号、以及被管理员停用（level = 0）的账号永不自动删除。
 */

const KEY_NEW_USER_DAYS = "retention_new_user_days";
const KEY_DORMANT_DAYS = "retention_dormant_days";

/** 天数上限（约 100 年），防止误填超大值把整个库清掉 */
export const MAX_RETENTION_DAYS = 36_500;

/** 单次清理上限：避免首次启用时一次性删除过多导致长事务阻塞读写，剩余部分次日任务继续 */
export const PURGE_BATCH_LIMIT = 1000;

export type RetentionSettings = {
  /** 从未注册消息的用户，注册后多少天清理；0 = 不清理 */
  newUserDays: number;
  /** 注册过消息的用户，最后一次注册消息后多少天清理；0 = 不清理 */
  dormantDays: number;
};

export type IdleReason = "never" | "dormant";

export type IdleUser = {
  wxId: string;
  reason: IdleReason;
  createdAt: string;
  /** 最后一次注册消息的自然日（YYYY-MM-DD），从未注册过消息时为 null */
  lastRegAt: string | null;
  /** 累计注册消息数 */
  totalReg: number;
  /** 当前仍保留的消息数 */
  messageCount: number;
};

export type RetentionPreview = {
  settings: RetentionSettings;
  /** 命中清理条件的候选总数（含受豁免账号） */
  total: number;
  /** 实际会被删除的数量 */
  purgeable: number;
  /** 命中但受豁免的数量（管理员 / 已停用） */
  protectedCount: number;
  /** 按原因拆分（仅统计实际会删除的部分） */
  never: number;
  dormant: number;
  /** 候选数超过单次上限：一次执行清不完，剩余的留到下次 */
  truncated: boolean;
  /** 预览样例 */
  samples: IdleUser[];
};

function clampDays(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return Math.min(n, MAX_RETENTION_DAYS);
}

export function getRetentionSettings(): RetentionSettings {
  const rows = sqlite
    .query("SELECT key, value FROM meta WHERE key IN (?, ?)")
    .all(KEY_NEW_USER_DAYS, KEY_DORMANT_DAYS) as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    newUserDays: clampDays(map.get(KEY_NEW_USER_DAYS)),
    dormantDays: clampDays(map.get(KEY_DORMANT_DAYS)),
  };
}

export function saveRetentionSettings(settings: RetentionSettings): void {
  sqlite.transaction(() => {
    for (const [key, value] of [
      [KEY_NEW_USER_DAYS, settings.newUserDays],
      [KEY_DORMANT_DAYS, settings.dormantDays],
    ] as const) {
      sqlite
        .query(
          "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        )
        .run(key, String(value));
    }
  })();
}

/** 规则是否启用（任一为 0 则该分支不参与筛选） */
export function isRetentionEnabled(settings: RetentionSettings = getRetentionSettings()): boolean {
  return settings.newUserDays > 0 || settings.dormantDays > 0;
}

type CandidateRow = {
  wxId: string;
  level: number;
  reason: IdleReason;
  createdAt: string;
  lastRegAt: string | null;
  totalReg: number;
  messageCount: number;
};

/**
 * 查询命中清理条件的用户。
 *
 * SQL 里 `? > 0` 用于在规则关闭时短路对应分支（避免传进来的截止时间是 0 天后的未来值）。
 * level = 0 与 ADMIN 账号不在 SQL 中排除（ADMIN 来自 env，无法参与 SQL），统一在 JS 侧判定豁免。
 */
function queryCandidates(settings: RetentionSettings): CandidateRow[] {
  if (!isRetentionEnabled(settings)) return [];
  return sqlite
    .query(
      `SELECT u.wx_id AS wxId, u.level, u.created_at AS createdAt, u.message_count AS messageCount,
              COALESCE(rs.total, 0) AS totalReg, rs.last_date AS lastRegAt,
              CASE WHEN COALESCE(rs.total, 0) = 0 THEN 'never' ELSE 'dormant' END AS reason
       FROM users u
       LEFT JOIN (
         SELECT wx_id, SUM(count) AS total, MAX(date) AS last_date
         FROM registration_stats GROUP BY wx_id
       ) rs ON rs.wx_id = u.wx_id
       WHERE ( ?1 > 0 AND COALESCE(rs.total, 0) = 0 AND u.created_at < ?2 )
          OR ( ?3 > 0 AND COALESCE(rs.total, 0) > 0 AND rs.last_date < ?4 )
       ORDER BY u.created_at ASC, u.wx_id ASC`,
    )
    .all(
      settings.newUserDays,
      settings.newUserDays > 0 ? utcDaysAgo(settings.newUserDays) : "",
      settings.dormantDays,
      settings.dormantDays > 0 ? utcDateDaysAgo(settings.dormantDays) : "",
    ) as CandidateRow[];
}

/** 受豁免：ADMIN 列表内的账号，或被管理员停用（level = 0）的账号 */
export function isProtected(wxId: string, level: number): boolean {
  return level <= 0 || isAdmin(wxId);
}

/**
 * 预演：统计将被删除的用户，返回样例供管理后台展示。
 * 纯查询，不改动任何数据。
 *
 * `total` / `purgeable` / `never` / `dormant` / `protectedCount` / `truncated`
 * 始终统计**全量**候选；`samples` 只返回 `[offset, offset + sampleLimit)` 这一页
 * 的可删除用户（受豁免的不进样例，也不占 offset 位）。
 */
export function previewIdleUsers(
  settings: RetentionSettings = getRetentionSettings(),
  sampleLimit = 20,
  offset = 0,
): RetentionPreview {
  const candidates = queryCandidates(settings);
  const samples: IdleUser[] = [];
  let protectedCount = 0;
  let never = 0;
  let dormant = 0;
  let idx = 0; // 可删除用户序号（受豁免者跳过，不占位）

  for (const c of candidates) {
    if (isProtected(c.wxId, c.level)) {
      protectedCount++;
      continue;
    }
    if (c.reason === "never") never++;
    else dormant++;
    if (idx >= offset && samples.length < sampleLimit) {
      samples.push({
        wxId: c.wxId,
        reason: c.reason,
        createdAt: c.createdAt,
        lastRegAt: c.lastRegAt,
        totalReg: c.totalReg,
        messageCount: c.messageCount,
      });
    }
    idx++;
  }

  return {
    settings,
    total: candidates.length,
    purgeable: never + dormant,
    protectedCount,
    never,
    dormant,
    truncated: never + dormant > PURGE_BATCH_LIMIT,
    samples,
  };
}

export type PurgeResult = {
  deleted: number;
  never: number;
  dormant: number;
  /** 命中但受豁免、未删除的数量 */
  skipped: number;
  /** 达到 PURGE_BATCH_LIMIT 被截断：剩余候选留待下次执行 */
  truncated: boolean;
};

/**
 * 执行清理。整个批次在一个事务内完成：reads → messages → sessions → users，
 * 三张统计表由外键 CASCADE 自动跟随（排行榜记录随之清空）。
 *
 * 返回实际删除数量；规则未启用时直接返回全 0。
 */
export function purgeIdleUsers(settings: RetentionSettings = getRetentionSettings()): PurgeResult {
  const empty: PurgeResult = { deleted: 0, never: 0, dormant: 0, skipped: 0, truncated: false };
  if (!isRetentionEnabled(settings)) return empty;

  const candidates = queryCandidates(settings);
  const targets = candidates.filter((c) => !isProtected(c.wxId, c.level));
  const truncated = targets.length > PURGE_BATCH_LIMIT;
  const batch = truncated ? targets.slice(0, PURGE_BATCH_LIMIT) : targets;

  const delReads = sqlite.prepare("DELETE FROM reads WHERE id IN (SELECT id FROM messages WHERE wx_id = ?)");
  const delMessages = sqlite.prepare("DELETE FROM messages WHERE wx_id = ?");
  const delSessions = sqlite.prepare("DELETE FROM sessions WHERE wx_id = ?");
  const delRegStats = sqlite.prepare("DELETE FROM registration_stats WHERE wx_id = ?");
  const delReadStats = sqlite.prepare("DELETE FROM read_stats WHERE wx_id = ?");
  const delMsgStats = sqlite.prepare("DELETE FROM message_read_stats WHERE wx_id = ?");
  const delIpBlockAccount = sqlite.prepare("DELETE FROM ip_block_account WHERE wx_id = ?");
  const delUser = sqlite.prepare("DELETE FROM users WHERE wx_id = ?");

  let never = 0;
  let dormant = 0;
  sqlite.transaction(() => {
    for (const t of batch) {
      delReads.run(t.wxId);
      delMessages.run(t.wxId);
      delSessions.run(t.wxId);
      // 显式清理排行榜三表与账户级 IP 黑名单：不依赖外键级联（级联仅在开启 foreign_keys 的连接上生效）
      delRegStats.run(t.wxId);
      delReadStats.run(t.wxId);
      delMsgStats.run(t.wxId);
      delIpBlockAccount.run(t.wxId);
      delUser.run(t.wxId);
      if (t.reason === "never") never++;
      else dormant++;
    }
  })();

  return {
    deleted: batch.length,
    never,
    dormant,
    skipped: candidates.length - targets.length,
    truncated,
  };
}
