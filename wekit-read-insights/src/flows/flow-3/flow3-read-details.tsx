// ============================================================
// FLOW 3 of 7: Message Read Drill-down（单条消息已读明细钻取）
// Scenario ref: Data Analytics / BI · Flow 2 —— 聚合 → 维度钻取是页内视角切换，不跳转
//               + SaaS Management · Flow 4 —— 详情页与不可逆操作的二次确认
// Screens: 4 — 聚合视图 / 已读明细表 / 定位结果态 / 管理抽屉
// ============================================================

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Progress,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Toggle,
  Tooltip,
  TypographyMuted,
  toast,
} from 'sparkdesign'
import {
  Activity,
  Clock3,
  Copy,
  Eye,
  Gauge,
  Globe,
  Info,
  Lock,
  MapPin,
  ShieldBan,
  Smartphone,
  Trash,
  TriangleAlert,
  Users,
} from 'lucide-react'
import {
  displayTime,
  hourOf,
  humanDuration,
  localizeRegion,
  uaKind,
} from '../shared/mock-data'
import type { ReadSummary, ReadsPayloadDto } from '../../data/reads'
import {
  addBlock as apiAddBlock,
  deleteMessage,
  locateRead,
  removeBlock as apiRemoveBlock,
  setPublic,
  toReadRecords,
  toSummary,
  utcSeconds,
} from '../../data/reads'
import { ApiError } from '../../data/api'
import { pageItems } from '../shared/pagination'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum, t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type { IpBlockEntry, IpBlockList, Message, ReadRecord, Session } from '../shared/types'

// ————————————————— 校验与聚合（直接对当前明细实算，与表格必然自洽）—————————————————

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

function validIp(v: string): boolean {
  if (!IP_RE.test(v)) return false
  return v.split('.').every((n) => Number(n) <= 255)
}

function aggregateRegions(rows: ReadRecord[]) {
  const map = new Map<string, { label: string; sub: string; count: number }>()
  for (const r of rows) {
    if (!r.located) continue
    const key = `${r.country}|${r.region}|${r.city}`
    const hit = map.get(key)
    if (hit) hit.count += 1
    else
      map.set(key, {
        label: r.city || r.cityEn || (r.country || r.countryEn || '未知'),
        sub:
          [r.country, r.region].filter(Boolean).join(' · ') ||
          [r.countryEn, r.regionEn].filter(Boolean).join(' · '),
        count: 1,
      })
  }
  const total = rows.filter((r) => r.located).length || 1
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((v) => ({ ...v, share: v.count / total }))
}

