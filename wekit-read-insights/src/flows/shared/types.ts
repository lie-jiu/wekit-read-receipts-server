/**
 * 全站共享视图模型。
 *
 * 字段命名刻意与原 Hono 服务的 API 响应保持一致（camelCase 投影自 SQLite 的 snake_case 列），
 * 便于后续把 mock 换成真实 fetch 时零改名。标 [NEW] 的字段是本次现代化改版新增、
 * 但可由现有表直接聚合得到的派生量。
 */

// ————————————————— 身份与会话 —————————————————

/** 对应 GET /auth/status */
export type AuthStatus = {
  auth_required: boolean
  invite_required: boolean
  /** 被限流后的倒计时上界（= 服务器的限流窗口长度），不要在前端写死秒数 */
  retry_after_seconds: number
}

/** 对应 GET /me */
export type Session = {
  wxId: string
  level: number
  isAdmin: boolean
  /** 是否具备 IP 定位权益 */
  geo: boolean
  geoQuota: number
  geoRemaining: number
  messageQuota: number
  /** 0 = 不限制保留时长 */
  retentionMonths: number
  /** 注册于 —— 来自 users.created_at */
  createdAt: string
  /** 当前已注册消息数：与 messageQuota 一起决定「还能不能注册」 */
  messageCount: number
  /** level 0 只是停注册，历史数据全在 —— 界面别写成「已封禁」 */
  canRegister: boolean
}

export type Screen = 'login' | 'register'

export type AuthError =
  | { kind: 'invalid_credentials' }
  | { kind: 'invite_required' }
  | { kind: 'wxid_taken' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'network' }
  /** 服务器给出了没预期到的响应：原样摊开，不要伪装成"密码错误"误导用户 */
  | { kind: 'unknown'; status: number; code: string }

// ————————————————— 消息与已读 —————————————————

/** 对应 GET /messages 的行 */
export type Message = {
  /** 64 位小写 hex：SHA-256(wxId \0 content \0 createTime) */
  id: string
  content: string
  reads: number
  /** UTC "YYYY-MM-DD HH:MM:SS" */
  timestamp: string
  wxId: string
  isPublic: boolean
  /** [NEW] 独立 IP 数：COUNT(DISTINCT ip) */
  distinctIps: number
  /** [NEW] 首次被读耗时（秒），无已读时为 null */
  firstReadSeconds: number | null
  /** [NEW] 日度已读序列，用于表格内 mini sparkline */
  dailyReads: number[]
  /** [NEW] 被黑名单过滤掉的条数 */
  blockedCount: number
}

/** 对应 GET /reads/:id/data 的 reads[] */
export type ReadRecord = {
  ip: string
  timestamp: string
  userAgent: string
  country: string
  region: string
  city: string
  isp: string
  countryEn: string
  regionEn: string
  cityEn: string
  ispEn: string
  /** 是否已做过 IP 定位；false 时地区字段为空串 */
  located: boolean
  /** [NEW] 从消息发出到该次已读的间隔（秒） */
  delaySeconds: number
}

/** 对应 GET /reads/:id/data 的整体响应 */
export type ReadDetailsPayload = {
  id: string
  content: string
  total: number
  blockedCount: number
  visibleTotal: number
  page: number
  pageSize: number
  reads: ReadRecord[]
}

export type IpBlockEntry = {
  ip: string
  createdAt: string
}

/** 三级作用域：全局（管理员）/ 单条消息 / 账户 */
export type IpBlockScope = 'global' | 'message' | 'account'

export type IpBlockList = {
  count: number
  ips: IpBlockEntry[]
}

/** 单条 IP 定位请求的结果 */
export type GeoLookupResult = {
  ip: string
  country: string
  region: string
  city: string
  isp: string
  countryEn: string
  regionEn: string
  cityEn: string
  ispEn: string
  /** 命用的降级源，用于向用户解释为什么地区数据只有英文 */
  source: 'ip-api' | 'ipwho.is' | 'ipinfo.io' | 'ip.sb' | 'freeipapi' | 'none'
  remaining: number
  quota: number
}

// ————————————————— 聚合与趋势 [NEW] —————————————————

export type TimeRange = {
  /** 预设 key，或 'custom' */
  preset: 'today' | '7d' | '30d' | '90d' | 'custom'
  from: string
  to: string
  label: string
}

/** 聚合自 read_stats / registration_stats / users 的日度序列 */
export type TrendPoint = {
  date: string
  reads: number
  registrations: number
  activeUsers: number
  /** [NEW] 与上一同期对比的小数，如 0.18 = +18% */
  readsDelta: number
}

