// ============================================================
// 数据层 · 运营后台（FLOW 4 / FLOW 5）
// ------------------------------------------------------------
// 对应 /admin/* 的 JSON 端点。这一组接口的鉴权是"整组 + 逐端点"两层：
// app.ts 上挂 /admin/* 限流，每个 handler 里再 adminOr(c)。
// 所以 401/403 在这里是常态（会话过期、viewAs 评审开关把 isAdmin 关掉），
// 页面要能把"没权限"和"请求失败"分开显示，别把前者写成后者。
// ============================================================

import type { AdminUserRow, AuditEntry, Message } from '../flows/shared/types'
import { api } from './api'

export type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number; totalPages: number }

/** GET /admin/users 的行（isAdmin / canRegister 由服务器标注，不是 DB 列） */
export type AdminUserDto = AdminUserRow

export function adminUsersUrl(opts: { q: string; page: number; pageSize: number }): string {
  const p = new URLSearchParams({ page: String(opts.page), pageSize: String(opts.pageSize) })
  if (opts.q) p.set('q', opts.q)
  return `/admin/users?${p.toString()}`
}

export const fetchAdminUsers = (url: string, signal?: AbortSignal) => api.get<Paged<AdminUserDto>>(url, signal)

/** GET /admin/messages?wxId= —— 用户详情里"最新几条消息" */
export type AdminMessageDto = { id: string; wxId: string; content: string; timestamp: string; reads: number }

export const adminMessagesUrl = (wxId: string, pageSize = 5) =>
  `/admin/messages?wxId=${encodeURIComponent(wxId)}&pageSize=${pageSize}`

/** 服务端没有 isPublic / 首读 / 屏蔽数这些列，详情列表只画它给得起的字段 */
export function toAdminMessage(row: AdminMessageDto): Message {
  return {
    id: row.id,
    content: row.content,
    reads: row.reads,
    timestamp: row.timestamp,
    wxId: row.wxId,
    isPublic: false,
    distinctIps: row.reads,
    firstReadSeconds: null,
    dailyReads: [],
    blockedCount: 0,
  }
}

/** GET /admin/audit?wxId= —— 某个账号的留痕 */
export const adminAuditUrl = (wxId: string, pageSize = 10) =>
  `/admin/audit?wxId=${encodeURIComponent(wxId)}&pageSize=${pageSize}`

/** GET /admin/audit 的行：服务器不给 id，可空列在这里按"空串"落进视图模型 */
export type AuditRowDto = {
  wxId: string | null
  action: string
  detail: string | null
  ip: string | null
  timestamp: string
}
export type AuditDto = Paged<AuditRowDto>

/** 语气色由动作名推出来 —— 服务器只存事实，不存"该显示成什么颜色" */
function toneOf(action: string): AuditEntry['tone'] {
  if (/fail|denied|invalid|limited|exceeded/.test(action)) return 'error'
  if (/delete|remove|block|purge|reset|clean|wipe/.test(action)) return 'warning'
  if (/create|add|set_level|register|logout|password_change|ok/.test(action)) return 'success'
  return 'neutral'
}

export function toAuditEntries(dto: AuditDto): AuditEntry[] {
  return dto.rows.map((r, i) => ({
    // 只当列表键用，不是 audit_logs 的主键（服务器没给，也不该编一个看起来像主键的数）
    id: i + 1,
    wxId: r.wxId ?? '',
    action: r.action,
    detail: r.detail ?? '',
    ip: r.ip ?? '',
    timestamp: r.timestamp,
    tone: toneOf(r.action),
  }))
}

// ————————————————— 写操作 —————————————————

export const adminSetLevel = (wxId: string, level: number) => api.post('/admin/level', { wxId, level })

export const adminCreateUser = (body: { wxId: string; password: string; level: number }) =>
  api.post('/admin/users', body)

export const adminDeleteUser = (wxId: string) => api.del(`/admin/users/${encodeURIComponent(wxId)}`)

/** 重置密码：服务器会顺带删掉该用户全部会话，对方会被踢下线 —— 界面必须提前说清 */
export const adminResetPassword = (wxId: string, password: string) =>
  api.post('/admin/password', { wxId, password })

// ————————————————— FLOW 5：权益公式与保留策略 —————————————————

/** GET /admin/levels 的一个维度：公式 + 求值结果 + 生效来源 */
export type LevelDimDto = { formula: string; source: string; values: number[] }
export type LevelsDto = Record<'message' | 'geo' | 'retentionMonths', LevelDimDto>

