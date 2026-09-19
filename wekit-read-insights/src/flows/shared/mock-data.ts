import type {
  AdminUserRow,
  AuditEntry,
  EntitlementDimState,
  GeoLookupResult,
  HourSlice,
  IpBlockList,
  LeaderboardMetric,
  LeaderboardRow,
  LeaderboardScope,
  Message,
  OrphanTableCount,
  OverviewStats,
  ReadDetailsPayload,
  ReadRecord,
  RetentionPolicy,
  RetentionPreview,
  Session,
  TrendPoint,
} from './types'

/** 固定种子伪随机：保证每次刷新画面一致，便于走查 */
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const rng = makeRng(20260918)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
const between = (min: number, max: number) => Math.floor(min + rng() * (max - min))

const TODAY = '2026-09-18'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** 相对 TODAY 往前 n 天，返回 "YYYY-MM-DD HH:MM:SS"（UTC 口径，与库内一致） */
function daysAgo(n: number, hour = 9, minute = 0): string {
  const base = new Date(`${TODAY}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() - n)
  const d = base.toISOString().slice(0, 10)
  return `${d} ${pad(hour)}:${pad(minute)}:00`
}

function dateOnly(n: number): string {
  return daysAgo(n).slice(0, 10)
}

// ————————————————— 会话 —————————————————

export const mockSession: Session = {
  wxId: 'wxid_liejiu_2026',
  level: 12,
  isAdmin: true,
  geo: true,
  geoQuota: 60,
  geoRemaining: 37,
  messageQuota: 400,
  retentionMonths: 18,
  createdAt: '2026-03-02 11:24:07',
  messageCount: 137,
  canRegister: true,
}

// ————————————————— 消息列表 —————————————————

const CONTENTS = [
  '今晚 8 点线上会议，看到请回我一下，别已读不回',
  '这份合同我改了三版，麻烦今天确认，明天要盖章',
  '到楼下便利店了，需要带什么吗',
  '项目周报已发邮箱，重点看第 3 节的风险项',
  '这周六同学聚会，老地方，能来的扣 1',
  '体检报告出来了，有几个指标要复查，别担心',
  '报销单退回来了，发票号写错一位，重传一下',
  '刚看到你朋友圈，那张照片是在哪拍的，太好看了',
  '服务器今晚要停机升级，凌晨 2 点到 4 点，提前存好手头的活',
  '妈，我周末回家，想吃你做的酸菜鱼',
  '报价单发你了，这次的账期按上次的走',
  '孩子的家长会老师点名要你参加，周三下午两点',
  '这个需求我评估了下，两周做不完，要么砍范围要么延期',
  '行李已经收拾好了，六点四十的车，记得定闹钟',
  '生日快乐！新的一岁顺顺利利',
  '客户临时改主意，方案 A 作废，我们重开一次',
]

const HEX = '0123456789abcdef'

function fakeId(): string {
  let s = ''
  for (let i = 0; i < 64; i += 1) s += HEX[Math.floor(rng() * 16)]
  return s
}

/** 把 total 拆成 n 个非负整数，和恰好等于 total —— 保证「日度摊派」不会凭空多出读数 */
function distribute(total: number, n: number): number[] {
  if (total <= 0) return Array.from({ length: n }, () => 0)
  const out = Array.from({ length: n }, () => 0)
  for (let i = 0; i < total; i += 1) out[Math.floor(rng() * n)] += 1
  return out
}

/**
 * 单一事实源：趋势、KPI、覆盖率全部由 mockMessages 摊派算出。
 * 之前 trend 与 messages 各造各的数，量出来「30 天 950 次已读」但表格里的
 * 消息 reads 只有几十，Flow 3 / Flow 7 会一起继承这个矛盾。
 */
export const mockMessages: Message[] = CONTENTS.map((content, i) => {
  // 每第 4 条刻意 0 已读，让「读取覆盖率」不是恒等于 100%
  const reads = i % 4 === 3 ? 0 : between(1, 46)
  // 近 28 天放 12 条保证默认视图有内容且能翻页，其余散布到 90 天
  const dayOffset = i < 12 ? between(0, 28) : between(31, 88)
  return {
    id: fakeId(),
    content,
    reads,
    timestamp: daysAgo(dayOffset, between(8, 22), between(0, 59)),
    wxId: mockSession.wxId,
    isPublic: i === 2,
    distinctIps: reads === 0 ? 0 : Math.max(1, Math.round(reads * 0.72)),
    firstReadSeconds: reads === 0 ? null : between(11, 9400),
    dailyReads: distribute(reads, 14),
    blockedCount: i === 1 ? 3 : i === 5 ? 1 : 0,
  }
})

// ————————————————— 已读明细 —————————————————

const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.50',
  'Mozilla/5.0 (Linux; Android 14; V2301A) AppleWebKit/537.36 MicroMessenger/8.0.49',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessengerClient/3.9.11',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/17.6',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36',
]

const CITIES = [
  ['中国', '浙江省', '杭州市', '中国电信', 'China', 'Zhejiang', 'Hangzhou', 'China Telecom'],
  ['中国', '广东省', '深圳市', '中国联通', 'China', 'Guangdong', 'Shenzhen', 'China Unicom'],
  ['中国', '北京市', '北京市', '中国移动', 'China', 'Beijing', 'Beijing', 'China Mobile'],
  ['中国', '上海市', '上海市', '中国电信', 'China', 'Shanghai', 'Shanghai', 'China Telecom'],
  ['中国', '四川省', '成都市', '中国联通', 'China', 'Sichuan', 'Chengdu', 'China Unicom'],
  ['新加坡', '中-region', '新加坡', 'Singtel', 'Singapore', 'Central', 'Singapore', 'Singtel'],
  ['美国', 'California', 'San Jose', 'Cogent', 'United States', 'California', 'San Jose', 'Cogent'],
  ['中国', '江苏省', '南京市', '中国电信', 'China', 'Jiangsu', 'Nanjing', 'China Telecom'],
  ['日本', 'Tokyo', 'Tokyo', 'NTT', 'Japan', 'Tokyo', 'Tokyo', 'NTT'],
  ['中国', '湖北省', '武汉市', '中国移动', 'China', 'Hubei', 'Wuhan', 'China Mobile'],
] as const

function fakeIp(): string {
  return `${between(36, 223)}.${between(0, 255)}.${between(0, 255)}.${between(1, 254)}`
}

function buildReads(count: number, msgDayOffset: number): ReadRecord[] {
  const out: ReadRecord[] = []
  for (let i = 0; i < count; i += 1) {
    const c = CITIES[i % CITIES.length]
    const located = i % 7 !== 0
    const delay = between(8, 54000)
    out.push({
      ip: fakeIp(),
      timestamp: daysAgo(Math.max(0, msgDayOffset - Math.floor(i / 9)), between(7, 23), between(0, 59)),
      userAgent: pick(UAS),
      country: located ? c[0] : '',
      region: located ? c[1] : '',
      city: located ? c[2] : '',
      isp: located ? c[3] : '',
      countryEn: located ? c[4] : '',
      regionEn: located ? c[5] : '',
      cityEn: located ? c[6] : '',
      ispEn: located ? c[7] : '',
      located,
      delaySeconds: delay,
    })
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
}

/** 按消息 id 缓存明细，保证切换消息时数据稳定 */
const detailsCache = new Map<string, ReadDetailsPayload>()

export function mockReadDetailsFor(msg: Message): ReadDetailsPayload {
  const hit = detailsCache.get(msg.id)
  if (hit) return hit
  const offset = Math.max(0, Math.round((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(msg.timestamp.replace(' ', 'T') + 'Z')) / 86400000))
  const payload: ReadDetailsPayload = {
    id: msg.id,
    content: msg.content,
    total: msg.reads + msg.blockedCount,
    blockedCount: msg.blockedCount,
    visibleTotal: msg.reads,
    page: 1,
    pageSize: 50,
    // 明细一页上限 50，消息 reads 最大 46，故全量返回，total / visibleTotal 才自洽
    reads: buildReads(msg.reads, offset),
  }
  detailsCache.set(msg.id, payload)
  return payload
}

/** 默认取已读最多的那条，Flow 3 首屏才有足够明细可看 */
export const mockReadDetails: ReadDetailsPayload = mockReadDetailsFor(
  [...mockMessages].sort((a, b) => b.reads - a.reads)[0] ?? mockMessages[0],
)

// ————————————————— 总览聚合 [NEW] —————————————————

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 把每条消息的 dailyReads 摊派到「发送日 + 滞后 n 天」，得到与表格完全对得上的日度序列 */
const readsByDate = new Map<string, number>()
const regsByDate = new Map<string, number>()
for (const m of mockMessages) {
  const sentDay = m.timestamp.slice(0, 10)
  regsByDate.set(sentDay, (regsByDate.get(sentDay) ?? 0) + 1)
  m.dailyReads.forEach((n, lag) => {
    if (!n) return
    const day = addDays(sentDay, lag)
    readsByDate.set(day, (readsByDate.get(day) ?? 0) + n)
  })
}

function buildTrend(days: number): TrendPoint[] {
  const pts: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = dateOnly(i)
    const reads = readsByDate.get(date) ?? 0
    const weekPrior = readsByDate.get(dateOnly(i + 7)) ?? 0
    pts.push({
      date,
      reads,
      registrations: regsByDate.get(date) ?? 0,
      // 独立 IP 与 reads 同量级缩放下，保证表格里 distinctIps 之和不会超过全站计数
      activeUsers: Math.round(reads * 0.72),
      readsDelta: weekPrior === 0 ? 0 : Math.round(((reads - weekPrior) / weekPrior) * 100) / 100,
    })
  }
  return pts
}

/** 昼夜节线权重：微信场景下晚间 20–22 点是峰值，凌晨近乎为 0 */
const HOUR_WEIGHTS = [
  0.4, 0.2, 0.1, 0.1, 0.1, 0.3, 0.9, 1.6, 2.2, 2.6, 2.4, 2.0, 1.7, 1.8, 2.0, 2.2, 2.4, 2.8, 3.4, 3.8, 3.4, 2.7,
  1.6, 0.8,
]

function buildHours(total: number): HourSlice[] {
  const sum = HOUR_WEIGHTS.reduce((a, b) => a + b, 0)
  return HOUR_WEIGHTS.map((w, hour) => ({ hour, count: Math.round((w / sum) * total) }))
}

/** 地区 / 运营商 / 客户端分布按占比缩放到给定总量，任何窗口下都能与 KPI 对齐 */
function scaled<T extends { share: number }>(rows: readonly T[], total: number): Array<T & { count: number }> {
  return rows.map((r) => ({ ...r, count: Math.round(r.share * total) }))
}

const TREND_90 = buildTrend(90)
const LAST_30 = TREND_90.slice(-30)
const PREV_30 = TREND_90.slice(-60, -30)
const sumReads = (rows: TrendPoint[]) => rows.reduce((a, r) => a + r.reads, 0)

const WINDOW_FROM = LAST_30[0]?.date ?? ''
const PREV_FROM = PREV_30[0]?.date ?? ''
const inWindow = mockMessages.filter((m) => m.timestamp.slice(0, 10) >= WINDOW_FROM)
const inPrevWindow = mockMessages.filter((m) => {
  const d = m.timestamp.slice(0, 10)
  return d >= PREV_FROM && d < WINDOW_FROM
})
const windowReads = sumReads(LAST_30)
const prevWindowReads = sumReads(PREV_30)
const windowFirstReads = inWindow.map((m) => m.firstReadSeconds).filter((v): v is number => v !== null)

/** 占比骨架，count 一律由 scaled() 按当前窗口总量算出，避免硬编码数字与 KPI 脱节 */
const REGION_SHARES = [
  { country: '中国', region: '浙江省', city: '杭州市', share: 0.32 },
  { country: '中国', region: '广东省', city: '深圳市', share: 0.2 },
  { country: '中国', region: '北京市', city: '北京市', share: 0.15 },
  { country: '中国', region: '上海市', city: '上海市', share: 0.12 },
  { country: '中国', region: '四川省', city: '成都市', share: 0.07 },
  { country: '新加坡', region: '中-region', city: '新加坡', share: 0.05 },
  { country: '美国', region: 'California', city: 'San Jose', share: 0.04 },
  { country: '日本', region: 'Tokyo', city: 'Tokyo', share: 0.03 },
]
const ISP_SHARES = [
  { isp: '中国电信', share: 0.48 },
  { isp: '中国移动', share: 0.27 },
  { isp: '中国联通', share: 0.14 },
  { isp: 'Singtel', share: 0.05 },
  { isp: '其他', share: 0.06 },
]
const UA_SHARES = [
  { kind: 'wechat', label: '微信内置', share: 0.64 },
  { kind: 'ios', label: 'iOS Safari', share: 0.17 },
  { kind: 'android', label: 'Android 浏览器', share: 0.09 },
  { kind: 'desktop', label: '桌面端', share: 0.07 },
  { kind: 'other', label: '其他', share: 0.03 },
] as const

export const mockOverview: OverviewStats = {
  range: { preset: '30d', from: WINDOW_FROM, to: TODAY, label: '近 30 天' },
  totalReads: windowReads,
  totalReadsPrev: prevWindowReads,
  messageCount: inWindow.length,
  messageCountPrev: inPrevWindow.length,
  distinctIps: inWindow.reduce((a, m) => a + m.distinctIps, 0),
  avgFirstReadSeconds:
    windowFirstReads.length === 0 ? 0 : Math.round(windowFirstReads.reduce((a, b) => a + b, 0) / windowFirstReads.length),
  readRate: inWindow.length === 0 ? 0 : inWindow.filter((m) => m.reads > 0).length / inWindow.length,
  readRatePrev:
    inPrevWindow.length === 0 ? 0 : inPrevWindow.filter((m) => m.reads > 0).length / inPrevWindow.length,
  /** 90 天跨度，让「近 90 天」预设也有真实数据可切 */
  trend: TREND_90,
  regions: scaled(REGION_SHARES, windowReads),
  isps: scaled(ISP_SHARES, windowReads),
  userAgents: scaled(UA_SHARES, windowReads),
  hours: buildHours(windowReads),
}

/** 给明细/排行等按各自口径复算分布用 */
export function sharesOf(total: number) {
  return {
    regions: scaled(REGION_SHARES, total),
    isps: scaled(ISP_SHARES, total),
    userAgents: scaled(UA_SHARES, total),
    hours: buildHours(total),
  }
}

// ————————————————— IP 黑名单（三级作用域）—————————————————

export const mockAccountBlock: IpBlockList = {
  count: 3,
  ips: [
    { ip: '203.118.44.7', createdAt: '2026-08-14 10:22:31' },
    { ip: '116.62.19.240', createdAt: '2026-07-30 18:05:12' },
    { ip: '45.77.190.31', createdAt: '2026-06-11 09:41:55' },
  ],
}

export const mockMessageBlock: IpBlockList = {
  count: 3,
  ips: [
    { ip: '198.51.100.23', createdAt: '2026-09-12 21:14:03' },
    { ip: '198.51.100.24', createdAt: '2026-09-12 21:14:40' },
    { ip: '10.0.0.55', createdAt: '2026-09-13 08:02:19' },
  ],
}

export const mockGlobalBlock: IpBlockList = {
  count: 4,
  ips: [
    { ip: '45.148.10.66', createdAt: '2026-09-01 03:12:44' },
    { ip: '185.220.101.7', createdAt: '2026-08-22 15:30:07' },
    { ip: '91.219.29.128', createdAt: '2026-08-05 22:47:13' },
    { ip: '23.129.64.213', createdAt: '2026-07-19 11:09:52' },
  ],
}

/** 点击「屏蔽当前 IP」时会插入这条 */
export const CURRENT_VISITOR_IP = '116.62.19.240'

// ————————————————— 管理后台：用户 —————————————————

const ADMIN_WXIDS = ['wxid_liejiu_2026', 'wxid_ops_backup']

export const mockAdminUsers: AdminUserRow[] = [
  ['wxid_liejiu_2026', 12, '2026-03-02 11:24:07', 41, '2026-09-18 09:12:44', 268],
  ['wxid_zhangsan_88', 8, '2026-03-19 14:02:51', 17, '2026-09-17 22:41:03', 133],
  ['wxid_lisi_design', 6, '2026-04-06 09:31:12', 9, '2026-09-15 13:20:47', 74],
  ['wxid_wangwu_pm', 5, '2026-04-22 17:55:30', 6, '2026-09-11 10:02:19', 51],
  ['wxid_ops_backup', 99, '2026-02-14 08:00:00', 3, '2026-09-18 07:59:12', 12],
  ['wxid_friday_dev', 4, '2026-05-09 20:14:06', 12, '2026-09-08 16:44:58', 88],
  ['wxid_momo_reader', 2, '2026-06-17 12:38:44', 2, '2026-08-30 19:21:35', 14],
  ['wxid_chenxi_77', 1, '2026-07-28 10:09:22', 0, null, 0],
  ['wxid_tianyi_01', 1, '2026-08-11 21:47:03', 1, '2026-08-12 08:15:26', 2],
  ['wxid_lanlan_2g', 0, '2026-08-25 15:33:40', 4, '2026-09-02 11:27:58', 19],
  ['wxid_qingwa_5h', 1, '2026-09-06 19:05:11', 0, null, 0],
  ['wxid_spam_bot_9', 0, '2026-09-14 04:22:09', 0, null, 0],
].map(([wxId, level, createdAt, messageCount, lastMsgAt, totalRegMsgs]) => ({
  wxId: wxId as string,
  level: level as number,
  createdAt: createdAt as string,
  messageCount: messageCount as number,
  lastMsgAt: lastMsgAt as string | null,
  totalRegMsgs: totalRegMsgs as number,
  isAdmin: ADMIN_WXIDS.includes(wxId as string),
  canRegister: (level as number) > 0,
}))

export const ADMIN_WXID_LIST = ADMIN_WXIDS

// ————————————————— 排行榜 —————————————————

/**
 * 榜单不另外编数，全部从 mockAdminUsers + 各用户的消息池聚合出来。
 * 原产品 /leaderboard 就是三张表各自的 GROUP BY：
 *   reg  → SUM(registration_stats.count)
 *   read → SUM(read_stats.count)
 *   msg  → COUNT(DISTINCT reads.ip) GROUP BY message id
 * 自己造一组「榜一 980 / 榜二 920」的数，会和用户管理页的 totalRegMsgs 直接打架。
 */
/**
 * 消息池缓存。不缓存的话每次 msgCells() 都会重新生成一批对象（含新的 fake id），
 * 排行榜与 myRankOf 各调一次就会拿到两套对不上的 messageId。
 */
const poolCache = new Map<string, Message[]>()

function poolFor(u: AdminUserRow): Message[] {
  if (u.wxId === mockSession.wxId) return mockMessages
  const hit = poolCache.get(u.wxId)
  if (hit) return hit
  const pool = mockUserMessages(u.wxId, u.messageCount)
  poolCache.set(u.wxId, pool)
  return pool
}

/** 日榜口径与后端一致：按 UTC 日切，不是本地日 */
function readsToday(pool: Message[]): number {
  return pool.reduce((a, m) => a + (m.dailyReads[m.dailyReads.length - 1] ?? 0), 0)
}

function regsToday(pool: Message[]): number {
  return pool.filter((m) => m.timestamp.startsWith(TODAY)).length
}

type Cell = { wxId: string; count: number }

function cellsOf(metric: LeaderboardMetric, scope: LeaderboardScope): Cell[] {
  return mockAdminUsers
    .map((u) => {
      const pool = poolFor(u)
      const count =
        metric === 'reg'
          ? scope === 'day'
            ? regsToday(pool)
            : u.totalRegMsgs
          : metric === 'read'
            ? scope === 'day'
              ? readsToday(pool)
              : pool.reduce((a, m) => a + m.reads, 0)
            : 0
      return { wxId: u.wxId, count }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || (a.wxId < b.wxId ? -1 : 1))
}

/** 消息榜：跨全部用户的消息池，按独立 IP 数排名（对应 COUNT(DISTINCT r.ip)） */
function msgCells(scope: LeaderboardScope): Message[] {
  const all = mockAdminUsers.flatMap((u) => poolFor(u))
  return all
    .filter((m) => (scope === 'day' ? readsToday([m]) > 0 : m.distinctIps > 0))
    .sort((a, b) => {
      const av = scope === 'day' ? readsToday([a]) : a.distinctIps
      const bv = scope === 'day' ? readsToday([b]) : b.distinctIps
      return bv - av || (a.wxId < b.wxId ? -1 : 1)
    })
}

function buildLeaderboard(metric: LeaderboardMetric, scope: LeaderboardScope): LeaderboardRow[] {
  if (metric === 'msg') {
    return msgCells(scope).slice(0, 10).map((m, i) => ({
      rank: i + 1,
      wxId: maskWxId(m.wxId),
      count: scope === 'day' ? readsToday([m]) : m.distinctIps,
      isMe: m.wxId === mockSession.wxId,
      messageId: m.id,
      messageContent: maskContent(m.content),
      ownerWxId: m.wxId,
      isMessagePublic: m.isPublic,
    }))
  }
  return cellsOf(metric, scope)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      wxId: maskWxId(r.wxId),
      count: r.count,
      isMe: r.wxId === mockSession.wxId,
    }))
}

export const mockLeaderboards: Record<`${LeaderboardMetric}-${LeaderboardScope}`, LeaderboardRow[]> = {
  'reg-day': buildLeaderboard('reg', 'day'),
  'reg-total': buildLeaderboard('reg', 'total'),
  'read-day': buildLeaderboard('read', 'day'),
  'read-total': buildLeaderboard('read', 'total'),
  'msg-day': buildLeaderboard('msg', 'day'),
  'msg-total': buildLeaderboard('msg', 'total'),
}

/** 消息榜行 → 真实 Message 对象的索引，供钻取时按 owner 分流到不同视图 */
export const mockMessageById: Map<string, Message> = new Map(
  mockAdminUsers.flatMap((u) => poolFor(u)).map((m) => [m.id, m]),
)

/** 我的真实名次（在全量排序中的位置，不是 Top-10 内的位置）。
 * 后端只返回 LIMIT 10，掉出前 10 时界面上完全没有「我到底第几名」，
 * 这是原排行榜最大的功能缺口，所以这里显式算出来给锚点卡用。
 */
export function myRankOf(metric: LeaderboardMetric, scope: LeaderboardScope): number | null {
  const cells =
    metric === 'msg'
      ? msgCells(scope).map((m) => ({ wxId: m.wxId, count: scope === 'day' ? readsToday([m]) : m.distinctIps }))
      : cellsOf(metric, scope)
  const i = cells.findIndex((r) => r.wxId === mockSession.wxId)
  return i < 0 ? null : i + 1
}

/** 公开链接的匿名只读视图用的那条消息（mockMessages 里 isPublic 的那条） */
export const mockPublicMessage: Message = mockMessages.find((m) => m.isPublic) ?? mockMessages[0]

// ————————————————— 管理后台：权益公式 —————————————————

/** 等级 1–20 的预览值，按公式 x 手算给出 */
export const mockEntitlements: EntitlementDimState[] = [
  {
    dim: 'message',
    formula: 'x * 10',
    source: 'formula',
    values: Array.from({ length: 20 }, (_, i) => (i + 1) * 10),
  },
  {
    dim: 'geo',
    formula: '20 + x * 4',
    source: 'formula',
    values: Array.from({ length: 20 }, (_, i) => 20 + (i + 1) * 4),
  },
  {
    dim: 'retentionMonths',
    formula: 'Math.min(3 + x, 36)',
    source: 'default',
    values: Array.from({ length: 20 }, (_, i) => Math.min(3 + (i + 1), 36)),
  },
]

export const ENTITLEMENT_LABEL: Record<EntitlementDimState['dim'], { title: string; unit: string; hint: string }> = {
  message: { title: '消息保留条数', unit: '条', hint: '该等级用户全库可留存的已注册消息上限' },
  geo: { title: '每日定位次数', unit: '次/天', hint: 'IP 归属地查询的每日配额，UTC 0 点重置' },
  retentionMonths: { title: '保留时长', unit: '个月', hint: '超过该时长的已读记录与消息由每日任务清理' },
}

// ————————————————— 管理后台：僵尸清理 —————————————————

export const mockRetentionPolicy: RetentionPolicy = {
  newUserDays: 14,
  dormantDays: 120,
}

export const mockRetentionPreview: RetentionPreview = {
  total: 1284,
  purgeable: 217,
  protectedCount: 41,
  never: 168,
  dormant: 49,
  truncated: true,
  page: 1,
  pageSize: 10,
  samples: [
    ['wxid_chenxi_77', 'never', '2026-07-28 10:09:22', null, 0, 0],
    ['wxid_qingwa_5h', 'never', '2026-09-06 19:05:11', null, 0, 0],
    ['wxid_spam_bot_9', 'never', '2026-09-14 04:22:09', null, 0, 0],
    ['wxid_reg_only_3c', 'never', '2026-08-30 22:14:08', null, 0, 0],
    ['wxid_nobody_msg', 'never', '2026-09-01 07:33:52', null, 0, 0],
    ['wxid_momo_reader', 'dormant', '2026-06-17 12:38:44', '2026-04-02 09:11:20', 14, 2],
    ['wxid_old_friend', 'dormant', '2026-02-11 16:20:41', '2026-05-19 20:44:02', 63, 1],
    ['wxid_gone_away', 'dormant', '2026-01-25 11:02:37', '2026-04-30 14:18:55', 28, 0],
    ['wxid_dormant_7f', 'dormant', '2026-03-08 09:47:13', '2026-05-12 22:30:41', 9, 3],
    ['wxid_sleep_ac', 'dormant', '2026-04-14 13:26:59', '2026-05-06 08:02:14', 5, 1],
  ].map(([wxId, reason, createdAt, lastRegAt, totalReg, messageCount]) => ({
    wxId: wxId as string,
    reason: reason as RetentionPreview['samples'][number]['reason'],
    createdAt: createdAt as string,
    lastRegAt: lastRegAt as string | null,
    totalReg: totalReg as number,
    messageCount: messageCount as number,
  })),
}

export const mockOrphanCounts: OrphanTableCount[] = [
  { table: 'registration_stats', label: '注册统计', orphanRows: 312 },
  { table: 'read_stats', label: '已读统计', orphanRows: 1284 },
  { table: 'message_read_stats', label: '消息已读统计', orphanRows: 96 },
]

// ————————————————— 审计留痕 [NEW] —————————————————

export const mockAuditLog: AuditEntry[] = [
  { id: 1284, wxId: 'wxid_liejiu_2026', action: 'admin_run_retention', detail: 'by=1284 deleted=217 skipped=41', ip: '116.62.19.240', timestamp: '2026-09-18 03:00:12', tone: 'warning' },
  { id: 1283, wxId: 'wxid_liejiu_2026', action: 'admin_set_retention', detail: 'newUserDays=14 dormantDays=120', ip: '116.62.19.240', timestamp: '2026-09-17 20:41:07', tone: 'neutral' },
  { id: 1282, wxId: 'wxid_ops_backup', action: 'admin_set_level', detail: 'target=wxid_lanlan_2g from=3 to=0', ip: '45.77.190.31', timestamp: '2026-09-17 11:02:55', tone: 'error' },
  { id: 1281, wxId: 'wxid_liejiu_2026', action: 'admin_ip_block_add', detail: 'scope=global ip=45.148.10.66', ip: '116.62.19.240', timestamp: '2026-09-16 09:14:30', tone: 'warning' },
  { id: 1280, wxId: 'wxid_zhangsan_88', action: 'message_set_public', detail: 'id=8f21…c3 public=1', ip: '203.118.44.7', timestamp: '2026-09-15 22:07:41', tone: 'success' },
  { id: 1279, wxId: 'wxid_liejiu_2026', action: 'admin_delete_user', detail: 'target=wxid_spam_bot_1 msg=0', ip: '116.62.19.240', timestamp: '2026-09-14 04:31:02', tone: 'error' },
  { id: 1278, wxId: 'wxid_liejiu_2026', action: 'admin_cleanup_orphans', detail: 'by=3492 total=1284 registration=312 read=1284 msg=96', ip: '116.62.19.240', timestamp: '2026-09-12 03:00:08', tone: 'warning' },
  { id: 1277, wxId: 'wxid_lisi_design', action: 'account_password_change', detail: 'sessions_revoked=2', ip: '10.20.30.40', timestamp: '2026-09-11 18:52:26', tone: 'success' },
  { id: 1276, wxId: 'wxid_liejiu_2026', action: 'admin_set_formula', detail: 'dim=geo formula="20 + x * 4"', ip: '116.62.19.240', timestamp: '2026-09-10 15:33:19', tone: 'neutral' },
  { id: 1275, wxId: 'wxid_momo_reader', action: 'message_delete', detail: 'id=a11c…77', ip: '198.51.100.23', timestamp: '2026-09-09 10:11:44', tone: 'neutral' },
]

// ————————————————— 展示辅助 —————————————————

/** 与 src/utils.ts maskWxId 保持一致：短 ID 留前后各 2 字，长 ID 留前 6 后 2 */
export function maskWxId(wxId: string): string {
  if (wxId.length <= 8) return `${wxId.slice(0, 2)}…${wxId.slice(-2)}`
  return `${wxId.slice(0, 6)}…${wxId.slice(-2)}`
}

/** 与 src/utils.ts maskContent 保持一致：≥5 字只留前后各 2 字，不足 5 字全文 */
export function maskContent(content: string): string {
  const s = String(content ?? '')
  if (s.length < 5) return s
  return `${s.slice(0, 2)}***${s.slice(-2)}`
}

/** 秒 → 「3 分 42 秒」/「2.6 小时」/「3 天」 */
export function humanDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`
  return `${(seconds / 86400).toFixed(1)} 天`
}

/** 地区随页面语言切换：zh 用中文字段，英文缺失时回落中文 */
export function localizeRegion(
  r: Pick<ReadRecord, 'located' | 'country' | 'region' | 'city' | 'isp' | 'countryEn' | 'regionEn' | 'cityEn' | 'ispEn'>,
  lang: 'zh' | 'en',
): string {
  if (!r.located) return '未定位'
  const zh = [r.country, r.region, r.city].filter(Boolean).join(' · ')
  const en = [r.countryEn, r.regionEn, r.cityEn].filter(Boolean).join(' · ')
  return lang === 'zh' ? zh || en : en || zh
}

/** UA → 设备归类，用于明细表里的紧凑图标 */
export function uaKind(ua: string): { kind: 'wechat' | 'ios' | 'android' | 'desktop' | 'other'; label: string } {
  if (/MicroMessenger/i.test(ua)) return { kind: 'wechat', label: '微信内置' }
  if (/iPhone|iPad/i.test(ua)) return { kind: 'ios', label: 'iOS Safari' }
  if (/Android/i.test(ua)) return { kind: 'android', label: 'Android 浏览器' }
  if (/Windows|Macintosh|Linux/i.test(ua)) return { kind: 'desktop', label: '桌面端' }
  return { kind: 'other', label: '未知客户端' }
}

/**
 * 模拟一次 IP 归属地查询。
 *
 * 结果按 IP 做哈希稳定取值，保证同一 IP 反复定位不会翻脸；
 * 尾号为 0 的 IP 固定返回 source:'none'，用来复现「多源全部失败」这条降级分支。
 */
export function mockLocate(
  ip: string,
): Pick<GeoLookupResult, 'country' | 'region' | 'city' | 'isp' | 'countryEn' | 'regionEn' | 'cityEn' | 'ispEn' | 'source'> {
  const hash = [...ip].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  if (ip.endsWith('0')) {
    return {
      country: '',
      region: '',
      city: '',
      isp: '',
      countryEn: '',
      regionEn: '',
      cityEn: '',
      ispEn: '',
      source: 'none',
    }
  }
  const c = CITIES[hash % CITIES.length]
  return {
    country: c[0],
    region: c[1],
    city: c[2],
    isp: c[3],
    countryEn: c[4],
    regionEn: c[5],
    cityEn: c[6],
    ispEn: c[7],
    // 中文取自 ip-api / ipwho.is，英文回落 ipinfo.io → ip.sb → freeipapi
    source: (['ipwho.is', 'ipinfo.io', 'ip.sb', 'freeipapi'] as const)[hash % 4],
  }
}

/** 已读明细里未定位行的占比节奏，保证每屏都有几条可点的「定位」按钮 */
export function isLocatable(row: ReadRecord, index: number): boolean {
  return !row.located && index % 3 === 0
}

/**
 * 时间的语言口径，沿用原产品行为：中文按 UTC+8 显示，英文按 UTC 原样显示。
 * 库内所有 timestamp 都是 UTC "YYYY-MM-DD HH:MM:SS"。
 */
export function displayTime(ts: string, lang: 'zh' | 'en'): string {
  if (lang === 'en') return ts
  const d = new Date(`${ts.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return ts
  d.setUTCHours(d.getUTCHours() + 8)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** 该已读发生在几点（跟随 displayTime 的同一时区口径，避免图表与表格对不上） */
export function hourOf(ts: string, lang: 'zh' | 'en'): number {
  const hour = Number(ts.slice(11, 13))
  return lang === 'zh' ? (hour + 8) % 24 : hour
}

/**
 * 某个用户名下的样例消息。
 * 种子取自 wxId 哈希，保证同一用户每次渲染得到同一批数据（评审时不会翻页就变样）。
 */
export function mockUserMessages(wxId: string, n: number): Message[] {
  const seed = [...wxId].reduce((acc, ch) => acc + ch.charCodeAt(0), 7)
  const local = makeRng(seed)
  const out: Message[] = []
  for (let i = 0; i < n; i += 1) {
    const reads = Math.floor(local() * 30)
    out.push({
      id: fakeId(),
      content: CONTENTS[Math.floor(local() * CONTENTS.length)],
      reads,
      timestamp: daysAgo(Math.floor(local() * 60), 8 + Math.floor(local() * 13), Math.floor(local() * 59)),
      wxId,
      isPublic: local() > 0.85,
      distinctIps: reads === 0 ? 0 : Math.max(1, Math.round(reads * 0.7)),
      firstReadSeconds: reads === 0 ? null : Math.floor(local() * 9000),
      dailyReads: distribute(reads, 14),
      blockedCount: 0,
    })
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
}

/** 某用户近期的操作留痕；真实实现即 audit_logs 按 wx_id 过滤 */
export function mockUserAudit(wxId: string): AuditEntry[] {
  return mockAuditLog.filter((a) => a.wxId === wxId)
}

export const MOCK_TODAY = TODAY
