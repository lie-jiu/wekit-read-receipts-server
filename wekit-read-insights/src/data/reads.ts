// ============================================================
// 数据层 · 单条消息的已读明细（FLOW 3）
// ------------------------------------------------------------
// 对应 GET /reads/:id/data、GET|POST|DELETE /reads/:id/block、
// POST /reads/:id/geo、POST /reads/:id/public、DELETE /reads/:id。
//
// 两个容易算错的地方都放在这里处理：
//   · 时间是 UTC 的 "YYYY-MM-DD HH:MM:SS"，直接 new Date(s) 会被按本地时区解析，
//     延迟就整体偏移一个时区差；统一走 utcSeconds()。
//   · 24 小时桶服务器给的是 UTC 桶，展示时区由这里轮转（和 /stats/overview 同一口径）。
// ============================================================

import type { HourSlice, IpBlockList, ReadRecord } from '../flows/shared/types'
import { api } from './api'
import { labelOfUa } from './overview'

export type ReadRowDto = {
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
  located: boolean
}

export type ReadSummaryDto = {
  hours: HourSlice[]
  regions: Array<{ country: string; region: string; count: number }>
  isps: Array<{ isp: string; count: number }>
  userAgents: Array<{ kind: string; count: number }>
  located: { count: number; ratio: number | null }
  firstReadSeconds: number | null
}

/** 与服务器 /reads/:id/data 逐字段对应 */
export type ReadsPayloadDto = {
  id: string
  content: string
  sentAt: string
  isPublic: boolean
  isOwner: boolean
  canManage: boolean
  ownerWxId: string | null
  total: number
  blockedCount: number
  visibleTotal: number
  page: number
  pageSize: number
  /** 服务器看到的访问者 IP（抽屉里「拉黑当前访问 IP」用它） */
  viewerIp: string
  /**
   * true = 本响应的 ip / userAgent 已被服务器掩码（匿名公开链接视角）。
   * 此时 userAgent 装的是 UA 类别 token（wechat/desktop/mobile/other），
   * 显示前必须过 labelOfUa()，原样贴出来就是一行英文代号。
   */
  masked: boolean
  reads: ReadRowDto[]
  summary: ReadSummaryDto
}

/** "YYYY-MM-DD HH:MM:SS" 当作 UTC 解析成秒。不给 Z 就会被按本地时区读，延迟会整体偏移 */
export function utcSeconds(s: string): number {
  return Math.floor(Date.parse(`${s.replace(' ', 'T')}Z`) / 1000)
}

export function readsDataUrl(id: string, page: number, pageSize: number): string {
  return `/reads/${id}/data?page=${page}&pageSize=${pageSize}`
}

export const blockListUrl = (id: string): string => `/reads/${id}/block`

export function locateRead(id: string, ip: string): Promise<ReadRowDto & { remaining: number; quota: number }> {
  return api.post(`/reads/${id}/geo`, { ip })
}

export async function setPublic(id: string, isPublic: boolean): Promise<{ ok: true; public: boolean }> {
  return api.post(`/reads/${id}/public`, { public: isPublic })
}

export const addBlock = (id: string, ip: string): Promise<{ ok: true; ip: string }> =>
  api.post(`/reads/${id}/block`, { ip })

export const removeBlock = (id: string, ip: string): Promise<{ ok: true }> =>
  api.del(`/reads/${id}/block?ip=${encodeURIComponent(ip)}`)

export const deleteMessage = (id: string): Promise<{ ok: true }> => api.del(`/reads/${id}`)

/** UTC 桶 → 展示时区桶：只做轮转，不改变总量 */
export function rotateHours(hours: HourSlice[], tz: number): HourSlice[] {
  if (tz === 0) return hours
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  for (const h of hours) {
    const slot = out[(h.hour + tz + 24) % 24]
    if (slot) slot.count += h.count
  }
  return out
}

export function toReadRecords(rows: ReadRowDto[], sentAt: string): ReadRecord[] {
  const sent = utcSeconds(sentAt)
  return rows.map((r) => ({
    ...r,
    delaySeconds: Math.max(0, utcSeconds(r.timestamp) - sent),
  }))
}

/**
 * 汇总用的视图模型。形状刻意与页面里 aggregateRegions/aggregateBy 的产物一致
 * （label / sub / count / share），这样"服务器给的汇总"和"单屏评审时按行现算"
 * 能喂同一套图表，不必为两条路径各写一个渲染分支。
 * 比值一律以「可见行」为分母，被拉黑的访问不参与。
 */
export type ReadSummary = {
  hours: HourSlice[]
  regions: Array<{ label: string; sub: string; count: number; share: number }>
  isps: Array<{ label: string; count: number; share: number }>
  userAgents: Array<{ label: string; count: number; share: number }>
  located: { count: number; ratio: number | null }
  firstReadSeconds: number | null
  visibleTotal: number
}

export function toSummary(dto: ReadSummaryDto, visibleTotal: number, tz: number, lang: 'zh' | 'en'): ReadSummary {
  const base = Math.max(1, visibleTotal)
  const locatedBase = Math.max(1, dto.located.count)
  return {
    hours: rotateHours(dto.hours, tz),
    // 服务器按 (国家, 省份) 分组，没有市级粒度：归属地配额有限，够用
    // 标题取最具体的一级，副标题补上下文；zh/en 的取舍与表格里的 localizeRegion 同规则
    regions: dto.regions.slice(0, 6).map((r) => ({
      label: r.region || r.country || '未知',
      sub: r.country,
      count: r.count,
      share: r.count / locatedBase,
    })),
    // 空 ISP 名兜底：有的源查得到国家查不到运营商
    isps: dto.isps.slice(0, 6).map((r) => ({
      label: r.isp || (lang === 'zh' ? '未知' : 'unknown'),
      count: r.count,
      share: r.count / locatedBase,
    })),
    userAgents: dto.userAgents.map((u) => ({
      label: labelOfUa(u.kind, lang),
      count: u.count,
      share: u.count / base,
    })),
    located: dto.located,
    firstReadSeconds: dto.firstReadSeconds,
    visibleTotal,
  }
}

export function toBlockList(dto: { count: number; ips: IpBlockList['ips'] }): IpBlockList {
  return { count: dto.count, ips: dto.ips }
}

/**
 * 明细响应 → 页头要的那条消息。
 * 钻取页可以直接用 URL 打开，不能假设总览的列表已经在内存里。
 * dailyReads 留空：那是列表页的「近 14 天」列，明细页不画它（要画就该问 /stats/overview）。
 */
export function headerOf(dto: ReadsPayloadDto, viewerWxId: string) {
  return {
    id: dto.id,
    content: dto.content,
    reads: dto.total,
    timestamp: dto.sentAt,
    wxId: dto.ownerWxId ?? viewerWxId,
    isPublic: dto.isPublic,
    distinctIps: dto.total,
    firstReadSeconds: dto.summary.firstReadSeconds,
    dailyReads: [] as number[],
    blockedCount: dto.blockedCount,
  }
}