export const fetchLevels = (signal?: AbortSignal) => api.get<LevelsDto>('/admin/levels', signal)

/** GET /admin/levels/preview —— 草稿公式的 1–20 级试算结果，不落库 */
export const previewFormula = (formula: string) =>
  api.get<{ valid: boolean; error?: string; values?: number[] }>(
    `/admin/levels/preview?formula=${encodeURIComponent(formula)}`,
  )

/** 保存公式：服务器只写配置，需要重启进程才生效（响应里的 restart 就是这个意思） */
export const saveLevels = (body: Partial<LevelsDto>) => api.post<{ ok: true; restart: boolean }>('/admin/levels', body)

/** GET /admin/retention —— 天数是配置本身，maxDays 是服务器允许的上界（输入框要按它卡） */
export type RetentionDto = { newUserDays: number; dormantDays: number; maxDays: number }

export const fetchRetention = (signal?: AbortSignal) => api.get<RetentionDto>('/admin/retention', signal)
export const saveRetention = (body: { newUserDays: number; dormantDays: number }) =>
  api.post<{ ok: true } & RetentionDto>('/admin/retention', body)

/** GET /admin/retention/preview 的样例行 = retention.ts 的 IdleUser */
export type PurgeSampleDto = {
  wxId: string
  reason: 'never' | 'dormant'
  createdAt: string
  lastRegAt: string | null
  totalReg: number
  messageCount: number
}

export type RetentionPreviewDto = {
  settings: { newUserDays: number; dormantDays: number }
  total: number
  purgeable: number
  protectedCount: number
  never: number
  dormant: number
  truncated: boolean
  samples: PurgeSampleDto[]
  page: number
  pageSize: number
  totalPages: number
}

export const previewRetention = (page = 1, pageSize = 20, signal?: AbortSignal) =>
  api.get<RetentionPreviewDto>(`/admin/retention/preview?page=${page}&pageSize=${pageSize}`, signal)

/** POST /admin/retention/run —— skipped 是"命中但被豁免"，truncated 是"这批没清完，下轮继续" */
export type PurgeResultDto = { ok: true; deleted: number; never: number; dormant: number; skipped: number; truncated: boolean }

export const runRetention = () => api.post<PurgeResultDto>('/admin/retention/run')

/** 孤儿统计行：按表名字典返回，表清单由服务器 stats.ts 的 STAT_TABLES 决定（v8 起是五张） */
export type OrphansDto = { ok: true; orphans: Record<string, number> }

export const fetchOrphans = (signal?: AbortSignal) => api.get<OrphansDto>('/admin/retention/orphans', signal)
export const cleanOrphans = () =>
  api.post<{ ok: true; total: number; counts: Record<string, number> }>('/admin/retention/orphans')

/** 表名 → 人话。未知表名原样显示：服务器加表而前端没跟上的时候，宁可看到生表名也不要少一行 */
const ORPHAN_LABELS: Record<string, string> = {
  registration_stats: '注册消息榜',
  read_stats: '已读次数榜',
  message_read_stats: '已读消息榜',
  hour_stats: '时段分布',
  ua_stats: '客户端分布',
}

export function orphanLabel(table: string, lang: 'zh' | 'en'): string {
  const zh = ORPHAN_LABELS[table]
  if (!zh) return table
  if (lang === 'zh') return zh
  const en: Record<string, string> = {
    registration_stats: 'Registration board',
    read_stats: 'Read-count board',
    message_read_stats: 'Read-message board',
    hour_stats: 'Hour distribution',
    ua_stats: 'Client distribution',
  }
  return en[table] ?? table
}

// ————————————————— 全局 IP 黑名单 —————————————————

/**
 * 全局作用域只有一个端点，且没有分页与搜索参数：服务器一次给回整份名单
 * （它自己有上限），所以筛选和翻页都留在前端。
 *
 * 鉴权与本页其他端点一样是逐 handler 的 adminOr()：会话过期或部署的名单变了
 * 会回 403，而不是 401 —— 页面要把"你没权限"和"请求失败"分开显示。
 */
export const GLOBAL_BLOCK_URL = '/admin/ip-block'

/** 重复 IP 回 409 { error: 'exists' }，非法 IP 回 400 —— 由调用方按 code 分支 */
export const addGlobalBlock = (ip: string): Promise<{ ok: true; ip: string }> =>
  api.post(GLOBAL_BLOCK_URL, { ip })

export const removeGlobalBlock = (ip: string): Promise<{ ok: true }> =>
  api.del(`${GLOBAL_BLOCK_URL}?ip=${encodeURIComponent(ip)}`)