/** 聚合自 reads 表的 GROUP BY */
export type RegionSlice = {
  country: string
  region: string
  city: string
  count: number
  /** 占全部已读的比值 */
  share: number
}

export type IspSlice = {
  isp: string
  count: number
  share: number
}

export type UaSlice = {
  kind: 'wechat' | 'ios' | 'android' | 'desktop' | 'other'
  label: string
  count: number
  share: number
}

/** 24 小时到达分布，用于「几点被读」 */
export type HourSlice = {
  hour: number
  count: number
}

export type OverviewStats = {
  range: TimeRange
  totalReads: number
  totalReadsPrev: number
  messageCount: number
  messageCountPrev: number
  distinctIps: number
  /** 平均首次被读耗时（秒） */
  avgFirstReadSeconds: number
  /** 读取率：已读总数 / 全部消息的容量上限 */
  readRate: number
  readRatePrev: number
  trend: TrendPoint[]
  regions: RegionSlice[]
  isps: IspSlice[]
  userAgents: UaSlice[]
  hours: HourSlice[]
}

// ————————————————— 排行榜 —————————————————

export type LeaderboardMetric = 'reg' | 'read' | 'msg'
export type LeaderboardScope = 'day' | 'total'

/** 对应 GET /leaderboard */
export type LeaderboardRow = {
  rank: number
  /** 脱敏后的 wxId，形如 "abcdef…xy" */
  wxId: string
  count: number
  isMe: boolean
  /** 仅 msg 榜有值 */
  messageId?: string
  messageContent?: string
  ownerWxId?: string
  /**
   * [NEW] 仅 msg 榜有值：该消息是否 is_public。
   * 后端 LIMIT 10 里没有这一列，但 /reads/:id 的鉴权规则是
   * 「owner / 管理员 / is_public=1」，消息榜的钻取入口必须按它来，
   * 否则点了别人私有的消息只会拿到 403。
   */
  isMessagePublic?: boolean
}

// ————————————————— 管理后台 —————————————————

/** 对应 GET /admin/users 的行 */
export type AdminUserRow = {
  wxId: string
  level: number
  createdAt: string
  messageCount: number
  lastMsgAt: string | null
  totalRegMsgs: number
  /** 是否出现在 env ADMIN 逗号列表里（非 DB 字段） */
  isAdmin: boolean
  /** level === 0：仅禁止注册新消息，历史数据保留 */
  canRegister: boolean
}

export type PagedResult<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type EntitlementDim = 'message' | 'geo' | 'retentionMonths'

/** 对应 GET /admin/levels */
export type EntitlementDimState = {
  dim: EntitlementDim
  formula: string
  source: 'formula' | 'default' | 'env'
  /** values[i] = 等级 i+1 对应的额度 */
  values: number[]
}

/** 对应 GET /admin/levels/preview */
export type FormulaPreview = {
  formula: string
  valid: boolean
  values?: number[]
  error?: string
}

/** 对应 GET/POST /admin/retention */
export type RetentionPolicy = {
  /** 注册后从未注册过消息的天数阈值，0 = 不清理 */
  newUserDays: number
  /** 沉寂天数阈值，0 = 不清理 */
  dormantDays: number
}

export type PurgeReason = 'never' | 'dormant'

/** 对应 GET /admin/retention/preview 的 samples[] */
export type PurgeSample = {
  wxId: string
  reason: PurgeReason
  createdAt: string
  lastRegAt: string | null
  totalReg: number
  messageCount: number
}

export type RetentionPreview = {
  total: number
  purgeable: number
  protectedCount: number
  never: number
  dormant: number
  truncated: boolean
  samples: PurgeSample[]
  pageSize: number
  page: number
}

/** 对应 GET/POST /admin/retention/orphans */
export type OrphanTableCount = {
  /** 表清单在服务器 stats.ts 的 STAT_TABLES 里维护（v8 起五张），所以这里不收窄成字面量联合 */
  table: string
  label: string
  orphanRows: number
}

/** audit_logs 表：原先只写库无 UI，本次补上时间线视图 */
export type AuditEntry = {
  id: number
  wxId: string
  action: string
  detail: string
  ip: string
  timestamp: string
  tone: 'neutral' | 'success' | 'warning' | 'error'
}

// ————————————————— 流程内瞬时状态 —————————————————

export type AsyncState = 'idle' | 'submitting' | 'error'

export type ScreenCtx = {
  session: Session
  isDark: boolean
  lang: 'zh' | 'en'
}
