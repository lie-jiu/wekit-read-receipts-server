// ============================================================
// 数据层 · 总览
// ------------------------------------------------------------
// 对应 GET /stats/overview 与 GET /messages?detail=1。
// 这里只做「响应 → 视图模型」的搬运和必要的比值换算，
// 不在前端重算任何总量：总量、环比、覆盖率、时段、客户端
// 全部由服务器（rollup）给出，前端再算一遍就会出现两个不一致的数。
// ============================================================

import type { HourSlice, Message, RegionSlice, TrendPoint, UaSlice } from '../flows/shared/types'
import { api } from './api'

/** 与服务器 overview.ts 的响应逐字段对应 */
export type OverviewDto = {
  from: string
  to: string
  tz: number
  totals: {
    reads: number
    regs: number
    messages: number
    messagesWithReads: number
    distinctIps: number
    /** null = 窗口内没有消息，此时"覆盖率"无意义，不能当 0% 画 */
    coverage: number | null
  }
  prev: { from: string; to: string; reads: number; messages: number; regs: number }
  series: Array<{ date: string; reads: number; regs: number }>
  hours: Array<{ hour: number; count: number }>
  userAgents: Array<{ kind: string; count: number }>
  /** 已定位子集的规模：分部图表只是这一部分的结构，不是全量 */
  located: { count: number; ratio: number | null }
  regions: Array<{ country: string; region: string; count: number }>
  isps: Array<{ isp: string; count: number }>
  avgFirstReadSeconds: number | null
}

export type MessageDto = {
  id: string
  content: string
  reads: number
  timestamp: string
  isPublic: boolean
  firstReadSeconds: number | null
  blockedCount: number
  dailyReads: Array<{ date: string; count: number }>
}

export type MessagePage = { rows: MessageDto[]; total: number | null }

/** 展示时区偏移：与原产品一致按界面语言取（中文 UTC+8，英文 UTC） */
export function tzOfLang(lang: 'zh' | 'en'): number {
  return lang === 'zh' ? 8 : 0
}

export function overviewUrl(from: string, to: string, tz: number): string {
  const p = new URLSearchParams({ from, to, tz: String(tz) })
  return `/stats/overview?${p.toString()}`
}

export function messagesUrl(opts: { q?: string; limit: number; offset: number }): string {
  const p = new URLSearchParams({ limit: String(opts.limit), offset: String(opts.offset), detail: '1' })
  if (opts.q) p.set('q', opts.q)
  return `/messages?${p.toString()}`
}

export async function fetchMessages(url: string, signal?: AbortSignal): Promise<MessagePage> {
  const { items, total } = await api.getList<MessageDto[]>(url, signal)
  return { rows: items, total }
}

const UA_LABEL: Record<string, { zh: string; en: string }> = {
  wechat: { zh: '微信内置', en: 'WeChat in-app' },
  ios: { zh: 'iOS 浏览器', en: 'iOS browser' },
  android: { zh: 'Android 浏览器', en: 'Android browser' },
  desktop: { zh: '桌面浏览器', en: 'Desktop browser' },
  other: { zh: '其它 / 未知', en: 'Other / unknown' },
}
const UA_ORDER = ['wechat', 'ios', 'android', 'desktop', 'other'] as const

/** 服务器只回"近 14 天里有读的那几天"，sparkline 要的是等长数组 → 按日期补零 */
export function sparkArray(daily: Array<{ date: string; count: number }>, days: string[]): number[] {
  const byDate = new Map(daily.map((d) => [d.date, d.count]))
  return days.map((d) => byDate.get(d) ?? 0)
}

