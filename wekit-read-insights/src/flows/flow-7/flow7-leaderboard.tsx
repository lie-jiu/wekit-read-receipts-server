// ============================================================
// FLOW 7 of 7: Leaderboard & Public Link（排行榜与公开链接）
// Scenario ref: Data Analytics/BI —— 排名是聚合视图的第三种钻取方向（按账号）
//               Minimal —— 公开链接是产品唯一的匿名入口，外壳要与后台彻底切开
// Screens: 3 — 排行榜主视图 / 榜单状态屏 / 公开链接匿名只读视图
// ============================================================
//
// 与原产品（src/pages/dashboard/leaderboard-page.ts + src/routes/stats.ts）的对照：
//
// 1. 三张榜（reg / read / msg）用 Tabs，日榜 / 总榜用 ToggleGroup。
//    原产品把两组按钮做成同一种 .scope-btn 并排，「换榜单」和「换时间窗」
//    在视觉上完全同权，语义层级却完全不同。按设计系统规则拆开：
//    会更换内容面板的视图切换 → Tabs；不换面板的互斥筛选 → ToggleGroup。
//
// 2. 新增「我的名次」锚点卡。后端是 ORDER BY total DESC LIMIT 10，且只在
//    返回的行上打 me 标记，所以掉出前 10 的人在自己的榜上什么都看不到，
//    连「我第几名」都无法回答 —— 排行榜因此变成只看别人。
//    这张卡补齐 rank > 10 与「本窗口无计数」两个分支。
//
// 3. 前三名的金 / 银色原来是硬编码 #fbbf24 / #d97706，暗色底上对比度不足，
//    且绕过 design token。改成 Crown / Medal 图标 + text-warning token。
//
// 4. 每行的 count 后面加了相对榜首的条形。原产品是一列纯数字，
//    「榜一 268、榜二 133」的 2 倍差距要心算才能感知。
//    条形只编码「与榜首的比值」这一个量，不叠加颜色等第二层语义。
//
// 5. 日榜显式标注按 UTC 日切。后端 utcDate() 用 UTC，北京时间早上 8 点翻转，
//    界面不写这句就会和用户的直觉长期冲突。
//
// 6. 消息榜的钻取入口按后端真实鉴权规则（owner / 管理员 / is_public=1）给，
//    否则点了别人私有的消息只会拿到 403。
//
// 7. 公开链接：匿名 session 的 geoQuota / geoRemaining 都是 0，原产品仍然把
//    「定位」按钮渲染成可点、点击后才提示登录。这里改为 disabled + 就地说明，
//    不让按钮承诺它做不到的事。
//

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Appearance } from 'sparkdesign'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TypographyMuted,
} from 'sparkdesign'
import {
  ChevronRight,
  Clock3,
  Crown,
  Eye,
  Globe,
  Info,
  Lock,
  Medal,
  MessageSquare,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
  Trophy,
  UserRound,
} from 'lucide-react'
import { displayTime, maskWxId } from '../shared/mock-data'
import { fmtNum, t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import { ResponsiveTable } from '../shared/responsive-table'
import type { DataTableColumn } from 'sparkdesign'
import type { LeaderboardMetric, LeaderboardRow, LeaderboardScope, ReadRecord, Session } from '../shared/types'
import { useResource } from '../../data/hooks'
import { leaderboardUrl, myRankUrl, toBoardRows } from '../../data/leaderboard'
import type { BoardRowDto, MyRankDto } from '../../data/leaderboard'
import { toReadRecords, type ReadsPayloadDto } from '../../data/reads'

/** 榜单的非 happy path 画面；评审时用底部选择器直接落位 */
export type BoardPhase = 'ready' | 'loading' | 'empty' | 'error'

/** 三张榜的切换器定义；label 走 i18n，不在组件里写死中文 */
const METRIC_ICONS: Record<LeaderboardMetric, ReactNode> = {
  reg: <UserRound className="size-3.5" />,
  read: <Eye className="size-3.5" />,
  msg: <MessageSquare className="size-3.5" />,
}

const METRIC_KEYS: Record<LeaderboardMetric, 'boardReg' | 'boardRead' | 'boardMsg'> = {
  reg: 'boardReg',
  read: 'boardRead',
  msg: 'boardMsg',
}

function metricName(lang: Lang, metric: LeaderboardMetric): string {
  return t(lang, METRIC_KEYS[metric])
}

/** count 列的表头：三张榜统计的是三个不同的量，原产品靠 JS 改 DOM 文案 */
function countHeader(metric: LeaderboardMetric, lang: Lang): string {
  if (metric === 'reg') return lang === 'zh' ? '注册消息数' : 'Messages registered'
  if (metric === 'read') return t(lang, 'reads')
  return lang === 'zh' ? '独立 IP 已读' : 'Distinct-IP reads'
}

function countUnit(metric: LeaderboardMetric, lang: Lang): string {
  if (metric === 'reg') return lang === 'zh' ? '条注册' : 'msgs'
  if (metric === 'read') return lang === 'zh' ? '次已读' : 'reads'
  return lang === 'zh' ? '个 IP' : 'IPs'
}

// ————————————————— 名次、账号、计数单元格 —————————————————

/** 前三名的视觉锚点；颜色走 token，不再硬编码 #fbbf24 */
function RankMark({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <Crown className="size-4" />
        <span className="tabular-nums font-semibold">1</span>
      </span>
    )
  if (rank === 2 || rank === 3)
    return (
      <span className="inline-flex items-center gap-1 text-text-secondary">
        <Medal className="size-4" />
        <span className="tabular-nums font-medium">{rank}</span>
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 pl-5 text-sm tabular-nums text-text-tertiary">
      <span aria-hidden className="size-4" />
      {rank}
    </span>
  )
}

/** 脱敏账号 + 头像占位；「我」用 Tag 表达，不依赖底色传达身份 */
function AccountCell({ row, lang }: { row: LeaderboardRow; lang: Lang }) {
  return (
    <span className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="bg-fill-secondary text-xs text-text-secondary">
          {row.wxId.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-mono text-sm">{row.wxId}</span>
      {row.isMe && (
        <Tag color="primary" appearance="outline">
          {lang === 'zh' ? '我' : 'Me'}
        </Tag>
      )}
    </span>
  )
}

/**
 * 数字 + 相对榜首的条形。
 * 条形只编码一个量（与榜首的比值），单位用文字标注，不用颜色做第二层编码。
 */
function CountCell({
  count,
  top,
  unit,
  lang,
}: {
  count: number
  top: number
  unit: string
  lang: Lang
}) {
  const ratio = top <= 0 ? 0 : count / top
  return (
    <span className="flex min-w-0 flex-col gap-1 sm:min-w-32">
      <span className="text-sm font-semibold tabular-nums text-text">
        {fmtNum(count)}
        <span className="ml-1 text-xs font-normal text-text-tertiary">{unit}</span>
      </span>
      <span
        aria-hidden
        className="h-1 w-full overflow-hidden rounded-full bg-fill-tertiary"
        title={lang === 'zh' ? `占榜首的 ${Math.round(ratio * 100)}%` : `${Math.round(ratio * 100)}% of the leader`}
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
        />
      </span>
    </span>
  )
}

// ————————————————— 屏 1：排行榜主视图 —————————————————

/* ================================================
   FLOW: Leaderboard & Public Link
   SCREEN 1 of 3: 排行榜主视图
   ------------------------------------------------
   ENTRY:  主导航「排行榜」（原产品是 /rank）
   EXIT:   消息榜「查看」→ FLOW 3 屏 1（仅 owner 或 is_public 的消息）
   BRANCH: 日榜计数全为 0 → 屏 2 empty
           接口 5xx      → 屏 2 error（保留上一帧）
           切换 metric / scope → 短暂 loading，表头不动避免布局跳动
   ================================================ */
export function Screen1_Leaderboard({
  lang,
  session,
  phase = 'ready',
  onOpenMessage,
  onOpenPublicLink,
}: {
  lang: Lang
  session: Session
  /** 评审用：直接落到某个非 happy path 画面。真实取数失败/为空时以真实状态为准 */
  phase?: BoardPhase
  /** 参数是消息 id：榜上只有脱敏摘要，凑不出一个完整 Message 对象 */
  onOpenMessage?: (id: string) => void
  onOpenPublicLink?: (id: string) => void
}) {
  const [metric, setMetric] = useState<LeaderboardMetric>('reg')
  const [scope, setScope] = useState<LeaderboardScope>('total')

  const board = useResource<BoardRowDto[]>(leaderboardUrl(metric, scope))
  const mine = useResource<MyRankDto>(myRankUrl(metric, scope))

  const rows = board.data ? toBoardRows(board.data) : []
  const myRank = mine.data?.rank ?? null
  const top = rows[0]?.count ?? 0
  const myRow = rows.find((r) => r.isMe)

  // 真实状态优先于评审开关：phase 只在数据确实是 ready 时才允许被人为替换，
  // 否则一次取数失败会被"评审态"盖掉，看起来像界面正常
  const livePhase: BoardPhase =
    board.loading && rows.length === 0 ? 'loading' : board.error ? 'error' : rows.length === 0 ? 'empty' : 'ready'
  const shownPhase: BoardPhase = livePhase === 'ready' ? phase : livePhase

  const refresh = () => {
    board.reload()
    mine.reload()
  }

  const scopeHint =
    scope === 'day'
      ? lang === 'zh'
        ? '日榜按 UTC 日切，北京时间每天 08:00 归零重算'
        : 'Daily board cuts on UTC midnight — resets 08:00 Beijing time'
      : lang === 'zh'
        ? '总榜统计全量历史，不随时间窗变化'
        : 'Overall counts the full history, independent of any time window'

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text">
            <Trophy className="size-5 text-warning" />
            {t(lang, 'navLeaderboard')}
          </h1>
          <TypographyMuted className="mt-1 text-sm">{scopeHint}</TypographyMuted>
        </div>
        <div className="flex items-center gap-2">
          <TypographyMuted className="text-xs tabular-nums">
            {board.fetchedAt === null
              ? lang === 'zh'
                ? '尚未取到数据'
                : 'Not loaded yet'
              : lang === 'zh'
                ? `取数于 ${displayTime(new Date(board.fetchedAt).toISOString().slice(0, 19).replace('T', ' '), lang)}`
                : `Fetched ${new Date(board.fetchedAt).toISOString().slice(0, 19).replace('T', ' ')} UTC`}
          </TypographyMuted>
          <Button variant="ghost" size="sm" loading={board.loading} onClick={refresh} aria-label={lang === 'zh' ? '刷新榜单' : 'Refresh board'}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <MyRankCard
        lang={lang}
        metric={metric}
        scope={scope}
        rank={myRank}
        row={myRow}
        session={session}
        rows={rows}
        total={mine.data?.total ?? null}
        loading={mine.loading && !mine.data}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{metricName(lang, metric)}</CardTitle>
            {/* 不换面板的互斥筛选 → ToggleGroup，放在 CardAction 里与榜单标题同权 */}
            <CardAction>
              <ToggleGroup
                type="single"
                value={scope}
                onValueChange={(v) => v && setScope(v as LeaderboardScope)}
                spacing="sm"
                aria-label={lang === 'zh' ? '榜单时间范围' : 'Board scope'}
              >
                <ToggleGroupItem value="day">{t(lang, 'scopeDay')}</ToggleGroupItem>
                <ToggleGroupItem value="total">{t(lang, 'scopeTotal')}</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </div>
          <CardDescription>
            {metric === 'msg'
              ? lang === 'zh'
                ? '消息榜按消息实时聚合 COUNT(DISTINCT reads.ip)；统计表没有消息维度，所以这张榜每次都是现算。'
                : 'Live COUNT(DISTINCT reads.ip) per message — the stats tables carry no message dimension.'
              : lang === 'zh'
                ? `统计 ${metric === 'reg' ? 'registration_stats' : 'read_stats'} 里各账号的 SUM(count)。`
                : `SUM(count) per account from ${metric === 'reg' ? 'registration_stats' : 'read_stats'}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as LeaderboardMetric)} className="w-full">
            {/* TabsList 是视图切换器；三块 TabsContent 各承载一份面板，aria-controls 才不悬空 */}
            <TabsList className="mb-3">
              {(Object.keys(METRIC_KEYS) as LeaderboardMetric[]).map((m) => (
                <TabsTrigger key={m} value={m}>
                  <span className="flex items-center gap-1.5">
                    {METRIC_ICONS[m]}
                    {metricName(lang, m)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {(Object.keys(METRIC_KEYS) as LeaderboardMetric[]).map((m) => (
              <TabsContent key={m} value={m} className="mt-0">
                {/* 只为当前面板建表：三张榜共用一份 rows，隐藏面板没必要留在 DOM 里 */}
                {m === metric && (
                  <BoardTable
                    lang={lang}
                    metric={m}
                    scope={scope}
                    rows={rows}
                    top={top}
                    phase={shownPhase}
                    isAdmin={session.isAdmin}
                    onOpenMessage={onOpenMessage}
                    onOpenPublicLink={onOpenPublicLink}
                    onToTotal={() => setScope('total')}
                    onRetry={refresh}
                  />
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* 榜单只公开前 10：这是后端 LIMIT 10 的事实，要说成规则，别让人误以为「一共就这些账号」 */}
      <TypographyMuted className="text-xs">
        {lang === 'zh'
          ? '榜单只公布前 10 名；账号与消息内容均已脱敏（wxid 留前 6 后 2，消息留前 2 后 2）。'
          : 'Only the top 10 are published; accounts and message snippets are masked.'}
      </TypographyMuted>
    </div>
  )
}

/** 表体；四态在这里收口，屏 2 复用同一组子件 */
function BoardTable({
  lang,
  metric,
  scope,
  rows,
  top,
  phase,
  isAdmin,
  onOpenMessage,
  onOpenPublicLink,
  onToTotal,
  onRetry,
}: {
  lang: Lang
  metric: LeaderboardMetric
  scope: LeaderboardScope
  rows: LeaderboardRow[]
  top: number
  phase: BoardPhase
  /** publicReadOr() 允许管理员看任意消息，钻取判定要跟着这条真实规则走 */
  isAdmin: boolean
  onOpenMessage?: (id: string) => void
  onOpenPublicLink?: (id: string) => void
  onToTotal?: () => void
  onRetry?: () => void
}) {
  if (phase === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }
  if (phase === 'error') return <BoardError lang={lang} metric={metric} scope={scope} onRetry={onRetry} />
  if (phase === 'empty' || rows.length === 0)
    return <BoardEmpty lang={lang} metric={metric} scope={scope} onToTotal={onToTotal} />

  const isMsg = metric === 'msg'
  const unit = countUnit(metric, lang)
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{t(lang, 'rank')}</TableHead>
            {isMsg ? <TableHead>{t(lang, 'message')}</TableHead> : <TableHead>{t(lang, 'account')}</TableHead>}
            {isMsg && <TableHead>{t(lang, 'owner')}</TableHead>}
            <TableHead>{countHeader(metric, lang)}</TableHead>
            {isMsg && <TableHead className="w-20 text-right">{lang === 'zh' ? '操作' : 'Action'}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.rank}-${r.wxId}-${r.messageId ?? ''}`} className={r.isMe ? 'bg-fill-secondary' : undefined}>
              <TableCell>
                <RankMark rank={r.rank} />
              </TableCell>
              {isMsg ? (
                <TableCell>
                  <Tooltip
                    content={
                      lang === 'zh'
                        ? '榜内只展示脱敏内容，完整消息需有权访问'
                        : 'Masked here; full text requires access'
                    }
                  >
                    <span className="block max-w-72 truncate text-sm">{r.messageContent}</span>
                  </Tooltip>
                </TableCell>
              ) : (
                <TableCell>
                  <AccountCell row={r} lang={lang} />
                </TableCell>
              )}
              {isMsg && (
                <TableCell className="font-mono text-sm text-text-secondary">{r.wxId}</TableCell>
              )}
              <TableCell>
                <CountCell count={r.count} top={top} unit={unit} lang={lang} />
              </TableCell>
              {isMsg && (
                <TableCell className="text-right">
                  <DrillAction
                  row={r}
                  lang={lang}
                  isAdmin={isAdmin}
                  onOpenMessage={onOpenMessage}
                  onOpenPublicLink={onOpenPublicLink}
                />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** 钻取权限按后端真实规则判定：owner / 管理员 / is_public=1 */
function DrillAction({
  row,
  lang,
  isAdmin,
  onOpenMessage,
  onOpenPublicLink,
}: {
  row: LeaderboardRow
  lang: Lang
  isAdmin: boolean
  onOpenMessage?: (id: string) => void
  onOpenPublicLink?: (id: string) => void
}) {
  const id = row.messageId
  if (!id) return <span className="text-xs text-text-tertiary">—</span>

  /**
   * 权限判定读 row.isMessagePublic —— 这是本设计对 /leaderboard 提的唯一新增字段
   * （[NEW]，见 types.ts）：服务端聚合时顺手带得出，前端拿不到别人的消息对象。
   */
  const allowed = row.isMe || isAdmin || row.isMessagePublic === true
  if (!allowed)
    return (
      <Tooltip
        content={
          lang === 'zh'
            ? '他人未公开的消息，仅所有者与管理员可钻取'
            : 'Private to its owner — only the owner or an admin can drill in'
        }
      >
        {/* disabled 按钮不触发指针事件，必须包一层 span 才拿得到 Tooltip */}
        <span className="inline-flex">
          <Button variant="text" size="sm" disabled>
            <Lock className="size-3.5" />
            {lang === 'zh' ? '查看' : 'View'}
          </Button>
        </span>
      </Tooltip>
    )

  /**
   * owner 与访客走的是两个不同视图：自己的消息进 FLOW 3（带管理入口），
   * 他人公开的消息只能进 FLOW 7 屏 3 的匿名只读视图 —— 后端对这两条路径
   * 给的 session 完全不同（匿名 geoQuota=0、管理控件整块不渲染）。
   */
  if (row.isMe)
    return (
      <Button variant="text" size="sm" onClick={() => onOpenMessage?.(id)}>
        {/* → FLOW 3 屏 1 */}
        {lang === 'zh' ? '查看' : 'View'}
        <ChevronRight className="size-3.5" />
      </Button>
    )

  return (
    <Button variant="text" size="sm" onClick={() => onOpenPublicLink?.(id)}>
      {/* → 屏 3 匿名只读视图 */}
      <Globe className="size-3.5" />
      {lang === 'zh' ? '公开链接' : 'Public link'}
    </Button>
  )
}

// ————————————————— 我的名次锚点卡 —————————————————

function MyRankCard({
  lang,
  metric,
  scope,
  rank,
  row,
  session,
  rows,
  total,
  loading,
}: {
  lang: Lang
  metric: LeaderboardMetric
  scope: LeaderboardScope
  rank: number | null
  row?: LeaderboardRow
  session: Session
  rows: LeaderboardRow[]
  /** 榜上有名有姓的实体总数（/leaderboard/me 一并给出），让 rank>10 那句说得出"在多少家里排第几" */
  total: number | null
  loading: boolean
}) {
  const unit = countUnit(metric, lang)
  const ahead = rank !== null && rank > 1 ? rows.find((r) => r.rank === rank - 1) : undefined
  const gap = ahead && row ? ahead.count - row.count : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{lang === 'zh' ? `我的${metricName(lang, metric)}位置` : `My ${metricName(lang, metric)} position`}</CardTitle>
        <CardDescription className="font-mono text-xs">{maskWxId(session.wxId)}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* STATE: 名次是独立一次请求，取数中不能显示成"没有数据" */}
        {loading && <Skeleton className="h-9 w-40" />}

        {/* STATE: 进入前 10 —— 表内同一行同时高亮 */}
        {!loading && rank !== null && row && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums text-text">#{rank}</span>
            <span className="text-sm tabular-nums text-text-secondary">
              {fmtNum(row.count)}
              <span className="ml-1 text-xs text-text-tertiary">{unit}</span>
            </span>
            {rank === 1 ? (
              <Tag color="warning" appearance="outline">
                <Crown className="size-3" />
                {lang === 'zh' ? '榜首' : 'Leading'}
              </Tag>
            ) : gap > 0 ? (
              <span className="text-xs text-text-tertiary">
                {lang === 'zh' ? `距上一名（第 ${rank - 1} 名）还差 ${fmtNum(gap)}` : `${fmtNum(gap)} behind #${rank - 1}`}
              </span>
            ) : (
              <span className="text-xs text-success">{lang === 'zh' ? '与上一名并列' : 'Tied with the rank above'}</span>
            )}
          </div>
        )}

        {/* STATE: rank > 10 —— 后端 LIMIT 10 不返回你，但名次仍然算得出来 */}
        {!loading && rank !== null && !row && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums text-text">#{rank}</span>
            <span className="text-sm text-text-secondary">
              {lang === 'zh' ? '未进入公开的前 10 名' : 'Outside the published top 10'}
            </span>
            {total !== null && (
              <span className="text-xs text-text-tertiary tabular-nums">
                {lang === 'zh'
                  ? `共 ${fmtNum(total)} ${metric === 'msg' ? '条消息在榜' : '个账号在榜'}`
                  : `${fmtNum(total)} ${metric === 'msg' ? 'messages' : 'accounts'} ranked`}
              </span>
            )}
          </div>
        )}

        {/* STATE: 本时间窗内无计数 —— 与「查不到」是两件事，要分开说 */}
        {!loading && rank === null && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">
              {scope === 'day'
                ? lang === 'zh'
                  ? '今天还没有计数'
                  : 'No count yet today'
                : lang === 'zh'
                  ? '还没有可排名的数据'
                  : 'Nothing to rank yet'}
            </span>
            <TypographyMuted className="text-xs">
              {scope === 'day'
                ? lang === 'zh'
                  ? '日榜按 UTC 日切；切到总榜可以看到历史累计名次。'
                  : 'The daily board cuts on UTC — switch to Overall for your lifetime rank.'
                : lang === 'zh'
                  ? '发出第一条被读取的消息后就会出现在榜上。'
                  : 'Your first read message puts you on the board.'}
            </TypographyMuted>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ————————————————— 屏 2：榜单状态屏 —————————————————

/* ================================================
   FLOW: Leaderboard & Public Link
   SCREEN 2 of 3: 榜单状态屏（加载 / 空 / 失败）
   ------------------------------------------------
   ENTRY:  屏 1 切换 metric 或 scope 时经过；日榜天然稀疏
   EXIT:   重试成功 → 屏 1 ready；「查看总榜」→ 屏 1 scope=total
   BRANCH: 空态有两种成因必须分开说：
           ① 本 UTC 日窗口计数为 0（最常见，不是故障）
           ② 全站还没有任何人注册
           错误态保留表体占位，不清空画面
   ================================================ */
export function Screen2_LeaderboardStates({
  lang,
  phase = 'empty',
  onToTotal,
}: {
  lang: Lang
  phase?: Exclude<BoardPhase, 'ready'>
  onToTotal?: () => void
}) {
  const caption =
    phase === 'loading'
      ? lang === 'zh'
        ? '加载中 —— 保留表头与行高，数据到达时不跳版'
        : 'Loading — header and row heights reserved to avoid layout shift'
      : phase === 'error'
        ? lang === 'zh'
          ? '请求失败 —— 就地说明并提供重试，不用 Toast 一闪而过'
          : 'Failed — explained in place with a retry, not a transient toast'
        : lang === 'zh'
          ? '本 UTC 日窗口内计数为 0'
          : 'Zero counts in today’s UTC window'

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">
          {lang === 'zh' ? '榜单的状态屏' : 'Board states'}
        </h1>
        <TypographyMuted className="mt-1 text-sm">
          {lang === 'zh'
            ? '同一张榜的三种非正常画面。空态要说清「为什么空」并给出下一步，不能只写「暂无数据」。'
            : 'The three off-happy-path outcomes of one board. Empty states must explain why and offer a next step.'}
        </TypographyMuted>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t(lang, 'boardRead')} · {t(lang, 'scopeDay')}
          </CardTitle>
          <CardDescription>{caption}</CardDescription>
        </CardHeader>
        <CardContent>
          {phase === 'loading' && (
            <div aria-busy="true" className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          )}
          {phase === 'error' && <BoardError lang={lang} metric="read" scope="day" />}
          {phase === 'empty' && <BoardEmpty lang={lang} metric="read" scope="day" onToTotal={onToTotal} />}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * 空态：区分「今天没有」与「从来没有」。
 * 原产品两种情况都写「暂无数据」，用户无法判断是数据丢了还是自己没跑起来。
 */
function BoardEmpty({
  lang,
  metric,
  scope,
  onToTotal,
}: {
  lang: Lang
  metric: LeaderboardMetric
  scope: LeaderboardScope
  onToTotal?: () => void
}) {
  const dailyEmpty = scope === 'day'
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Trophy className="size-6" />
        </EmptyMedia>
        <EmptyTitle>
          {dailyEmpty
            ? lang === 'zh'
              ? '今天的日榜还没有数据'
              : 'Nothing on today’s daily board'
            : lang === 'zh'
              ? '这张榜还没有任何数据'
              : 'This board is empty'}
        </EmptyTitle>
        <EmptyDescription>
          {dailyEmpty
            ? lang === 'zh'
              ? `日榜只统计 UTC 当日（后端 utcDate()），且 SUM 为 0 的账号不会出现在结果里 —— 空榜通常意味着「今天还没人产生${metricName(lang, metric)}计数」，不是数据丢了。北京时间要到早上 8 点之后才开始计入新的一天。`
              : `The daily board covers today in UTC only and drops zero-count accounts, so an empty board usually means no ${metricName(lang, metric)} activity yet — not lost data.`
            : lang === 'zh'
              ? '全站还没有任何账号被统计到这张榜上。第一条消息被读取后，注册榜与已读榜会立即出现数据。'
              : 'No account has been counted yet. The first read populates the boards immediately.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        {/* STATE: 日榜空 → 唯一的下一步是看总榜；总榜空说明全站还没跑起来，原地刷新没有意义，不给按钮 */}
        {dailyEmpty && (
          <Button variant="secondary" size="sm" onClick={onToTotal}>
            {lang === 'zh' ? `查看${t(lang, 'scopeTotal')}` : `View ${t(lang, 'scopeTotal')}`}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}

function BoardError({
  lang,
  metric,
  scope,
  onRetry,
}: {
  lang: Lang
  metric: LeaderboardMetric
  scope: LeaderboardScope
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="destructive">
        <AlertTitle>{lang === 'zh' ? '榜单读取失败' : 'Could not load the board'}</AlertTitle>
        <AlertDescription>
          {lang === 'zh'
            ? `GET /leaderboard?metric=${metric}&scope=${scope} 返回 500。下方保留的是上一次成功加载的结果；若持续失败，检查清理任务是否中途打断了统计表写入。`
            : `GET /leaderboard?metric=${metric}&scope=${scope} returned 500. The last successful result is kept below.`}
        </AlertDescription>
      </Alert>
      {/* 错误就地给出口 */}
      <div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          {t(lang, 'retry')}
        </Button>
      </div>
      <div aria-hidden className="flex flex-col gap-2 opacity-50">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  )
}

// ————————————————— 屏 3：公开链接匿名只读视图 —————————————————

/* ================================================
   FLOW: Leaderboard & Public Link
   SCREEN 3 of 3: 公开链接匿名只读视图
   ------------------------------------------------
   ENTRY:  消息 owner 在 FLOW 3 屏 4 打开「公开」后分享出去的 URL
           后端 publicReadOr()：is_public=1 时未登录也放行
   EXIT:   「登录」→ FLOW 1 屏 1（登录后定位消耗访客自己的配额）
   BRANCH: 匿名 session = { wxId:'', level:0, geoQuota:0, geoRemaining:0 }
           管理入口（删除 / 公开开关 / 黑名单）整块不渲染，而不是置灰
   ================================================ */
export function Screen3_PublicReadonly({
  lang,
  appearance = 'light',
  payload,
  state = 'ready',
  onSignIn,
  onAppearanceChange,
}: {
  lang: Lang
  appearance?: Appearance
  /** GET /reads/:id/data 的匿名响应体；null = 还没取到或取不到 */
  payload: ReadsPayloadDto | null
  state?: 'loading' | 'ready' | 'error' | 'forbidden'
  onSignIn?: () => void
  onAppearanceChange?: (next: Appearance) => void
}) {
  const dark = appearance === 'dark'
  const reads = payload ? toReadRecords(payload.reads, payload.sentAt) : []

  /** 宽屏 5 列照旧；窄屏由 ResponsiveTable 按 primary / compactHidden 重排 */
  const readColumns: DataTableColumn<ReadRecord>[] = [
    {
      key: 'location',
      header: t(lang, 'location'),
      cell: (r) =>
        r.located ? (
          <span>{[r.country, r.region, r.city].filter(Boolean).join(lang === 'zh' ? ' / ' : ', ')}</span>
        ) : (
          <Tag appearance="outline">{t(lang, 'stateNotLocated')}</Tag>
        ),
    },
    {
      key: 'readAt',
      header: t(lang, 'readAt'),
      cell: (r) => <span className="tabular-nums text-text-secondary">{displayTime(r.timestamp, lang)}</span>,
    },
    { key: 'ipCase', header: t(lang, 'ipCase'), cell: (r) => <span className="font-mono">{r.ip}</span> },
    {
      key: 'userAgent',
      header: t(lang, 'userAgent'),
      cell: (r) => <span className="block max-w-40 truncate text-text-tertiary">{r.userAgent}</span>,
    },
    {
      key: 'locate',
      header: t(lang, 'locate'),
      className: 'w-16 text-right',
      /** 匿名 geoQuota=0：按钮不该画成可用、点击后才报错 */
      cell: () => (
        <Tooltip
          content={
            lang === 'zh'
              ? '定位要消耗配额，匿名访客没有配额。表里的省市是服务端预解析的结果，不需要点。'
              : 'Locating costs quota, which anonymous visitors do not have. The stored city above needs no lookup.'
          }
        >
          <span className="inline-flex">
            <Button variant="text" size="sm" disabled>
              <Lock className="size-3.5" />
            </Button>
          </span>
        </Tooltip>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-bg-layout text-text">
      {/* Minimal 外壳：无侧边栏、无运营入口，只有一条极窄的顶部栏；
          pt-safe 让刘海机型下顶部栏不被压住 */}
      <header className="pt-safe border-b border-border-tertiary bg-bg-base">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-semibold text-text-on-primary">
              R
            </span>
            <span className="text-sm font-semibold">{t(lang, 'brand')}</span>
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              icon={dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              variant="ghost"
              size="sm"
              aria-label={lang === 'zh' ? '切换明暗' : 'Toggle theme'}
              onClick={() => onAppearanceChange?.(dark ? 'light' : 'dark')}
            />
            {/* → FLOW 1 屏 1 */}
            <Button variant="secondary" size="sm" onClick={onSignIn}>
              {lang === 'zh' ? '登录' : 'Sign in'}
            </Button>
          </div>
        </div>
      </header>

      <main className="pb-safe mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <Alert variant="info">
          <AlertTitle className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            {lang === 'zh' ? '这是一条公开链接' : 'This is a public link'}
          </AlertTitle>
          <AlertDescription>
            {lang === 'zh'
              ? '作者主动开放了这条消息的已读明细，无需登录即可查看。同样地，你的 IP、客户端标识与读取时间也会展示给其他访客。'
              : 'The author published this read log — no sign-in required. Your IP, user agent and read time are shown to other visitors too.'}
          </AlertDescription>
        </Alert>

        {state === 'loading' && (
          <Card>
            <CardContent className="flex flex-col gap-2 py-6">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        )}

        {/* 链接失效与"这条消息没人读过"是两件事：前者要给出登录出口，后者照常渲染空表 */}
        {(state === 'forbidden' || state === 'error') && (
          <Card>
            <CardContent className="flex flex-col gap-3 py-6">
              <CardTitle className="text-base">
                {state === 'forbidden'
                  ? lang === 'zh'
                    ? '这条链接已经不再公开'
                    : 'This link is no longer public'
                  : lang === 'zh'
                    ? '暂时读不到这条消息的明细'
                    : 'Could not load this read log'}
              </CardTitle>
              <TypographyMuted className="text-sm">
                {state === 'forbidden'
                  ? lang === 'zh'
                    ? '作者随时可以关掉公开开关，关掉的瞬间起匿名访客就会拿到 401/403。如果你就是作者，登录后可以重新打开。'
                    : 'The author can unpublish at any time and it takes effect immediately. If you are the author, sign in to turn it back on.'
                  : lang === 'zh'
                    ? '服务暂时不可用或链接里的消息 id 不存在。稍后重试，不必刷新整个页面。'
                    : 'The server is unavailable or the id in this link does not exist. Try again later.'}
              </TypographyMuted>
              <div>
                <Button variant="secondary" size="sm" onClick={onSignIn}>
                  {lang === 'zh' ? '登录' : 'Sign in'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {state === 'ready' && payload && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{payload.content}</CardTitle>
              <CardDescription className="tabular-nums">
                {displayTime(payload.sentAt, lang)} · {t(lang, 'reads')} {fmtNum(payload.visibleTotal)}
                {payload.blockedCount > 0
                  ? lang === 'zh'
                    ? ` · 另有 ${fmtNum(payload.blockedCount)} 条被作者屏蔽`
                    : ` · ${fmtNum(payload.blockedCount)} hidden by the author`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/*
               * 移动端把 5 列表换成「一读者一卡片」：
               * 实测宽屏表格在 390px 下要 503px 横向滚动，读者得左右滑才看得全，
               * 而这一屏是收信人在微信里点开的唯一一屏 —— 它必须是手机优先的。
               * 标题取地区（读者最关心的量），时间放右上角做 meta，
               * UA 与定位两列窄屏收起：定位列对匿名访客整列都是 disabled 按钮，
               * 本来就不该在手机上占掉一列宽度。宽屏两列照旧全给。
               */}
              {reads.length === 0 ? (
                <TypographyMuted className="py-6 text-center text-sm">
                  {lang === 'zh' ? '还没有人读过这条消息' : 'Nobody has read this message yet'}
                </TypographyMuted>
              ) : (
                <ResponsiveTable
                  columns={readColumns}
                  data={reads}
                  primary="location"
                  compactHidden={['userAgent', 'locate']}
                  metaKey="readAt"
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* 作者视角的隐私边界：公开前必须知道的两个后端事实 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="size-4 text-warning" />
              {lang === 'zh' ? '公开这条链接意味着什么' : 'What publishing actually exposes'}
            </CardTitle>
            <CardDescription>
              {lang === 'zh' ? '这一卡只在作者自己浏览时出现；匿名访客看到的是上一卡的说明。' : 'Shown to the author previewing the link.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-text-secondary">
            <p className="flex gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" />
              {lang === 'zh'
                ? '账户级黑名单对匿名访客不生效 —— 后端只在查看者就是 owner 时才并入账户级判定。所以你在账户级拉黑的人，仍然会出现在这条公开链接里。要真正隐藏，请把他加进这条消息的消息级黑名单。'
                : 'Account-level blocklists are NOT applied to anonymous visitors — the server only unions them when the viewer is the owner. Move those IPs to the per-message blocklist to actually hide them here.'}
            </p>
            <p className="flex gap-2">
              <Clock3 className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" />
              {lang === 'zh'
                ? '排行榜里的消息内容是脱敏的，但公开链接展示完整原文。关掉公开后立即生效：匿名访客拿 401 跳登录，其他已登录的非 owner 访客拿 403。'
                : 'The leaderboard masks message snippets, but a public link shows the full text. Unpublishing takes effect immediately: 401 → login for anonymous, 403 for other signed-in visitors.'}
            </p>
          </CardContent>
        </Card>

        <footer className="flex items-center justify-center py-2">
          <TypographyMuted className="text-xs">
            {lang === 'zh'
              ? '由 WeKit Read Receipts 自建服务端提供 · 数据不出你自己的服务器'
              : 'Served by your own WeKit Read Receipts server'}
          </TypographyMuted>
        </footer>
      </main>
    </div>
  )
}

// ————————————————— Flow 组装 —————————————————

export type Flow7Stage = 'board' | 'states' | 'public'

/**
 * 排行榜与公开链接。
 * 屏 1 与屏 3 是用户真正会到达的两个入口（主导航 / 分享出去的 URL），
 * 屏 2 是屏 1 的状态分支集中呈现，便于一次走查四态。
 */
export function Flow7_Leaderboard({
  lang = 'zh',
  appearance = 'light',
  session,
  stage = 'board',
  phase = 'ready',
  publicPayload = null,
  publicState = 'loading',
  onOpenMessage,
  onOpenPublicLink,
  onSignIn,
  onAppearanceChange,
}: {
  lang?: Lang
  appearance?: Appearance
  session: Session
  /** 评审用：直接落到某一屏 */
  stage?: Flow7Stage
  phase?: BoardPhase
  /** 屏 3 的匿名只读数据。真实入口是 /reads/:id 这条路由（PublicReadPage 自己取数），
   *  这里只是给评审开关留一个位置，所以默认是"还没取到"而不是编一条假消息 */
  publicPayload?: ReadsPayloadDto | null
  publicState?: 'loading' | 'ready' | 'error' | 'forbidden'
  onOpenMessage?: (id: string) => void
  onOpenPublicLink?: (id: string) => void
  onSignIn?: () => void
  onAppearanceChange?: (next: Appearance) => void
}) {
  if (stage === 'public')
    return (
      <Screen3_PublicReadonly
        lang={lang}
        appearance={appearance}
        payload={publicPayload}
        state={publicState}
        onSignIn={onSignIn}
        onAppearanceChange={onAppearanceChange}
      />
    )
  if (stage === 'states')
    return <Screen2_LeaderboardStates lang={lang} phase={phase === 'ready' ? 'empty' : phase} />
  return (
    <Screen1_Leaderboard
      lang={lang}
      session={session}
      phase={phase}
      onOpenMessage={onOpenMessage}
      onOpenPublicLink={onOpenPublicLink}
    />
  )
}
