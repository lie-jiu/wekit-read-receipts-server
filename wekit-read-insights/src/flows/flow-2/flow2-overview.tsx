// ============================================================
// FLOW 2 of 7: Read Overview & Time Range（已读总览 + 时间维度切换）
// Scenario ref: Data Analytics / BI · Flow 1
//   —— 时间是全局控件，锚在页首，改范围 = 整页重算（BI 决策①）
//   —— 钻取是页内视角切换而非跳转（BI 决策②），本 flow 只做到总览层
// Screens: 3 — Overview 仪表盘 / 时间范围选择器 / 刷新后的仪表盘
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Calendar,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  EllipsisText,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Tag,
  Tooltip,
  TypographyMuted,
} from 'sparkdesign'
import type { ChartConfig } from 'sparkdesign'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  Clock3,
  Eye,
  Globe,
  Info,
  Lock,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { DateRange } from 'react-day-picker'
import { addDays, humanDuration } from '../shared/mock-data'
import type { OverviewDto, MessageDto } from '../../data/overview'
import {
  messagesUrl,
  overviewUrl,
  recentUtcDays,
  toMessageRows,
  toModel,
  tzOfLang,
} from '../../data/overview'
import type { OverviewModel } from '../../data/overview'
import { useList, useResource } from '../../data/hooks'
import { pageItems } from '../shared/pagination'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum, fmtPct, t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type { Message, Session, TimeRange } from '../shared/types'

// ————————————————— 时间与派生统计 —————————————————

const PRESETS: { value: Exclude<TimeRange['preset'], 'custom'>; label: string; days: number }[] = [
  { value: 'today', label: '今日', days: 1 },
  { value: '7d', label: '近 7 天', days: 7 },
  { value: '30d', label: '近 30 天', days: 30 },
  { value: '90d', label: '近 90 天', days: 90 },
]

function daysOfPreset(preset: TimeRange['preset']): number {
  return PRESETS.find((p) => p.value === preset)?.days ?? 30
}

/** 预设 → 具体 from/to，取自日度序列的真实边界 */
function rangeForPreset(preset: Exclude<TimeRange['preset'], 'custom'>): TimeRange {
  const label = PRESETS.find((p) => p.value === preset)?.label ?? '近 30 天'
  // 锚在"今天"而不是"数据最后一天"：区间现在是请求参数，
  // 久未使用的账号一进来也该看到最近的窗口（mock 时代是从日序列尾部截的）
  const to = new Date().toISOString().slice(0, 10)
  const from = addDays(to, -(daysOfPreset(preset) - 1))
  return { preset, from, to, label }
}

/**
 * 从 Date 取本地年月日成 ISO 字符串。
 * 不能用 toISOString()：它先转 UTC，在 UTC+8 机器上会把日期整体前移一天。
 */
function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const chartConfig = {
  reads: { label: '已读', color: 'var(--color-primary)' },
  registrations: { label: '注册消息', color: 'var(--color-info)' },
} satisfies ChartConfig

/** 视图模型 → 本页卡片习惯读的扁平形状（只换名字，不做任何计算） */
function statsOf(m: OverviewModel) {
  return {
    from: m.range.from,
    to: m.range.to,
    reads: m.totalReads,
    readsDelta: m.readsDelta,
    registrations: m.registrations,
    registrationsDelta: m.registrationsDelta,
    messageCount: m.messageCount,
    distinctIps: m.distinctIps,
    coverage: m.coverage,
    avgFirstReadSeconds: m.avgFirstReadSeconds,
    slice: m.trend,
  }
}

/**
 * 加载中 / 取数失败时的占位模型。
 * 只有 count 类是 0（配合骨架屏，用户看不到它们），
 * 所有比值与耗时都是 null —— 万一哪天渲染路径改了，
 * 这里也只会露出「—」，不会露出一个看起来像事实的 0%。
 */