/** 近 n 个 UTC 自然日的日期串，从旧到新 */
export function recentUtcDays(n: number, today = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

export type OverviewModel = {
  range: { from: string; to: string; prevFrom: string; prevTo: string }
  totalReads: number
  totalReadsPrev: number
  registrations: number
  registrationsPrev: number
  /** 分母为 0 时给 null，让卡片显示"—"而不是 0% */
  readsDelta: number | null
  registrationsDelta: number | null
  messageCount: number
  messageCountPrev: number
  messagesWithReads: number
  distinctIps: number
  coverage: number | null
  avgFirstReadSeconds: number | null
  trend: TrendPoint[]
  hours: HourSlice[]
  userAgents: UaSlice[]
  /** 已定位子集 + 它占全量的比值（分部图的口径说明） */
  located: { count: number; ratio: number | null }
  regions: RegionSlice[]
  isps: Array<{ isp: string; count: number; share: number }>
}

function delta(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return (cur - prev) / prev
}

export function toModel(dto: OverviewDto, lang: 'zh' | 'en'): OverviewModel {
  // 比值一律以「已定位数」为分母：归属地是点一次才有一条，
  // 用 totals.reads 当分母会让每张分部图都看起来"缺了一大块"，
  // 而那块本来就不是这张图要表达的东西。
  const locatedBase = Math.max(1, dto.located.count)
  // 客户端分布的分母是各类之和（= 窗口内 reads 行数），与归属地无关
  const uaBase = Math.max(1, dto.userAgents.reduce((a, u) => a + u.count, 0))
  return {
    range: { from: dto.from, to: dto.to, prevFrom: dto.prev.from, prevTo: dto.prev.to },
    totalReads: dto.totals.reads,
    totalReadsPrev: dto.prev.reads,
    registrations: dto.totals.regs,
    registrationsPrev: dto.prev.regs,
    readsDelta: delta(dto.totals.reads, dto.prev.reads),
    registrationsDelta: delta(dto.totals.regs, dto.prev.regs),
    messageCount: dto.totals.messages,
    messageCountPrev: dto.prev.messages,
    messagesWithReads: dto.totals.messagesWithReads,
    distinctIps: dto.totals.distinctIps,
    coverage: dto.totals.coverage,
    avgFirstReadSeconds: dto.avgFirstReadSeconds,
    trend: dto.series.map((p) => ({
      date: p.date,
      reads: p.reads,
      registrations: p.regs,
      // 服务器没有按日的活跃用户数，图上不画这一维
      activeUsers: 0,
      readsDelta: 0,
    })),
    hours: dto.hours,
    userAgents: dto.userAgents
      .map((u) => ({
        kind: u.kind as UaSlice['kind'],
        label: labelOfUa(u.kind, lang),
        count: u.count,
        share: u.count / uaBase,
      }))
      .sort((a, b) => UA_ORDER.indexOf(a.kind) - UA_ORDER.indexOf(b.kind)),
    located: dto.located,
    regions: dto.regions.map((r) => ({
      country: r.country,
      region: r.region,
      city: '',
      count: r.count,
      share: r.count / locatedBase,
    })),
    isps: dto.isps.map((r) => ({ isp: r.isp, count: r.count, share: r.count / locatedBase })),
  }
}

/**
 * 服务器行 → 表格行。
 * days 是 sparkline 的日期轴（近 14 个 UTC 自然日，由调用方算一次给整页共用）；
 * wxId 必须传进来：钻取页用它判断「这条是不是我的」，留空会让所有消息都变成别人的。
 */
export function toMessageRow(row: MessageDto, days: string[], wxId: string): Message {
  return {
    id: row.id,
    content: row.content,
    reads: row.reads,
    timestamp: row.timestamp,
    wxId,
    isPublic: row.isPublic,
    // reads 就是 COUNT(DISTINCT ip)（reads 主键是 (id, ip)），两者恒等
    distinctIps: row.reads,
    firstReadSeconds: row.firstReadSeconds,
    dailyReads: sparkArray(row.dailyReads, days),
    blockedCount: row.blockedCount,
  }
}

/**
 * 一批行一起转，顺手做一次「服务端版本够不够」的显式判断。
 * detail=1 是老服务端会忽略的未知参数：它照样返回 4 个字段的旧形状，那时
 * 逐日序列是 undefined。让这里说清楚是版本不匹配，而不是把 TypeError 抛到
 * 错误边界上让人去猜；也不要静默按空数组画平线 —— 那会把「服务端太旧」
 * 伪装成「这条消息没人读过」。
 */
export function toMessageRows(rows: MessageDto[], days: string[], wxId: string): Message[] {
  const first = rows[0]
  if (first && first.dailyReads === undefined) {
    throw new Error('GET /messages?detail=1 未返回派生列：服务端版本过旧，请先升级服务端')
  }
  return rows.map((r) => toMessageRow(r, days, wxId))
}

export function labelOfUa(kind: string, lang: 'zh' | 'en'): string {
  return UA_LABEL[kind]?.[lang] ?? kind
}
