// ============================================================
// 数据层 · 排行榜（FLOW 7）
// ------------------------------------------------------------
// 对应 GET /leaderboard 与 GET /leaderboard/me。
//
// 两个请求、两套语义，刻意不合并成一个端点：
//   · 榜本身是 LIMIT 10 的裸数组，旧服务端页面（/rank 的内联 JS）直接按数组解析，
//     换形状就是破坏既有契约；
//   · "我的名次"对第 11 名以后的账号是这块界面唯一有意义的信息，
//     没有它，榜页对多数用户只是一场旁观。
// 服务器侧两者共用 stats.ts 的 boardOf()，所以「榜上你在第 3 行」与「名次说你是第 3」
// 不会各算各的 —— 前端这边只负责把数组下标写成 rank。
// ============================================================

import type { LeaderboardMetric, LeaderboardRow, LeaderboardScope } from '../flows/shared/types'
import { api } from './api'

/** 服务器给的行：账号榜只有 wxId/count/me，消息榜多带 id/content/isPublic（内容已脱敏） */
export type BoardRowDto = {
  wxId: string
  count: number
  me: boolean
  id?: string
  content?: string
  isPublic?: boolean
}

export type MyRankDto = {
  /** null = 这个窗口里我没有可排名的计数（与"请求失败"是两件事） */
  rank: number | null
  count: number
  /** 榜上有多少个有计数的实体（账号数 / 消息数） */
  total: number
}

export const leaderboardUrl = (metric: LeaderboardMetric, scope: LeaderboardScope): string =>
  `/leaderboard?metric=${metric}&scope=${scope}`

export const myRankUrl = (metric: LeaderboardMetric, scope: LeaderboardScope): string =>
  `/leaderboard/me?metric=${metric}&scope=${scope}`

export const fetchLeaderboard = (url: string, signal?: AbortSignal) => api.get<BoardRowDto[]>(url, signal)

/** 名次由 ORDER BY 决定，数组就是排好序的前 10 行 */
export function toBoardRows(dto: BoardRowDto[]): LeaderboardRow[] {
  return dto.map((r, i) => ({
    rank: i + 1,
    wxId: r.wxId,
    count: r.count,
    isMe: r.me,
    messageId: r.id,
    messageContent: r.content,
    /** 钻取按钮的可用性判定：owner / 管理员 / is_public=1，前两个前端已知，只有 isPublic 要靠服务器 */
    isMessagePublic: r.isPublic,
  }))
}