function aggregateBy(rows: ReadRecord[], pickOf: (r: ReadRecord) => string) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = pickOf(r)
    if (!k) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const total = rows.length || 1
  return [...map.entries()]
    .map(([label, count]) => ({ label, count, share: count / total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}

function aggregateHours(rows: ReadRecord[], lang: Lang) {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  for (const r of rows) out[hourOf(r.timestamp, lang)].count += 1
  return out
}

/**
 * Spark 无堆叠条组件（已 grep 确认无 StackedBar / BarStack），按 token 色手写。
 * 顺序即图例顺序；色相全部取自 Spark 的分类色，暗色模式自动跟随。
 */
const SEGMENT_COLORS = [
  'var(--color-primary)',
  'var(--color-teal)',
  'var(--color-blue)',
  'var(--color-lavender)',
  'var(--color-mauve)',
  'var(--color-slate)',
]

function StackedBar({ segments, emptyText }: { segments: { label: string; share: number }[]; emptyText: string }) {
  if (segments.length === 0) return <TypographyMuted className="text-xs">{emptyText}</TypographyMuted>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-fill-secondary">
        {segments.map((s, i) => (
          <div
            key={s.label}
            style={{ width: `${s.share * 100}%`, backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            title={s.label}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            {s.label}
            <span className="tabular-nums text-text-tertiary">{Math.round(s.share * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** 24 根柱不值得再挂一个 recharts 实例；柱高是动态值，按 token 规范走 inline style */
function HourBars({ hours, lang }: { hours: { hour: number; count: number }[]; lang: Lang }) {
  const max = Math.max(1, ...hours.map((h) => h.count))
  return (
    <div>
      <div className="flex h-24 items-end gap-px">
        {hours.map((h) => (
          <Tooltip key={h.hour} content={`${String(h.hour).padStart(2, '0')}:00 · ${h.count} ${t(lang, 'unitTimes')}`}>
            <div
              className="flex-1 rounded-sm bg-primary"
              style={{ height: `${Math.max(3, (h.count / max) * 100)}%`, opacity: h.count === 0 ? 0.18 : 0.85 }}
              aria-label={`${h.hour}:00 — ${h.count}`}
            />
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-text-tertiary">
        <span>00:00</span>
        <span>{lang === 'zh' ? '12:00 · UTC+8' : '12:00 · UTC'}</span>
        <span>23:00</span>
      </div>
    </div>
  )
}

function MetaChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Item variant="outline" size="sm">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemDescription>{label}</ItemDescription>
        <ItemTitle className="truncate font-normal tabular-nums">{value}</ItemTitle>
      </ItemContent>
    </Item>
  )
}

// ————————————————— 屏 1：消息详情聚合视图 —————————————————

/* ================================================
   FLOW: Message Read Drill-down
   SCREEN 1 of 4: 消息详情（聚合视图）
   ------------------------------------------------
   ENTRY:  FLOW 2 行内「查看明细」/ ⌘K 搜索直达 / 访问 /reads/:id
   EXIT:   切到「已读明细」Tab → SCREEN 2
   BRANCH: 一条都没定位 → 地区分布区显示引导空态（不是「暂无数据」）
           非本人且非管理员且 is_public=0 → 由路由层给 403 整页
   ================================================ */
export function Screen1_MessageAggregate({
  message,
  rows,
  lang,
  agg,
  onOpenDetail,
}: {
  message: Message
  rows: ReadRecord[]
  lang: Lang
  /**
   * 服务器给的「覆盖全部可见行」汇总。明细是分页的，前端手上只有第 N 页，
   * 用行现算出来的其实是"最近 50 次的分布"，而它在页面上看起来和
   * "这条消息的分布"一模一样 —— 所以主路径必须用这个。
   * 省略时（单屏评审，rows 就是全部数据）才退回按行聚合。
   */
  agg?: ReadSummary
  onOpenDetail?: () => void
}) {
  const total = agg ? agg.visibleTotal : rows.length
  const locatedCount = agg ? agg.located.count : rows.filter((r) => r.located).length
  const regions = agg ? agg.regions : aggregateRegions(rows)
  const isps = agg
    ? agg.isps
    : aggregateBy(rows, (r) => (r.located ? (lang === 'zh' ? r.isp : r.ispEn) : ''))
  const uas = agg ? agg.userAgents : aggregateBy(rows, (r) => uaKind(r.userAgent).label)
  const hours = agg ? agg.hours : aggregateHours(rows, lang)
  const distinctIps = agg ? message.distinctIps : new Set(rows.map((r) => r.ip)).size

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription className="tabular-nums">
            {displayTime(message.timestamp, lang)} · {message.wxId}
          </CardDescription>
          {/* 这里放的是消息原文，不是页面标题，所以按正文给行高而不是 leading-snug */}
          <CardTitle className="text-base leading-relaxed">{message.content}</CardTitle>
          <CardAction>
            {message.isPublic ? (
              <Tag color="success" appearance="outline">
                <Globe className="size-3" />
                {t(lang, 'statePublic')}
              </Tag>
            ) : (
              <Tag color="slate" appearance="outline">
                <Lock className="size-3" />
                {t(lang, 'statePrivate')}
              </Tag>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {/* 密度断点：手机 1 列 / 平板 2 列 / 桌面 4 列 */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetaChip
              icon={<Eye className="size-4" />}
              label={lang === 'zh' ? '累计已读' : 'Total reads'}
              value={fmtNum(message.reads)}
            />
            <MetaChip
              icon={<Users className="size-4" />}
              label={lang === 'zh' ? '独立 IP' : 'Distinct IPs'}
              value={fmtNum(distinctIps)}
            />
            <MetaChip
              icon={<Clock3 className="size-4" />}
              label={lang === 'zh' ? '首次被读' : 'First read in'}
              value={humanDuration(message.firstReadSeconds)}
            />
            <MetaChip
              icon={<ShieldBan className="size-4" />}
              label={lang === 'zh' ? '黑名单过滤' : 'Blocklisted'}
              value={`${message.blockedCount}`}
            />
          </div>

          {locatedCount < total && (
            <TypographyMuted className="mt-3 block text-xs">
              {lang === 'zh'
                ? `${total - locatedCount} / ${total} 条尚未定位，下面的分布只统计已定位部分`
                : `${total - locatedCount} of ${total} rows are not geo-located; the breakdowns below cover located hits only`}
              <Tooltip
                content={
                  lang === 'zh'
                    ? 'IP 归属地是按需触发的外部查询：不定位就不发第三方请求，也不扣配额'
                    : 'Geo lookup is on demand — un-located rows cost no quota and trigger no external call'
                }
              >
                <Info className="ms-1 inline-block size-3 align-[-2px] text-text-tertiary" />
              </Tooltip>
            </TypographyMuted>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{lang === 'zh' ? '地区分布' : 'Where they read'}</CardTitle>
            <CardDescription>{lang === 'zh' ? '仅统计已定位的访问' : 'Geo-located hits only'}</CardDescription>
          </CardHeader>
          <CardContent>
            {regions.length === 0 ? (
              /* 空态成因：一次都没定位过 —— 明确给出下一步动作 */
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MapPin className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>{lang === 'zh' ? '尚未定位任何访问' : 'Nothing geo-located yet'}</EmptyTitle>
                  <EmptyDescription>
                    {lang === 'zh'
                      ? '到「已读明细」里给几行点上定位，这里就会出现城市与运营商分布。'
                      : 'Locate a few rows under “Read detail” to populate this breakdown.'}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="md" onClick={onOpenDetail}>
                    {lang === 'zh' ? '去明细定位' : 'Go to detail'}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {regions.map((r) => (
                  <Item key={`${r.label}-${r.sub}`} size="sm">
                    <ItemMedia variant="icon">
                      <Globe className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{r.label}</ItemTitle>
                      <ItemDescription>{r.sub}</ItemDescription>
                    </ItemContent>
                    <div className="w-24 shrink-0">
                      <Progress value={Math.round(r.share * 100)} max={100} />
                      <TypographyMuted className="mt-1 block text-right text-[11px] tabular-nums">
                        {r.count} · {Math.round(r.share * 100)}%
                      </TypographyMuted>
                    </div>
                  </Item>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === 'zh' ? '运营商与客户端' : 'ISP & client'}</CardTitle>
            <CardDescription>
              {lang === 'zh' ? '「微信内置」占比高说明命中来自客户端预热而非真人点击' : 'A high WeChat-inlined share suggests client prefetch rather than a human tap'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <TypographyMuted className="text-xs font-medium">{t(lang, 'isp')}</TypographyMuted>
              <StackedBar segments={isps} emptyText={lang === 'zh' ? '暂无已定位的运营商数据' : 'No ISP data yet'} />
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <TypographyMuted className="text-xs font-medium">{t(lang, 'userAgent')}</TypographyMuted>
              <StackedBar segments={uas} emptyText={lang === 'zh' ? '暂无客户端数据' : 'No client data yet'} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'zh' ? '一天中的到达分布' : 'Arrival by hour'}</CardTitle>
          <CardDescription>
            {lang === 'zh' ? '中文界面按 UTC+8 展示，切到 EN 回到 UTC 原值' : 'The English view keeps raw UTC'}
          </CardDescription>
          <CardAction>
            <Tag color="slate" appearance="outline">
              {fmtNum(rows.length)} {t(lang, 'unitTimes')}
            </Tag>
          </CardAction>
        </CardHeader>
        <CardContent>
          <HourBars hours={hours} lang={lang} />
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— 定位按钮（含配额用尽分支）—————————————————

function LocateAction({
  row,
  busy,
  failed,
  quotaLeft,
  lang,
  geoEnabled = true,
  onLocate,
}: {
  row: ReadRecord
  busy: boolean
  failed: boolean
  quotaLeft: number
  lang: Lang
  /** 部署侧关掉 IP 定位（ENABLE_GEO=0）时按钮直接禁用并说明原因：
   *  服务器对这类请求回 403，让用户点进去拿一个失败提示是最糟的体验 */
  geoEnabled?: boolean
  onLocate: (ip: string) => void
}) {
  const exhausted = !geoEnabled || quotaLeft <= 0
  const button = (
    <Button variant="outline" size="sm" loading={busy} disabled={exhausted} onClick={() => onLocate(row.ip)}>
      {failed && !busy ? (lang === 'zh' ? '重试定位' : 'Retry') : t(lang, 'locate')}
    </Button>
  )
  if (!exhausted) return button
  // disabled 的按钮不响应 hover，Tooltip 要裹住外层容器才有机会出现
  const reason = !geoEnabled
    ? lang === 'zh'
      ? '本站未开启 IP 定位'
      : 'IP lookup is disabled on this deployment'
    : lang === 'zh'
      ? '今日定位次数已用尽，UTC 0 点重置'
      : 'Daily quota used up; resets 00:00 UTC'
  return (
    <span className="inline-flex">
      <Tooltip content={reason}>{button}</Tooltip>
    </span>
  )
}

// ————————————————— 屏 2：已读明细表 —————————————————

/* ================================================
   FLOW: Message Read Drill-down
   SCREEN 2 of 4: 已读明细表
   ------------------------------------------------
   ENTRY:  SCREEN 1 之上切到「已读明细」Tab，或直接落在此 Tab
   EXIT:   点行内「定位」 → SCREEN 3（结果就地出现在表上方）
           点「加入黑名单」 → 本屏剔除该行，黑名单计数 +1
   BRANCH: 五源全挂 → 该行位置列转 inline warning，可重试且不扣配额
           配额归零 → 剩余行的定位按钮 disabled + Tooltip 说明重置时间
   ================================================ */
export function Screen2_ReadsTable({
  rows,
  page,
  pageSize,
  total,
  lang,
  canManage,
  geoLeft,
  locatingIp,
  failedIp,
  geoEnabled = true,
  onPageChange = () => undefined,
  onLocate,
  onBlock,
}: {
  rows: ReadRecord[]
  page: number
  pageSize: number
  /**
   * 可见行总数。给了它就算服务端分页：rows 已经是这一页的全部内容，
   * 前端不能再 slice 一次（那会把第 2 页切成空表）。
   * 省略时（单屏评审）才在本地按 page 切。
   */
  total?: number
  lang: Lang
  canManage: boolean
  geoLeft: number
  locatingIp: string | null
  failedIp: string | null
  geoEnabled?: boolean
  onPageChange?: (p: number) => void
  onLocate: (ip: string) => void
  onBlock: (ip: string) => void
}) {
  const count = total ?? rows.length
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const slice = total === undefined ? rows.slice((page - 1) * pageSize, page * pageSize) : rows

  const columns = [
    {
      key: 'ip',
      header: t(lang, 'ipCase'),
      cell: (row: ReadRecord) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{row.ip}</span>
          {canManage && (
            <IconButton
              icon={<Copy className="size-3.5" />}
              variant="ghost"
              size="sm"
              aria-label={lang === 'zh' ? '复制该 IP' : 'Copy this IP'}
              onClick={() => {
                void navigator.clipboard?.writeText(row.ip)
                toast.success(t(lang, 'copied'))
              }}
            />
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: t(lang, 'location'),
      cell: (row: ReadRecord) => {
        if (row.located)
          return (
            <div>
              <span className="text-sm">{localizeRegion(row, lang)}</span>
              <TypographyMuted className="block text-xs">{lang === 'zh' ? row.isp : row.ispEn}</TypographyMuted>
            </div>
          )
        if (failedIp === row.ip)
          return (
            <Alert variant="warning" className="max-w-sm">
              <AlertTitle>{lang === 'zh' ? '定位失败' : 'Lookup failed'}</AlertTitle>
              <AlertDescription>
                {lang === 'zh'
                  ? 'ip-api、ipwho.is、ipinfo.io、ip.sb、freeipapi 五个源均无返回，本次不扣配额。'
                  : 'All five providers returned nothing. This attempt is not charged against your quota.'}
              </AlertDescription>
            </Alert>
          )
        return (
          <div className="flex items-center gap-2">
            <LocateAction
              row={row}
              lang={lang}
              busy={locatingIp === row.ip}
              failed={failedIp === row.ip}
              quotaLeft={geoLeft}
              geoEnabled={geoEnabled}
              onLocate={onLocate}
            />
            {locatingIp === row.ip && (
              <TypographyMuted className="text-xs">{lang === 'zh' ? '查询中…' : 'Looking up…'}</TypographyMuted>
            )}
          </div>
        )
      },
    },
    {
      key: 'userAgent',
      header: t(lang, 'userAgent'),
      cell: (row: ReadRecord) => {
        const kind = uaKind(row.userAgent)
        return (
          <Tooltip content={row.userAgent}>
            <Tag color="slate" appearance="outline">
              {kind.kind === 'desktop' ? <Info className="size-3" /> : <Smartphone className="size-3" />}
              {kind.label}
            </Tag>
          </Tooltip>
        )
      },
    },
    {
      key: 'timestamp',
      header: t(lang, 'readAt'),
      cell: (row: ReadRecord) => (
        <div>
          <span className="text-sm tabular-nums">{displayTime(row.timestamp, lang)}</span>
          <TypographyMuted className="block text-xs">
            {lang === 'zh' ? '延迟 ' : 'delay '}
            {humanDuration(row.delaySeconds)}
          </TypographyMuted>
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'block',
            header: '',
            cell: (row: ReadRecord) => (
              <Button variant="text" size="sm" onClick={() => onBlock(row.ip)}>
                <ShieldBan className="size-3.5" />
                {lang === 'zh' ? '加入黑名单' : 'Block'}
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveTable
        columns={columns}
        data={slice}
        primary="location"
        compactHidden={['userAgent']}
        metaKey="timestamp"
        emptyText={lang === 'zh' ? '这条消息还没有产生任何已读' : 'No reads recorded for this message yet'}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypographyMuted className="text-xs tabular-nums">
          {fmtNum(rows.length)} {lang === 'zh' ? `条 · 第 ${page}/${totalPages} 页` : `rows · page ${page}/${totalPages}`}
        </TypographyMuted>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text={lang === 'zh' ? '上一页' : 'Previous'}
                aria-disabled={page === 1}
                onClick={(e) => {
                  e.preventDefault()
                  onPageChange(Math.max(1, page - 1))
                }}
              />
            </PaginationItem>
            {pageItems(page, totalPages).map((item, i) =>
              item === 'gap' ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationLink href="#" aria-disabled>
                    …
                  </PaginationLink>
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    onClick={(e) => {
                      e.preventDefault()
                      onPageChange(item)
                    }}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                text={lang === 'zh' ? '下一页' : 'Next'}
                aria-disabled={page === totalPages}
                onClick={(e) => {
                  e.preventDefault()
                  onPageChange(Math.min(totalPages, page + 1))
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

// ————————————————— 屏 3：定位结果态 —————————————————

/* ================================================
   FLOW: Message Read Drill-down
   SCREEN 3 of 4: 定位结果态
   ------------------------------------------------
   ENTRY:  SCREEN 2 点某行「定位」且至少一个外部源返回
   EXIT:   结果卡出现在表上方 + Toast 报剩余配额 → 可继续定位下一行
   BRANCH: 五源全挂 → 走 SCREEN 2 的行内 warning
           配额扣到 0 → 本屏之后所有定位按钮转 disabled
   ================================================ */
export function Screen3_LocateResult({
  row,
  lang,
  geoLeft,
  geoQuota,
}: {
  row: ReadRecord
  lang: Lang
  geoLeft: number
  geoQuota: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4" />
          {lang === 'zh' ? '定位结果' : 'Lookup result'}
          <span className="font-mono text-sm font-normal text-text-secondary">{row.ip}</span>
        </CardTitle>
        <CardDescription>
          {/* 服务器不回报"这次是哪家源答的"（geo.ts 内部并发降级后只留结果），
              所以这里只说机制，不点名某一家 —— 点名就是把不知道的事说成知道 */}
          {lang === 'zh'
            ? '服务器多源并发、逐级降级查询；中文缺失时以英文结果兜底'
            : 'Resolved server-side with concurrent multi-source fallback; the English record is used when the Chinese one is missing'}
        </CardDescription>
        <CardAction>
          <Tag color={geoLeft > 0 ? 'success' : 'warning'} appearance="outline">
            <Gauge className="size-3" />
            {geoLeft}/{geoQuota} {t(lang, 'remainingOf')}
          </Tag>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetaChip icon={<Globe className="size-4" />} label={t(lang, 'location')} value={localizeRegion(row, lang)} />
          <MetaChip icon={<Activity className="size-4" />} label={t(lang, 'isp')} value={lang === 'zh' ? row.isp : row.ispEn} />
          <MetaChip icon={<Clock3 className="size-4" />} label={t(lang, 'readAt')} value={displayTime(row.timestamp, lang)} />
        </div>
      </CardContent>
    </Card>
  )
}

// ————————————————— 屏 4：管理抽屉 —————————————————

/* ================================================
   FLOW: Message Read Drill-down
   SCREEN 4 of 4: 管理抽屉（公开开关 / 消息级黑名单 / 删除）
   ------------------------------------------------
   ENTRY:  页首「管理」按钮 —— 仅 owner 或 admin 可见（canManage）
   EXIT:   任一操作即时生效；关闭抽屉回到 SCREEN 1/2
   BRANCH: 删除 → AlertDialog 二次确认，层级高于抽屉；取消则抽屉保持打开
           IP 非法或重复 → 面板内 inline Alert，抽屉不关闭
   ================================================ */
export function Screen4_ManageDrawer({
  open,
  onOpenChange,
  isPublic,
  blocks,
  readCount,
  lang,
  messageContent,
  visitorIp,
  onTogglePublic,
  onAddBlock,
  onRemoveBlock,
  onDelete,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  isPublic: boolean
  blocks: IpBlockList
  readCount: number
  lang: Lang
  messageContent: string
  /** 服务器看到的访问者 IP，供「屏蔽当前访问 IP」一键用 */
  visitorIp: string
  onTogglePublic: (next: boolean) => void
  /** 可以返回错误文案；异步实现返回 Promise，调用处 await 之后再决定留不留错误 */
  onAddBlock: (ip: string) => string | undefined | Promise<string | undefined>
  onRemoveBlock: (ip: string) => void
  onDelete: () => void
}) {
  const [ipDraft, setIpDraft] = useState('')
  const [inlineError, setInlineError] = useState<string | undefined>(undefined)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const add = async (value: string) => {
    const trimmed = value.trim()
    if (!validIp(trimmed)) {
      setInlineError(lang === 'zh' ? '请输入合法的 IPv4 地址，例如 203.0.113.7' : 'Enter a valid IPv4 address')
      return
    }
    const err = await onAddBlock(trimmed)
    if (err) {
      setInlineError(err)
      return
    }
    setInlineError(undefined)
    setIpDraft('')
    toast.success(lang === 'zh' ? `已拉黑 ${trimmed}` : `Blocked ${trimmed}`)
  }

  const blockColumns = [
    {
      key: 'ip',
      header: t(lang, 'ipCase'),
      cell: (r: IpBlockEntry) => <span className="font-mono text-sm">{r.ip}</span>,
    },
    {
      key: 'createdAt',
      header: lang === 'zh' ? '加入时间' : 'Added at',
      cell: (r: IpBlockEntry) => (
        <span className="text-sm tabular-nums text-text-secondary">{displayTime(r.createdAt, lang)}</span>
      ),
    },
    {
      key: 'remove',
      header: '',
      cell: (r: IpBlockEntry) => (
        <Button variant="text" size="sm" onClick={() => onRemoveBlock(r.ip)}>
          {t(lang, 'remove')}
        </Button>
      ),
    },
  ]

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="right" showCloseButton>
        <DrawerHeader>
          <DrawerTitle>{lang === 'zh' ? '消息管理' : 'Manage message'}</DrawerTitle>
          <DrawerDescription className="line-clamp-2">{messageContent}</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-auto px-6 pb-6">
          {/* 公开访问 —— 持久二态设置 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{lang === 'zh' ? '公开已读明细' : 'Public read details'}</div>
                <TypographyMuted className="text-xs">
                  {lang === 'zh'
                    ? '开启后任何人凭链接可只读查看；匿名访问不消耗你的配额'
                    : 'Anyone with the link gets a read-only view; anonymous hits cost you no quota'}
                </TypographyMuted>
              </div>
              <Toggle
                pressed={isPublic}
                onPressedChange={(v) => {
                  onTogglePublic(v)
                  toast.success(v ? t(lang, 'statePublic') : t(lang, 'statePrivate'))
                  /* → 切换即时生效，没有统一保存按钮 */
                }}
                prefixIcon={isPublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
              >
                {isPublic ? t(lang, 'statePublic') : t(lang, 'statePrivate')}
              </Toggle>
            </div>
            {isPublic && (
              <TypographyMuted className="text-xs">
                {lang === 'zh' ? '公开链接：' : 'Public link: '}
                <span className="font-mono">/reads/:id</span>
              </TypographyMuted>
            )}
          </section>

          <Separator />

          {/* 消息级黑名单 —— 作用域仅此消息 */}
          <section className="flex flex-col gap-3">
            <div>
              <div className="text-sm font-medium">
                {lang === 'zh' ? '本条消息的 IP 黑名单' : 'IP blocklist for this message'}
              </div>
              <TypographyMuted className="text-xs">
                {lang === 'zh'
                  ? `作用域仅此消息 · 已拉黑 ${blocks.count} 个 · 命中记录在服务端直接过滤，接口不返回其 IP 与定位`
                  : `Scoped to this message · ${blocks.count} entries · matching rows are dropped server-side`}
              </TypographyMuted>
            </div>
            <div>
              <InputGroup>
                <InputGroupInput
                  value={ipDraft}
                  onChange={(e) => {
                    setIpDraft(e.target.value)
                    setInlineError(undefined)
                  }}
                  placeholder="203.0.113.7"
                  aria-label={lang === 'zh' ? '要拉黑的 IP' : 'IP to block'}
                />
                <InputGroupAddon align="inline-end">
                  <Button variant="secondary" size="sm" onClick={() => add(ipDraft)}>
                    {t(lang, 'add')}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
              {inlineError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{inlineError}</AlertDescription>
                </Alert>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => add(visitorIp)} className="self-start">
              <MapPin className="size-3.5" />
              {lang === 'zh'
                ? `屏蔽当前访问 IP（${visitorIp}）`
                : `Block current visitor (${visitorIp})`}
            </Button>
            {blocks.ips.length > 0 ? (
              <ResponsiveTable columns={blockColumns} data={blocks.ips} primary="ip" metaKey="createdAt" />
            ) : (
              <TypographyMuted className="text-xs">
                {lang === 'zh' ? '这条消息还没有拉黑过 IP' : 'No IPs blocked on this message'}
              </TypographyMuted>
            )}
          </section>

          <Separator />

          {/* 危险区 —— 不可逆操作强制二次确认 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-error">
              <TriangleAlert className="size-4" />
              {lang === 'zh' ? '危险操作' : 'Danger zone'}
            </div>
            <TypographyMuted className="text-xs">
              {lang === 'zh'
                ? '删除会连带清除它的全部已读记录，公开链接立即失效；等级配额随之释放。'
                : 'Deleting also drops every read row for this message and kills the public link; your quota frees up.'}
            </TypographyMuted>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="md" className="self-start">
                  <Trash className="size-4" />
                  {lang === 'zh' ? '删除这条消息' : 'Delete message'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{lang === 'zh' ? '确认删除这条消息？' : 'Delete this message?'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {lang === 'zh'
                      ? `将删除 1 条消息和 ${fmtNum(readCount)} 条已读记录，此操作不可撤销。`
                      : `This removes 1 message and ${fmtNum(readCount)} read rows. Cannot be undone.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t(lang, 'cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onDelete()
                      onOpenChange(false)
                      /* → 确认删除 → 退出 flow，回到 FLOW 2 列表 */
                    }}
                  >
                    {lang === 'zh' ? '确认删除' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="ghost" size="md">
              {t(lang, 'close')}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// ————————————————— Flow 组合器 —————————————————

export function Flow3_ReadDetails({
  message,
  payload,
  blocks,
  session,
  lang = 'zh',
  tz = 0,
  canManage = true,
  loading = false,
  page = 1,
  onBack,
  onPageChange,
  onLocated,
  onChanged,
}: {
  message: Message
  /** GET /reads/:id/data；null = 还没取到 */
  payload: ReadsPayloadDto | null
  /** GET /reads/:id/block；null = 无权限（匿名/非 owner）或还没取到 */
  blocks: IpBlockList | null
  session: Session
  lang?: Lang
  /** 展示时区偏移：24 小时图按它轮转（中文 +8 / 英文 0） */
  tz?: number
  canManage?: boolean
  loading?: boolean
  /** 服务端分页：页码由容器持有（换页就是换 URL、重取一次） */
  page?: number
  onBack?: () => void
  onPageChange?: (next: number) => void
  /** 定位成功：容器要把明细与汇总一起重取（分布图的比例随之变化） */
  onLocated?: () => void
  /** 黑名单 / 公开开关 / 删除之后重取 */
  onChanged?: () => void
}) {
  const rows = useMemo(() => (payload ? toReadRecords(payload.reads, payload.sentAt) : []), [payload])
  const agg = useMemo<ReadSummary | null>(
    () => (payload ? toSummary(payload.summary, payload.visibleTotal, tz, lang) : null),
    [payload, tz, lang],
  )
  const [tab, setTab] = useState<'summary' | 'detail'>('summary')
  const [geoLeft, setGeoLeft] = useState(session.geoRemaining)
  const [locatingIp, setLocatingIp] = useState<string | null>(null)
  const [failedIp, setFailedIp] = useState<string | null>(null)
  const [justLocated, setJustLocated] = useState<ReadRecord | null>(null)
  // 派生而不是 useState 种子：首帧 payload 还在路上，种子会把列表带来的旧值永久冻结
  // （实测公开消息的 chip 显示「未公开」）。override 只在用户自己切换时存在。
  const [publicOverride, setPublicOverride] = useState<boolean | null>(null)
  const isPublic = publicOverride ?? payload?.isPublic ?? message.isPublic
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pageSize = payload?.pageSize ?? 50
  // 抽屉里的黑名单条目（GET /reads/:id/block，只有 owner/admin 取得到）
  const blocked: IpBlockList = blocks ?? { count: 0, ips: [] }

  const locate = async (ip: string) => {
    if (geoLeft <= 0) return
    setLocatingIp(ip)
    setFailedIp(null)
    try {
      const g = await locateRead(message.id, ip)
      // 服务器只回归属地字段（timestamp/userAgent 是空的），时间与延迟仍取表里那一行
      const prev = rows.find((r) => r.ip === ip)
      const at = prev?.timestamp ?? ''
      // 剩余次数以服务器给的为准：它是扣额之后算的，本地减一在并发/跨天时会和服务器对不上
      setGeoLeft(Math.max(0, g.remaining))
      setJustLocated({
        ip: g.ip,
        timestamp: at,
        userAgent: prev?.userAgent ?? '',
        country: g.country,
        region: g.region,
        city: g.city,
        isp: g.isp,
        countryEn: g.countryEn,
        regionEn: g.regionEn,
        cityEn: g.cityEn,
        ispEn: g.ispEn,
        located: g.located,
        delaySeconds: at ? Math.max(0, utcSeconds(at) - utcSeconds(message.timestamp)) : 0,
      })
      toast.success(lang === 'zh' ? `已定位 · 今日剩余 ${g.remaining} 次` : `Located · ${g.remaining} left today`)
      onLocated?.()
      /* → 定位成功 → SCREEN 3 结果卡出现在表上方 */
    } catch (e) {
      setFailedIp(ip)
      const quotaMsg =
        e instanceof ApiError && e.status === 429
          ? lang === 'zh'
            ? '今日定位次数已用完'
            : 'Out of lookups today'
          : lang === 'zh'
            ? '定位失败，稍后重试'
            : 'Lookup failed — try again later'
      toast.error(quotaMsg)
    } finally {
      setLocatingIp(null)
    }
  }

  const addBlock = async (ip: string): Promise<string | undefined> => {
    try {
      await apiAddBlock(message.id, ip)
    } catch (e) {
      if (e instanceof ApiError && e.code.includes('exists')) {
        return lang === 'zh' ? `${ip} 已在黑名单中` : `${ip} is already blocklisted`
      }
      return lang === 'zh' ? '拉黑失败，请稍后重试' : 'Could not blocklist — try again'
    }
    onChanged?.()
    return undefined
  }

  const removeBlock = async (ip: string) => {
    try {
      await apiRemoveBlock(message.id, ip)
    } catch {
      toast.error(lang === 'zh' ? '移出失败，请稍后重试' : 'Could not unblock — try again')
      return
    }
    toast.success(
      lang === 'zh' ? '已移出黑名单；历史读记录仍在库中，重新钻取即可看到' : 'Unblocked; historic rows stay in the store',
    )
    onChanged?.()
  }

  const togglePublic = async (next: boolean) => {
    setPublicOverride(next) // 乐观更新，失败再回滚：开关是即时反馈型控件
    try {
      await setPublic(message.id, next)
      onChanged?.()
    } catch {
      // 失败时交还给服务器口径，而不是记住一次没成功的点击
      setPublicOverride(null)
      toast.error(lang === 'zh' ? '设置未保存，请稍后重试' : 'Not saved — try again')
    }
  }

  /** 删除是不可逆动作，确认框已经在 Screen4 里；这里只负责真删与失败回退 */
  const remove = async () => {
    try {
      await deleteMessage(message.id)
    } catch {
      toast.error(lang === 'zh' ? '删除失败，请稍后重试' : 'Delete failed — try again')
      return
    }
    toast.success(lang === 'zh' ? '消息已删除' : 'Message deleted')
    onBack?.()
  }

  // 还没有数据：要么在路上，要么取失败。取失败时容器已经把错误显示在别处，
  // 这里仍要给一屏骨架，不能让页面直接空成一块白。
  if (!payload) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6" role={loading ? 'status' : undefined} aria-busy={loading}>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
        {!loading && (
          <Alert variant="warning">
            <AlertDescription>
              {lang === 'zh' ? '没有取到这条消息的明细。可能是登录态过期或这条消息已不存在。' : 'No detail loaded — your session may have expired, or the message is gone.'}
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  const detail = (
    <>
      {justLocated && (
        <div className="mb-4">
          <Screen3_LocateResult row={justLocated} lang={lang} geoLeft={geoLeft} geoQuota={session.geoQuota} />
        </div>
      )}
      <Screen2_ReadsTable
        rows={rows}
        page={page}
        pageSize={pageSize}
        total={payload.visibleTotal}
        lang={lang}
        canManage={canManage}
        geoLeft={geoLeft}
        geoEnabled={session.geo}
        locatingIp={locatingIp}
        failedIp={failedIp}
        onPageChange={onPageChange}
        onLocate={locate}
        onBlock={addBlock}
      />
      {/* 命中黑名单的"访问次数"与黑名单里的"条目数"是两件事：
          条目可以一条都没命中（比如注册时自动加进来的来源 IP 之后再没读过），
          这里说的是被过滤掉的行数，必须用 payload.blockedCount。 */}
      {payload.blockedCount > 0 && (
        <Alert variant="info" className="mt-4">
          <AlertDescription>
            {lang === 'zh'
              ? `另有 ${payload.blockedCount} 条命中黑名单的访问未出现在这里；数据库记录保留，解除拉黑后可重新钻取。`
              : `${payload.blockedCount} blocklisted hits are omitted here; the underlying rows remain in the store.`}
          </AlertDescription>
        </Alert>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild onClick={onBack}>
                <a href="#">{t(lang, 'navOverview')}</a>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{lang === 'zh' ? '消息详情' : 'Message detail'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {canManage && (
          <div className="flex items-center gap-2">
            <Tooltip content={lang === 'zh' ? `等级 Lv ${session.level} 决定每日 ${session.geoQuota} 次` : `Lv ${session.level} grants ${session.geoQuota} lookups/day`}>
              <Tag color={geoLeft > 0 ? 'info' : 'warning'} appearance="outline">
                <Gauge className="size-3" />
                {lang === 'zh' ? `定位剩余 ${geoLeft}/${session.geoQuota}` : `${geoLeft}/${session.geoQuota} left`}
              </Tag>
            </Tooltip>
            {/* → 点「管理」→ SCREEN 4 */}
            <Button variant="outline" size="md" onClick={() => setDrawerOpen(true)}>
              <ShieldBan className="size-4" />
              {lang === 'zh' ? '管理' : 'Manage'}
            </Button>
          </div>
        )}
      </div>

      {/* 概览与明细是同一路径下的两种视角，用 Tabs 就地切换（BI 决策②） */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'summary' | 'detail')}>
        <TabsList variant="line">
          <TabsTrigger value="summary">{lang === 'zh' ? '概览' : 'Summary'}</TabsTrigger>
          <TabsTrigger value="detail">{lang === 'zh' ? '已读明细' : 'Read detail'}</TabsTrigger>
        </TabsList>
        {/* → 切换 Tab → SCREEN 1 ⇄ SCREEN 2 */}
        <TabsContent value="summary" className="pt-4">
          <Screen1_MessageAggregate
            message={{ ...message, isPublic }}
            rows={rows}
            agg={agg ?? undefined}
            lang={lang}
            onOpenDetail={() => setTab('detail')}
          />
        </TabsContent>
        <TabsContent value="detail" className="pt-4">
          {detail}
        </TabsContent>
      </Tabs>

      {canManage && (
        <Screen4_ManageDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          isPublic={isPublic}
          blocks={blocked}
          readCount={payload.visibleTotal}
          lang={lang}
          messageContent={message.content}
          visitorIp={payload.viewerIp}
          onTogglePublic={togglePublic}
          onAddBlock={addBlock}
          onRemoveBlock={removeBlock}
          onDelete={() => void remove()}
        />
      )}
    </div>
  )
}