const PLACEHOLDER_MODEL: OverviewModel = {
  range: { from: '', to: '', prevFrom: '', prevTo: '' },
  totalReads: 0,
  totalReadsPrev: 0,
  registrations: 0,
  registrationsPrev: 0,
  readsDelta: null,
  registrationsDelta: null,
  messageCount: 0,
  messageCountPrev: 0,
  messagesWithReads: 0,
  distinctIps: 0,
  coverage: null,
  avgFirstReadSeconds: null,
  trend: [],
  hours: [],
  userAgents: [],
  located: { count: 0, ratio: null },
  regions: [],
  isps: [],
}

// ————————————————— 展示小组件 —————————————————

function DeltaTag({ delta, lang }: { delta: number | null; lang: Lang }) {
  // null = 没有可比的前窗（前窗为 0 或服务器没给这一维）。
  // 这时候什么都不画，而不是画一个 0% 的"持平" —— 那是把一个不知道的东西说成已知。
  if (delta === null) return null
  const rounded = Math.round(Math.abs(delta) * 1000) / 10
  if (rounded === 0)
    return (
      <Tag color="slate" appearance="outline">
        {lang === 'zh' ? '持平' : 'Flat'}
      </Tag>
    )
  const up = delta > 0
  return (
    <Tag color={up ? 'success' : 'error'} appearance="outline">
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {fmtPct(Math.abs(delta), 1)}
    </Tag>
  )
}

