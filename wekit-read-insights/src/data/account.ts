// ============================================================
// 数据层 · 账户与隐私（FLOW 6）
// ------------------------------------------------------------
// 对应 /account/*、/auth/password 与 DELETE /messages。
//
// 与 FLOW 4 的运营端点分开写，不是因为端点多，而是因为它们的鉴权语义不同：
// 这里每一条都是「仅本人」，服务器一律从会话里取 wx_id，不接受任何身份参数
// （/account/audit 甚至刻意忽略传进来的 wxId，免得变成探测别人的口子）。
// 所以这一层没有"把谁的 id 传进去"这类判断，参数只剩分页与 IP 本身。
// ============================================================

import { api } from './api'
import type { AuditDto } from './admin'

export type { AuditDto }

/** GET /account/stats —— 账户页要、只有服务器算得出的两个量 */
export type AccountStatsDto = {
  /** 本人全部消息当前真正占着的已读行数（与 DELETE /messages 的删除范围同口径） */
  totalReads: number
  /** 服务器看到的本次访问出口 IP */
  viewerIp: string
}

export const ACCOUNT_STATS_URL = '/account/stats'
export const ACCOUNT_BLOCK_URL = '/account/ip-block'

/** 与 /admin/audit 同一个 queryAudit 形状，只是 wxId 由服务器钉成本人 */
export const accountAuditUrl = (pageSize = 10): string => `/account/audit?pageSize=${pageSize}`

/** 重复 IP 服务器回 409 { error: 'exists' }，非法 IP 回 400 —— 都由调用方按 code 分支 */
export const addAccountBlock = (ip: string): Promise<{ ok: true; ip: string }> =>
  api.post(ACCOUNT_BLOCK_URL, { ip })

export const removeAccountBlock = (ip: string): Promise<{ ok: true }> =>
  api.del(`${ACCOUNT_BLOCK_URL}?ip=${encodeURIComponent(ip)}`)

/**
 * 清除我的全部消息。服务器不带计数回执，所以确认框里那句「会删掉 N 条消息与 M 条已读」
 * 只能来自删除前的 GET /account/stats —— 两者之间若有新读进来，实际删的会更多，
 * 这是低频页面上可接受的误差，不值得为它加一个预演端点。
 */
export const clearMyMessages = (): Promise<{ ok: true }> => api.del('/messages')
