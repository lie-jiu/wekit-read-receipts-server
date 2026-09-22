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

/**
 * 全站留痕页的查询串。两个过滤条件都可空，空即"不过滤"；
 * 分页与筛选都交给服务器，因为这张表是全站的，取一页回前端筛会得到"本页没有"的假结论。
 */
export function auditListUrl(opts: { wxId: string; action: string; page: number; pageSize: number }): string {
  const p = new URLSearchParams({ page: String(opts.page), pageSize: String(opts.pageSize) })
  const wxId = opts.wxId.trim()
  if (wxId) p.set('wxId', wxId)
  if (opts.action) p.set('action', opts.action)
  return `/admin/audit?${p.toString()}`
}

/**
 * 动作名的中文对照。这是服务器 audit() 调用点的字面量清单，
 * 所以刻意不窄化成字面量联合类型：服务器加了新动作而这里没跟上时，
 * auditActionLabel 会原样显示动作名，宁可看到生的名字也不要整行空白。
 */
const AUDIT_ACTION_LABELS: Record<string, { zh: string; en: string }> = {
  // ——— 账号与会话 ———
  login: { zh: '登录', en: 'Signed in' },
  login_failed: { zh: '登录失败', en: 'Sign-in failed' },
  logout: { zh: '退出登录', en: 'Signed out' },
  register: { zh: '注册账号', en: 'Account registered' },
  register_wxid_limited: { zh: '注册被拒（ID 已达上限）', en: 'Registration refused (ID cap)' },
  password_change: { zh: '修改自己的密码', en: 'Password changed' },
  // ——— 消息与可见性 ———
  delete_message: { zh: '删除自己的消息', en: 'Own message deleted' },
  delete_all_messages: { zh: '清空自己的消息', en: 'Own messages cleared' },
  message_set_public: { zh: '修改消息公开状态', en: 'Message publicity changed' },
  // ——— 黑名单（三级作用域） ———
  message_block_add: { zh: '拉黑 IP（本条消息）', en: 'IP blocked (this message)' },
  message_block_remove: { zh: '解除拉黑（本条消息）', en: 'IP unblocked (this message)' },
  account_block_add: { zh: '拉黑 IP（我的全部消息）', en: 'IP blocked (my messages)' },
  account_block_remove: { zh: '解除拉黑（我的全部消息）', en: 'IP unblocked (my messages)' },
  global_block_add: { zh: '拉黑 IP（全站）', en: 'IP blocked (site-wide)' },
  global_block_remove: { zh: '解除拉黑（全站）', en: 'IP unblocked (site-wide)' },
  // ——— 后台操作 ———
  admin_create_user: { zh: '创建账号', en: 'Account created' },
  admin_set_level: { zh: '调整账号等级', en: 'Level changed' },
  admin_set_password: { zh: '重置他人密码', en: 'Password reset by admin' },
  admin_delete_user: { zh: '删除账号', en: 'Account deleted' },
  admin_wipe_user: { zh: '清空某账号的全部消息', en: 'One account’s messages cleared' },
  admin_delete_all_messages: { zh: '清空全站消息', en: 'All site messages cleared' },
  admin_delete_message: { zh: '删除指定消息', en: 'Message deleted by admin' },
  admin_set_level_formula: { zh: '修改权益公式', en: 'Entitlement formula changed' },
  admin_set_retention: { zh: '修改自动清理策略', en: 'Retention policy changed' },
  admin_run_retention: { zh: '立即执行一次清理', en: 'Retention run' },
  admin_cleanup_orphans: { zh: '清理孤儿统计行', en: 'Orphan board rows cleaned' },
}

/** 下拉里的分组顺序：先日常登录与消息，再黑名单，最后是不可逆的后台操作 */
export const AUDIT_ACTION_GROUPS: Array<{ group: { zh: string; en: string }; actions: string[] }> = [
  {
    group: { zh: '账号与会话', en: 'Account & session' },
    actions: ['login', 'login_failed', 'logout', 'register', 'register_wxid_limited', 'password_change'],
  },
  {
    group: { zh: '消息', en: 'Messages' },
    actions: ['delete_message', 'delete_all_messages', 'message_set_public'],
  },
  {
    group: { zh: 'IP 黑名单', en: 'IP blocklists' },
    actions: [
      'message_block_add',
      'message_block_remove',
      'account_block_add',
      'account_block_remove',
      'global_block_add',
      'global_block_remove',
    ],
  },
  {
    group: { zh: '后台操作', en: 'Admin actions' },
    actions: [
      'admin_create_user',
      'admin_set_level',
      'admin_set_password',
      'admin_delete_user',
      'admin_wipe_user',
      'admin_delete_message',
      'admin_delete_all_messages',
      'admin_set_level_formula',
      'admin_set_retention',
      'admin_run_retention',
      'admin_cleanup_orphans',
    ],
  },
]

export function auditActionLabel(action: string, lang: 'zh' | 'en'): string {
  const e = AUDIT_ACTION_LABELS[action]
  return e ? (lang === 'zh' ? e.zh : e.en) : action
}

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
  if (/delete|remove|block|purge|reset|clean|wipe|run_retention/.test(action)) return 'warning'
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