function KpiCard({
  title,
  value,
  unit,
  hint,
  delta,
  icon,
  lang,
  loading = false,
  className,
}: {
  title: string
  value: string
  unit?: string
  hint?: string
  /** null / undefined = 没有可比的前窗，不画环比 */
  delta?: number | null
  icon?: ReactNode
  lang: Lang
  loading?: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {icon}
          {title}
          {hint && (
            <Tooltip content={hint} side="top">
              <Info className="size-3.5 text-text-tertiary" />
            </Tooltip>
          )}
        </CardTitle>
        {delta !== undefined && <CardAction>{<DeltaTag delta={delta} lang={lang} />}</CardAction>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums text-text">{value}</span>
            {unit && <span className="text-sm text-text-secondary">{unit}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Spark 无 Sparkline 封装（已 grep components 导出清单确认）。
 * 16 行 × 每行挂一个 recharts 实例对总览页不划算，故手写内联 SVG；
 * 颜色走 currentColor，由外层 token 决定，暗色模式自动跟随。
 */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? 100 / (values.length - 1) : 100
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(20 - (v / max) * 17).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-20 text-text-tertiary" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ————————————————— 屏 2：时间范围选择器 —————————————————

/* ================================================
   FLOW: Read Overview & Time Range
   SCREEN 2 of 3: 时间范围选择器（Popover 展开态）
   ------------------------------------------------
   ENTRY:  SCREEN 1 页首点击时间 Pill
   EXIT:   点预设 → 立即应用并收起 → SCREEN 3（整页重算）
           自定义区间 + "确认" → SCREEN 3
   BRANCH: 点面板外 / Esc → SCREEN 1（范围不变，无副作用）
   ================================================ */
export function Screen2_TimeRange({
  range,
  lang,
  onApply,
}: {
  range: TimeRange
  lang: Lang
  onApply: (next: TimeRange) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>(undefined)

  const applyPreset = (preset: Exclude<TimeRange['preset'], 'custom'>) => {
    onApply(rangeForPreset(preset))
    setOpen(false)
    /* → 点预设 → SCREEN 3: 刷新后的仪表盘 */
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="md" aria-haspopup="dialog">
          <CalendarRange className="size-4" />
          {range.label}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" contentPadding="compact" className="w-80">
        <div className="flex flex-col gap-3 p-1">
          {/* STATE: default — 当前预设无高亮标记以外状态，按钮组常驻 */}
          {/* STATE: filled — 自定义区间首尾都已选，"确认"可用 */}
          {/* STATE: submitting — 不适用，应用是本地即时动作 */}
          {/* STATE: error — 只选了起始日时"确认"保持 disabled，避免半截区间 */}
          <TypographyMuted className="text-xs">
            {lang === 'zh' ? '当前查看' : 'Currently viewing'} · {range.label}
          </TypographyMuted>

          <div className="flex flex-col gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={range.preset === p.value ? 'secondary' : 'ghost'}
                size="sm"
                className="justify-start"
                onClick={() => applyPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <TypographyMuted className="text-xs">{lang === 'zh' ? '自定义区间' : 'Custom range'}</TypographyMuted>
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={(v) => setDraft(v)}
              captionLayout="label"
              /* 不引 date-fns 做直接依赖，中英月份与星期头自己出 */
              formatters={{
                formatCaption: (month) =>
                  lang === 'zh'
                    ? `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`
                    : `${month.toLocaleString('en-US', { month: 'long' })} ${month.getFullYear()}`,
                formatWeekdayName: (weekday) =>
                  lang === 'zh'
                    ? '日一二三四五六'[weekday.getDay()]
                    : weekday.toLocaleDateString('en-US', { weekday: 'short' }),
              }}
              startMonth={new Date('2026-01-01T00:00:00Z')}
              endMonth={new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)}
              /*
               * 绕开 sparkdesign@0.4.11 的 Calendar bug：rdp 会把 calendarMonth / displayIndex
               * 一并传进 MonthCaption，而 Spark 的实现把 ...props 原样铺到 <div> 上，
               * 于是 React 报 "does not recognize the prop on a DOM element"。
               * Spark 的 components 合并顺序是 { ...defaults, ...components }，
               * 使用方覆盖优先，这里等价复刻它的结构并把两个内部 prop 剥掉。
               */
              components={{
                MonthCaption: ({
                  className,
                  children,
                  calendarMonth: _calendarMonth,
                  displayIndex: _displayIndex,
                  ...domProps
                }) => (
                  <>
                    <div className={className} {...domProps}>
                      {children}
                    </div>
                    <Separator className="w-full" />
                  </>
                ),
              }}
              className="text-xs"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!draft?.from || !draft?.to}
              onClick={() => {
                if (!draft?.from || !draft?.to) return
                const from = toISODate(draft.from)
                const to = toISODate(draft.to)
                onApply({ preset: 'custom', from, to, label: `${from} ~ ${to}` })
                setOpen(false)
                /* → 应用自定义区间 → SCREEN 3 */
              }}
            >
              {t(lang, 'confirm')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ————————————————— 共享主体（屏 1 与屏 3 复用同一套 IA）—————————————————

type Phase = 'ready' | 'loading' | 'error' | 'empty-never' | 'empty-filter'

function OverviewBody({
  session,
  model,
  messages,
  totalMessages,
  range,
  lang,
  phase,
  onRangeChange,
  onRetry,
  onOpenMessage,
  onFirstRun,
}: {
  session: Session
  /** GET /stats/overview 投影出来的视图模型；null 只在 loading / error 两态出现 */
  model: OverviewModel | null
  /** 当前已加载的消息行（服务器按 limit 分页，见下方"已加载"提示） */
  messages: Message[]
  /** 全库消息总数（X-Total-Count），用于说明列表是否被截断 */
  totalMessages: number | null
  range: TimeRange
  lang: Lang
  phase: Phase
  onRangeChange: (next: TimeRange) => void
  onRetry?: () => void
  onOpenMessage?: (msg: Message) => void
  onFirstRun?: () => void
}) {
  /*
   * 这一页以前是在浏览器里现算 KPI 的，包括把每条消息的「独立 IP 数」相加 ——
   * 那是错的：同一个 IP 读过两条消息会被数成两个。窗口级去重只能服务器做，
   * 所以现在一个总量都不再前端自算，这里只把 /stats/overview 的模型投影成
   * 卡片们习惯读的形状。
   *
   * 没有数据时用 PLACEHOLDER 而不是可空判断：卡片在 loading 下画的是骨架屏，
   * 这些值根本不会被看到（loading 里显式并上了 model === null），
   * 而满地 stats?.x 会把真正的信息 —— 哪个数缺失 —— 淹没掉。
   * 比值类仍保持 null，宁可显示「—」也不把不知道的说成 0。
   */
  const stats = statsOf(model ?? PLACEHOLDER_MODEL)

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 原项目即 300ms 防抖；≥3 字符走 FTS5 trigram，否则退回 LIKE
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  // 换窗口后原来的页码多半已越界，回到第一页
  useEffect(() => setPage(1), [range.from, range.to])

  const filtered = useMemo(() => {
    const q = debounced.trim()
    const inRange = messages.filter((m) => {
      const d = m.timestamp.slice(0, 10)
      return d >= stats.from && d <= stats.to
    })
    return q ? inRange.filter((m) => m.content.includes(q)) : inRange
  }, [debounced, messages, stats.from, stats.to])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  // 没有模型就等于还没取到数 —— 取数失败时也一样：那时该看到的是骨架 + 顶部的错误条，
  // 而不是一屏 0。两者都算 loading，差别由 phase 决定的那块提示语负责。
  const loading = phase === 'loading' || model === null
  /** 列表里已读条数的相对刻度：本屏内最多的一条。用额度做分母是单位错置（条 vs 次） */
  const readsMax = Math.max(1, ...filtered.map((m) => m.reads))

  const columns = [
    {
      key: 'content',
      header: t(lang, 'message'),
      cell: (row: Message) => (
        <div className="min-w-0 max-w-sm">
          {/* 中文消息正文换行时 1.38 的行高太挤（TableCell 默认值），单独放宽；
              UA / IP 等技术串仍保持紧凑，不牺牲表格密度 */}
          <EllipsisText lines={2} className="leading-relaxed" tooltipContent={row.content}>
            {row.content}
          </EllipsisText>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {row.isPublic ? (
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
            {row.blockedCount > 0 && (
              <Tooltip
                content={
                  lang === 'zh'
                    ? '黑名单命中的访问：服务端不返回其 IP 与定位，数据库记录仍保留'
                    : 'Blocklisted hits: the server omits their IP and geo, rows are kept in the store'
                }
              >
                <Tag color="warning" appearance="outline">
                  {lang === 'zh' ? `屏蔽 ${row.blockedCount}` : `blocked ${row.blockedCount}`}
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'reads',
      header: (
        <span className="flex items-center gap-1">
          {t(lang, 'reads')}
          <Tooltip
            content={
              lang === 'zh'
                ? '该消息的累计已读，不随上方时间范围变化；时间范围只筛消息的发送日。与页首「已读次数」（窗口内发生的已读）口径不同。'
                : 'Lifetime reads for this message; the range filters by send date. Different measure from the windowed "Total reads" KPI.'
            }
          >
            <Info className="size-3 text-text-tertiary" />
          </Tooltip>
        </span>
      ),
      cell: (row: Message) => (
        <div className="w-32">
          <div className="flex items-baseline gap-1">
            <span className="font-medium tabular-nums">{row.reads}</span>
            {/* 原来是「/ 消息额度」：条数是配额、已读是次数，两个单位相除没有意义
                （Lv1 额度 1 条时会画成 39 / 1）。改成本屏内的相对刻度。 */}
            <span className="text-xs text-text-tertiary">/ {readsMax}</span>
          </div>
          <Progress value={row.reads} max={readsMax} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'trend',
      header: lang === 'zh' ? '近 14 天' : 'Last 14d',
      cell: (row: Message) => <Sparkline values={row.dailyReads} />,
    },
    {
      key: 'firstRead',
      header: lang === 'zh' ? '首读耗时' : 'First read',
      cell: (row: Message) => (
        <span className="text-sm text-text-secondary tabular-nums">{humanDuration(row.firstReadSeconds)}</span>
      ),
    },
    {
      key: 'timestamp',
      header: t(lang, 'sentAt'),
      cell: (row: Message) => <span className="text-sm text-text-secondary tabular-nums">{row.timestamp}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row: Message) => (
        <Button variant="text" size="sm" onClick={() => onOpenMessage?.(row)}>
          {lang === 'zh' ? '查看明细' : 'Details'}
          {/* → 点行内「查看明细」→ FLOW 3: 单条消息已读明细钻取 */}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ——— PageHeader：时间是页首全局控件，优先级高于一切维度筛选 ——— */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text">{t(lang, 'navOverview')}</h1>
          <TypographyMuted className="text-sm">
            {stats.from} ~ {stats.to} · {lang === 'zh' ? '对比上一周期' : 'vs previous period'}
          </TypographyMuted>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* → 点击时间 Pill → SCREEN 2: 时间范围选择器 */}
          <Screen2_TimeRange range={range} lang={lang} onApply={onRangeChange} />
          <Button variant="outline" size="md" onClick={onRetry}>
            <RefreshCw className="size-4" />
            {t(lang, 'refresh')}
          </Button>
        </div>
      </div>

      {phase === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>{lang === 'zh' ? '数据加载失败' : 'Could not load data'}</AlertTitle>
          <AlertDescription>
            {lang === 'zh'
              ? '每 10 分钟的增量聚合可能正在执行，稍后重试即可，上次成功的数据不受影响。'
              : 'The 10-minute incremental rollup may be running; the last good snapshot is untouched.'}
            <Button variant="outline" size="sm" className="ms-2" onClick={onRetry}>
              {t(lang, 'retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ——— KPI Bento：手机 1 列 / 平板 2 列 / 桌面 4 列，密度由 data-style=compact 收紧 ——— */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          className="sm:col-span-2"
          lang={lang}
          loading={loading}
          icon={<Eye className="size-4 text-text-secondary" />}
          title={lang === 'zh' ? '已读次数' : 'Total reads'}
          value={fmtNum(stats.reads)}
          unit={t(lang, 'unitTimes')}
          delta={stats.readsDelta}
          hint={
            lang === 'zh'
              ? '逐条计读，同 IP 重复访问各自计入；黑名单命中的不返回也不计数'
              : 'Each hit counts; blocklisted IPs are filtered server-side'
          }
        />
        <KpiCard
          lang={lang}
          loading={loading}
          icon={<Users className="size-4 text-text-secondary" />}
          title={lang === 'zh' ? '独立 IP' : 'Distinct IPs'}
          value={fmtNum(stats.distinctIps)}
          hint={lang === 'zh' ? '范围内各消息 COUNT(DISTINCT ip) 之和，跨消息未再去重' : 'Sum of per-message distinct IPs'}
        />
        <KpiCard
          lang={lang}
          loading={loading}
          icon={<Clock3 className="size-4 text-text-secondary" />}
          title={lang === 'zh' ? '平均首读' : 'Avg. first read'}
          value={humanDuration(stats.avgFirstReadSeconds)}
        />
      </div>

      {/* ——— 趋势 ——— */}
      <Card>
        <CardHeader>
          <CardTitle>{lang === 'zh' ? '已读与注册趋势' : 'Reads & registrations'}</CardTitle>
          <CardDescription>
            {lang === 'zh'
              ? '按 UTC 日界聚合 · read_stats / registration_stats'
              : 'Daily UTC buckets · read_stats / registration_stats'}
          </CardDescription>
          <CardAction>
            <div className="hidden items-center gap-3 text-xs text-text-secondary sm:flex">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                {chartConfig.reads.label}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--color-info)' }} />
                {chartConfig.registrations.label}
              </span>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {/* 外层给确定高度：ChartContainer 自带 aspect-video，在宽高均已定时自然失效 */}
          <div className="h-56 w-full sm:h-64">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <AreaChart data={stats.slice} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="fillReads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillRegistrations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--color-border-tertiary)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.slice(5)}
                    minTickGap={28}
                  />
                  <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Area dataKey="reads" type="natural" fill="url(#fillReads)" stroke="var(--color-primary)" strokeWidth={1.5} />
                  <Area
                    dataKey="registrations"
                    type="natural"
                    fill="url(#fillRegistrations)"
                    stroke="var(--color-info)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ——— 覆盖率 + 次级指标 ——— */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle>{lang === 'zh' ? '读取覆盖率' : 'Read coverage'}</CardTitle>
            <CardDescription>
              {lang === 'zh' ? '至少被读过一次的消息占比' : 'Share of messages read at least once'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              {/* 窗口内没有消息时覆盖率是无定义，不是 0% */}
              <span className="text-2xl font-semibold tabular-nums">
                {stats.coverage === null ? '—' : fmtPct(stats.coverage)}
              </span>
              <TypographyMuted className="text-sm">
                {lang === 'zh' ? `时段内 ${fmtNum(stats.messageCount)} 条消息` : `${fmtNum(stats.messageCount)} messages in range`}
              </TypographyMuted>
            </div>
            <Progress value={stats.coverage === null ? 0 : Math.round(stats.coverage * 100)} max={100} />
          </CardContent>
        </Card>
        <KpiCard
          lang={lang}
          loading={loading}
          title={lang === 'zh' ? '新注册消息' : 'New registrations'}
          value={fmtNum(stats.registrations)}
          unit={t(lang, 'unitItems')}
          delta={stats.registrationsDelta}
        />
        <KpiCard
          lang={lang}
          title={lang === 'zh' ? '定位剩余' : 'Geo lookups left'}
          value={`${session.geoRemaining}`}
          unit={`${t(lang, 'remainingOf')} ${session.geoQuota}${t(lang, 'perDay')}`}
          hint={lang === 'zh' ? 'UTC 0 点重置，每日配额由等级公式决定' : 'Resets 00:00 UTC; quota comes from the level formula'}
        />
      </div>

      {/* ——— 消息表 ——— */}
      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'navMessages')}</CardTitle>
          <CardDescription>
            {/* 列表是一次性取回最近 200 条后在前端筛选/分页的（服务器 /messages 自己是按
                limit+offset 分页的）。总数大于已取回时必须说出来，否则"搜不到"会被当成"没有"。 */}
            {lang === 'zh'
              ? totalMessages !== null && totalMessages > messages.length
                ? `已载入最近 ${fmtNum(messages.length)} 条（全库 ${fmtNum(totalMessages)} 条）· 每页 ${pageSize} 条`
                : `共 ${fmtNum(filtered.length)} 条 · 每页 ${pageSize} 条`
              : totalMessages !== null && totalMessages > messages.length
                ? `Loaded latest ${fmtNum(messages.length)} of ${fmtNum(totalMessages)} · ${pageSize} per page`
                : `${fmtNum(filtered.length)} messages · ${pageSize} per page`}
          </CardDescription>
          <CardAction>
            <div className="w-52 sm:w-64">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <Search className="size-4 text-text-tertiary" />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={lang === 'zh' ? '搜索消息内容' : 'Search content'}
                  aria-label={lang === 'zh' ? '搜索消息内容' : 'Search message content'}
                />
                {query && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      variant="ghost"
                      aria-label={lang === 'zh' ? '清除搜索' : 'Clear search'}
                      onClick={() => setQuery('')}
                    >
                      <X className="size-3.5" />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {phase === 'empty-never' ? (
            /* 空态成因 ①：账号下一条消息都没注册过 —— 给接入引导 */
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Eye className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{lang === 'zh' ? '还没有注册过消息' : 'No messages registered yet'}</EmptyTitle>
                <EmptyDescription>
                  {lang === 'zh'
                    ? '把 WeKit ReadReceipts 客户端指向本站后，发出的消息会自行注册并开始计读，无需手动建单。'
                    : 'Point the WeKit ReadReceipts client at this server; sent messages register themselves.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="primary" size="md" onClick={onFirstRun}>
                  {lang === 'zh' ? '查看接入引导' : 'View setup guide'}
                </Button>
              </EmptyContent>
            </Empty>
          ) : filtered.length === 0 ? (
            /* 空态成因 ②：筛选过严 —— 必须给出"放宽"的具体动作，「暂无数据」不可接受 */
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="size-5" />
                </EmptyMedia>
                <EmptyTitle>
                  {lang === 'zh' ? `没有匹配「${debounced}」的消息` : `Nothing matches “${debounced}”`}
                </EmptyTitle>
                <EmptyDescription>
                  {lang === 'zh'
                    ? '搜索只在当前时间范围内进行，可以清掉关键词，或把时间放宽到近 90 天。'
                    : 'Search is scoped to the current range. Clear the term, or widen to 90 days.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="flex gap-2">
                  <Button variant="outline" size="md" onClick={() => setQuery('')}>
                    {lang === 'zh' ? '清除搜索' : 'Clear search'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => onRangeChange(rangeForPreset('90d'))}
                  >
                    {lang === 'zh' ? '放宽到近 90 天' : 'Widen to 90 days'}
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <ResponsiveTable
                  columns={columns}
                  data={rows}
                  primary="content"
                  compactHidden={['trend', 'firstRead']}
                  metaKey="timestamp"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger size="sm" aria-label={lang === 'zh' ? '每页条数' : 'Page size'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} / {lang === 'zh' ? '页' : 'page'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        text={lang === 'zh' ? '上一页' : 'Previous'}
                        aria-disabled={page === 1}
                        onClick={(e) => {
                          e.preventDefault()
                          setPage((p) => Math.max(1, p - 1))
                        }}
                      />
                    </PaginationItem>
                    {pageItems(page, totalPages).map((item, i) =>
                      item === 'gap' ? (
                        <PaginationItem key={`gap-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === page}
                            onClick={(e) => {
                              e.preventDefault()
                              setPage(item)
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
                          setPage((p) => Math.min(totalPages, p + 1))
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ================================================
   FLOW: Read Overview & Time Range
   SCREEN 1 of 3: Overview 仪表盘（默认近 30 天）
   ------------------------------------------------
   ENTRY:  Sidebar「总览」，或登录后落地页
   EXIT:   点击时间 Pill → SCREEN 2
           点击行内「查看明细」→ FLOW 3
   ================================================ */
export function Screen1_Overview({
  session,
  lang = 'zh',
  model = null,
  messages = [],
  totalMessages = null,
  onRangeChange,
  onOpenMessage,
}: {
  session: Session
  lang?: Lang
  model?: OverviewModel | null
  messages?: Message[]
  totalMessages?: number | null
  onRangeChange?: (next: TimeRange) => void
  onOpenMessage?: (msg: Message) => void
}) {
  return (
    <div className="p-4 sm:p-6">
      <OverviewBody
        session={session}
        model={model}
        messages={messages}
        totalMessages={totalMessages}
        range={rangeForPreset('30d')}
        lang={lang}
        phase="ready"
        onRangeChange={onRangeChange ?? (() => undefined)}
        onOpenMessage={onOpenMessage}
      />
    </div>
  )
}

// → 用户在 SCREEN 2 选定新范围 → SCREEN 3

/* ================================================
   FLOW: Read Overview & Time Range
   SCREEN 3 of 3: 刷新后的仪表盘（新时间范围）
   ------------------------------------------------
   ENTRY:  SCREEN 2 点了预设，或应用了自定义区间
   EXIT:   点击行 → FLOW 3；再改范围 → SCREEN 2
   BRANCH: 聚合任务失败 → 本屏 error 态（inline Alert + 重试，不用 Toast）
           搜索无命中 → 本屏 empty-filter 态（清除搜索 / 放宽范围两个出口）
   ================================================ */
export function Screen3_OverviewRefreshed({
  session,
  range,
  lang = 'zh',
  phase = 'ready',
  model = null,
  messages = [],
  totalMessages = null,
  onRangeChange,
  onOpenMessage,
  onFirstRun,
  onRetry,
}: {
  session: Session
  range: TimeRange
  lang?: Lang
  phase?: Phase
  model?: OverviewModel | null
  messages?: Message[]
  totalMessages?: number | null
  onRangeChange: (next: TimeRange) => void
  onOpenMessage?: (msg: Message) => void
  onFirstRun?: () => void
  onRetry?: () => void
}) {
  return (
    <div className="p-4 sm:p-6">
      <OverviewBody
        session={session}
        model={model}
        messages={messages}
        totalMessages={totalMessages}
        range={range}
        lang={lang}
        phase={phase}
        onRangeChange={onRangeChange}
        onOpenMessage={onOpenMessage}
        onFirstRun={onFirstRun}
        onRetry={onRetry ?? (() => onRangeChange(range))}
      />
    </div>
  )
}

// ————————————————— Flow 组合器 —————————————————

const MESSAGES_FETCH = 200

export function Flow2_Overview({
  session,
  lang = 'zh',
  simulate = 'ready',
  initialPreset = '30d',
  onOpenMessage,
  onFirstRun,
}: {
  session: Session
  lang?: Lang
  /** 评审用：直接落到某个非 happy path 的画面 */
  simulate?: Phase
  initialPreset?: Exclude<TimeRange['preset'], 'custom'>
  onOpenMessage?: (msg: Message) => void
  onFirstRun?: () => void
}) {
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset(initialPreset ?? '30d'))

  const url = useMemo(() => overviewUrl(range.from, range.to, tzOfLang(lang)), [range.from, range.to, lang])
  const listUrl = useMemo(() => messagesUrl({ limit: MESSAGES_FETCH, offset: 0 }), [])
  const overview = useResource<OverviewDto>(url)
  const list = useList<MessageDto>(listUrl)

  const model = useMemo(() => (overview.data ? toModel(overview.data, lang) : null), [overview.data, lang])
  // sparkline 的日期轴：整页共用一份，避免每行各算一次 today
  const days = useMemo(() => recentUtcDays(14), [])
  const messages = useMemo(
    () => toMessageRows(list.data ?? [], days, session.wxId),
    [list.data, days, session.wxId],
  )

  /*
   * simulate 是评审开关，优先级最高；否则由请求状态推出来。
   * empty-never 看的是"这个账号一条消息都没有"，与窗口无关，所以用会话里的计数。
   */
  const phase: Phase =
    simulate !== 'ready'
      ? simulate
      : overview.loading || list.loading
        ? 'loading'
        : overview.error || list.error
          ? 'error'
          : session.messageCount === 0
            ? 'empty-never'
            : 'ready'

  /** 换区间 = 换 URL = useResource 自己会重取并进入 loading，不再需要假延时 */
  const apply = (next: TimeRange) => setRange(next)

  const retry = () => {
    overview.reload()
    list.reload()
  }

  return (
    <Screen3_OverviewRefreshed
      session={session}
      range={range}
      lang={lang}
      phase={phase}
      model={model}
      messages={messages}
      totalMessages={list.total}
      onRangeChange={apply}
      onOpenMessage={onOpenMessage}
      onFirstRun={onFirstRun}
      onRetry={retry}
    />
  )
}

export type { Phase as OverviewPhase }
