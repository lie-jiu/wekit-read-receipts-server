// ============================================================
// FLOW 6 of 7: Account & Privacy（账户与隐私设置）
// Scenario ref: SaaS Management 决策④ —— Settings 是独立区，不占主导航一级
// Screens: 3 — 账户总览 / 账户级 IP 黑名单 / 危险区
// ============================================================

import { useState } from 'react'
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
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
  Progress,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
  Tooltip,
  TypographyMuted,
  toast,
} from 'sparkdesign'
import { Activity, Clock3, Gauge, Hash, Info, KeyRound, Lock, LogOut, MapPin, ShieldBan, Timer, Trash, TriangleAlert, UserRound } from 'lucide-react'
import { displayTime } from '../shared/mock-data'
import { fmtNum, t } from '../shared/i18n'
import { ResponsiveTable } from '../shared/responsive-table'
import type { Lang } from '../shared/i18n'
import type { AuditEntry, IpBlockEntry, IpBlockList, Session } from '../shared/types'
import { ApiError } from '../../data/api'
import { useResource } from '../../data/hooks'
import { changePassword } from '../../data/session'
import {
  ACCOUNT_BLOCK_URL,
  ACCOUNT_STATS_URL,
  accountAuditUrl,
  addAccountBlock,
  clearMyMessages,
  removeAccountBlock,
} from '../../data/account'
import type { AccountStatsDto, AuditDto } from '../../data/account'
import { toAuditEntries } from '../../data/admin'

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

function validIp(v: string): boolean {
  if (!IP_RE.test(v)) return false
  return v.split('.').every((n) => Number(n) <= 255)
}

function initialsOf(wxId: string): string {
  const letters = wxId.replace(/[^A-Za-z]/g, '')
  return (letters.slice(0, 2) || wxId.slice(0, 2)).toUpperCase()
}

// ————————————————— 屏 1：账户总览 —————————————————

function QuotaCard({
  icon,
  label,
  headline,
  headlineSuffix,
  bar,
  footNote,
  hint,
  lang,
}: {
  icon: ReactNode
  label: string
  headline: string
  headlineSuffix?: string
  /** 省略时不画进度条 —— 没有「剩余」语义的量不该硬凑一个 */
  bar?: { used: number; total: number; unit: string }
  footNote: string
  hint: string
  lang: Lang
}) {
  const ratio = !bar || bar.total === 0 ? 0 : bar.used / bar.total
  const tight = ratio >= 0.85
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {icon}
          {label}
          <Tooltip content={hint}>
            <Info className="size-3.5 text-text-tertiary" />
          </Tooltip>
        </CardTitle>
        {bar && (
          <CardAction>
            <Tag color={tight ? 'warning' : 'slate'} appearance="outline">
              {Math.round(ratio * 100)}%
            </Tag>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums">{headline}</span>
          {headlineSuffix && <span className="text-sm text-text-secondary">{headlineSuffix}</span>}
        </div>
        {bar ? (
          <>
            <Progress value={bar.used} max={Math.max(bar.total, 1)} />
            <TypographyMuted className="text-xs">
              {lang === 'zh' ? `已用 ${fmtNum(bar.used)} ${bar.unit}` : `used ${fmtNum(bar.used)}`}
            </TypographyMuted>
          </>
        ) : (
          <div className="h-1" />
        )}
        <TypographyMuted className="text-xs">{footNote}</TypographyMuted>
      </CardContent>
    </Card>
  )
}

/* ================================================
   FLOW: Account & Privacy
   SCREEN 1 of 3: 账户总览（身份 + 配额 + 改密 / 退出）
   ------------------------------------------------
   ENTRY:  头像下拉 →「账户设置」，或 Sidebar 底部入口
   EXIT:   修改密码成功 → 其他会话失效并提示重新登录
           退出登录 → 清会话回到 FLOW 1 登录屏
   BRANCH: 新密码与当前密码相同 → 字段级 inline，Dialog 不关闭
   ================================================ */
export function Screen1_AccountOverview({
  lang,
  session: s,
  totalReads,
  audit,
  auditState,
  onLogout,
  onPasswordChanged,
}: {
  lang: Lang
  session: Session
  /** 本人全部消息当前占着的已读行数（GET /account/stats）；null = 还在取或没取到，画省略号而不是 0 */
  totalReads: number | null
  audit: AuditEntry[]
  /** 留痕是独立一次请求：没取到和取到空是两件事 */
  auditState: 'loading' | 'ready' | 'error'
  onLogout?: () => void
  onPasswordChanged?: () => void
}) {
  const [pwOpen, setPwOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  /** 服务器回 401 = 当前密码不对，400 = 新密码不合长度；两者都要落到具体字段上，
   *  而不是笼统一句「保存失败」——用户需要知道改哪一个 */
  const [pwError, setPwError] = useState<'old' | 'new' | 'other' | null>(null)

  const oldErr = pwError === 'old' ? (lang === 'zh' ? '当前密码不正确' : 'Current password is incorrect') : touched && oldPw.length < 8 ? '密码至少 8 位' : undefined
  const newErr =
    pwError === 'new'
      ? lang === 'zh'
        ? '新密码需为 8–128 位'
        : 'New password must be 8–128 characters'
      : touched && newPw.length < 8
        ? '新密码至少 8 位'
        : touched && newPw === oldPw && newPw.length >= 8
          ? '新密码不能与当前密码相同'
          : undefined

  const submitPw = async () => {
    setTouched(true)
    setPwError(null)
    if (oldPw.length < 8 || newPw.length < 8 || newPw === oldPw) return
    setBusy(true)
    try {
      await changePassword({ oldPassword: oldPw, newPassword: newPw })
    } catch (e) {
      const rateLimited = e instanceof ApiError && e.rateLimited
      setPwError(rateLimited ? 'other' : e instanceof ApiError && e.status === 401 ? 'old' : 'new')
      setBusy(false)
      if (rateLimited) toast.error(lang === 'zh' ? '尝试过于频繁，请稍后再试' : 'Too many attempts — try again later')
      return
    }
    setBusy(false)
    setPwOpen(false)
    toast.success(lang === 'zh' ? '密码已修改，需要重新登录' : 'Password changed — sign in again')
    /* 服务器的副作用是删掉该账号全部会话（含当前这条），所以必须回登录页：
       留在本屏的话下一个请求就是 401，看起来像"改完密码就坏了" */
    onPasswordChanged?.()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {/* 本产品没有头像数据源，只渲染首字母兜底，不放 AvatarImage 以免 404 */}
              <AvatarFallback>{initialsOf(s.wxId)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{s.wxId}</span>
                <Tag color="info" appearance="outline">
                  Lv {s.level}
                </Tag>
                {s.isAdmin && (
                  <Tooltip content={lang === 'zh' ? '管理员来自部署的 env ADMIN 名单，与等级无关' : 'Admin comes from env ADMIN, independent of level'}>
                    <Tag color="purple" appearance="outline">
                      {t(lang, 'adminBadge')}
                    </Tag>
                  </Tooltip>
                )}
              </CardTitle>
              <CardDescription className="mt-1 tabular-nums">
                {lang === 'zh'
                  ? `注册于 ${displayTime(s.createdAt, lang)} · 已注册 ${fmtNum(s.messageCount)} 条消息 · 累计 ${totalReads === null ? '…' : fmtNum(totalReads)} 次被读`
                  : `Registered ${s.createdAt} · ${fmtNum(s.messageCount)} messages · ${totalReads === null ? '…' : fmtNum(totalReads)} reads`}
              </CardDescription>
            </div>
          </div>
          <CardAction>
            <Button variant="outline" size="md" onClick={onLogout}>
              <LogOut className="size-4" />
              {t(lang, 'signOut')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setPwOpen(true)
              setOldPw('')
              setNewPw('')
              setTouched(false)
              setPwError(null)
            }}
          >
            <KeyRound className="size-4" />
            {lang === 'zh' ? '修改密码' : 'Change password'}
          </Button>
          <TypographyMuted className="text-xs">
            {lang === 'zh' ? '改密后其他设备上的会话会立即失效' : 'Changing the password revokes sessions on other devices'}
          </TypographyMuted>
        </CardFooter>
      </Card>

      {/* 配额三卡：桌面 3 列 / 平板 2 列 / 手机 1 列 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <QuotaCard
          lang={lang}
          icon={<Gauge className="size-4 text-text-secondary" />}
          label={lang === 'zh' ? '今日定位剩余' : 'Geo lookups today'}
          headline={`${s.geoRemaining}`}
          headlineSuffix={`/ ${s.geoQuota} ${t(lang, 'unitTimes')}`}
          bar={{ used: s.geoQuota - s.geoRemaining, total: s.geoQuota, unit: t(lang, 'unitTimes') }}
          footNote={lang === 'zh' ? 'UTC 0 点重置' : 'resets 00:00 UTC'}
          hint={lang === 'zh' ? '配额 = 等级公式 geo 在该等级的取值' : 'Quota = the geo formula at your level'}
        />
        <QuotaCard
          lang={lang}
          icon={<Hash className="size-4 text-text-secondary" />}
          label={lang === 'zh' ? '消息容量剩余' : 'Message quota left'}
          headline={`${fmtNum(Math.max(0, s.messageQuota - s.messageCount))}`}
          headlineSuffix={`/ ${fmtNum(s.messageQuota)} ${t(lang, 'unitItems')}`}
          bar={{ used: s.messageCount, total: s.messageQuota, unit: t(lang, 'unitItems') }}
          footNote={lang === 'zh' ? '超限时由最旧的消息开始淘汰' : 'oldest messages evict first'}
          hint={
            lang === 'zh'
              ? '配额 = 等级公式 message 的值；超限不会锁死账户，只是淘汰最旧的'
              : 'Quota = the message formula; over quota evicts rather than locking the account'
          }
        />
        <QuotaCard
          lang={lang}
          icon={<Timer className="size-4 text-text-secondary" />}
          label={lang === 'zh' ? '已读记录保留时长' : 'Read-record retention'}
          headline={`${s.retentionMonths}`}
          headlineSuffix={lang === 'zh' ? '个月' : 'months'}
          footNote={lang === 'zh' ? '超出时长的记录由每日任务清理，不可找回' : 'older rows are swept daily and cannot be recovered'}
          hint={lang === 'zh' ? '保留时长 = 等级公式 retentionMonths 的值，没有「剩余」可言，故不显示进度条' : 'A duration, not a budget — so no progress bar'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4" />
              {lang === 'zh' ? '账号权益' : 'Entitlements'}
            </CardTitle>
            <CardDescription>
              {lang === 'zh' ? '全部由等级经公式换算，不能单独调整' : 'All derived from your level via the formulas'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {[
              { label: lang === 'zh' ? '消息保留条数' : 'Message quota', value: `${s.messageQuota} ${t(lang, 'unitItems')}` },
              { label: lang === 'zh' ? '每日定位次数' : 'Daily geo lookups', value: `${s.geoQuota} ${t(lang, 'unitTimes')}` },
              { label: lang === 'zh' ? '保留时长' : 'Retention', value: `${s.retentionMonths} ${lang === 'zh' ? '个月' : 'months'}` },
              { label: lang === 'zh' ? '能否注册新消息' : 'Can register', value: s.level > 0 ? (lang === 'zh' ? '可以' : 'yes') : t(lang, 'stateSuspended') },
            ].map((row) => (
              <Item key={row.label} size="sm">
                <ItemContent>
                  <ItemDescription>{row.label}</ItemDescription>
                </ItemContent>
                <ItemTitle className="tabular-nums">{row.value}</ItemTitle>
              </Item>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" />
              {lang === 'zh' ? '我的近期操作' : 'My recent actions'}
            </CardTitle>
            <CardDescription>
              {lang === 'zh' ? '取自 audit_logs，含 IP 与详情' : 'From audit_logs, with IP and detail'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditState === 'loading' ? (
              <TypographyMuted className="text-xs">{lang === 'zh' ? '正在读取留痕…' : 'Loading…'}</TypographyMuted>
            ) : auditState === 'error' ? (
              /* 取不到 ≠ 没有操作过：写成「暂无可留痕的操作」是把故障说成用户的清白 */
              <TypographyMuted className="text-xs">
                {lang === 'zh' ? '留痕读取失败，稍后刷新本页重试' : 'Could not load your action log — refresh this page later'}
              </TypographyMuted>
            ) : audit.length === 0 ? (
              <TypographyMuted className="text-xs">{lang === 'zh' ? '暂无可留痕的操作' : 'Nothing audited yet'}</TypographyMuted>
            ) : (
              <Timeline>
                {audit.map((a) => (
                  <TimelineItem key={a.id}>
                    <TimelineMarker tone={a.tone === 'neutral' ? 'default' : a.tone}>
                      {a.tone === 'error' ? <Trash className="size-3" /> : <Clock3 className="size-3" />}
                    </TimelineMarker>
                    <TimelineConnector />
                    <TimelineContent>
                      <TimelineTitle>{a.action}</TimelineTitle>
                      <TimelineDescription>{a.detail}</TimelineDescription>
                      <TimelineTime dateTime={a.timestamp}>{displayTime(a.timestamp, lang)}</TimelineTime>
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 修改密码 —— 独立 Dialog，不跟其他设置共享一个「保存全部」 */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{lang === 'zh' ? '修改密码' : 'Change password'}</DialogTitle>
            <DialogDescription>
              {lang === 'zh'
                ? '密码以 PBKDF2-HMAC-SHA256 加盐存储；保存后该账号在其他设备上的会话全部失效。'
                : 'Stored as salted PBKDF2-HMAC-SHA256. All other sessions are revoked on save.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {/* STATE: default — 两字段空，提交触发校验 */}
            {/* STATE: submitting — 按钮 loading，字段 disabled */}
            {/* STATE: error — 长度不足 / 新旧相同 → 字段级 inline，Dialog 保持打开 */}
            <Field orientation="vertical">
              <FieldLabel htmlFor="old-pw">{t(lang, 'oldPassword')}</FieldLabel>
              <Input
                id="old-pw"
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
              />
              <FieldError errors={oldErr ? [{ message: oldErr }] : undefined} />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="new-pw">{t(lang, 'newPassword')}</FieldLabel>
              <Input
                id="new-pw"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
              <FieldDescription>{lang === 'zh' ? '8–128 位' : '8–128 characters'}</FieldDescription>
              <FieldError errors={newErr ? [{ message: newErr }] : undefined} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="md" onClick={() => setPwOpen(false)}>
              {t(lang, 'cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={busy}
              disabled={busy}
              onClick={() => void submitPw()}
            >
              {t(lang, 'save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ————————————————— 屏 2：账户级 IP 黑名单 —————————————————

/* ================================================
   FLOW: Account & Privacy
   SCREEN 2 of 3: 账户级 IP 黑名单
   ------------------------------------------------
   ENTRY:  本屏在账户设置页内，位于总览之下
   EXIT:   添加 / 移除即时生效 → 停留本屏
   BRANCH: IP 非法或重复 → inline 提示，输入框保留内容
           黑名单命中的记录在服务端被过滤，界面只报条数
   ================================================ */
export function Screen2_AccountIpBlock({
  blocks,
  state,
  lang,
  viewerIp,
  onAdd,
  onRemove,
}: {
  blocks: IpBlockList | null
  /** 名单是独立一次请求：没取到和取到空表是两件事 */
  state: 'loading' | 'ready' | 'error'
  lang: Lang
  /** 服务器看到的本人出口 IP，用来预填。账户级刻意不支持 action:"current"
   *  （见 routes/account.ts：一键拉黑只给消息级），所以这里只填进输入框，仍由用户按「添加」确认 */
  viewerIp: string
  onAdd: (ip: string) => Promise<string | undefined>
  onRemove: (ip: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const submit = async (value: string) => {
    const v = value.trim()
    if (!validIp(v)) {
      setErr(lang === 'zh' ? '请输入合法的 IPv4 地址，例如 203.0.113.7' : 'Enter a valid IPv4 address')
      return
    }
    setBusy(true)
    const msg = await onAdd(v)
    setBusy(false)
    if (msg) {
      setErr(msg)
      return
    }
    setErr(undefined)
    setDraft('')
    toast.success(lang === 'zh' ? `已拉黑 ${v}` : `Blocked ${v}`)
  }

  const columns = [
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
        <Button variant="text" size="sm" onClick={() => onRemove(r.ip)}>
          {t(lang, 'remove')}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldBan className="size-4" />
            {lang === 'zh' ? '我的 IP 黑名单' : 'My IP blocklist'}
          </CardTitle>
          <CardDescription>
            {lang === 'zh'
              ? `作用域：你名下全部消息 · 当前 ${fmtNum(blocks?.count ?? 0)} 条`
              : `Scoped to every message you own · ${fmtNum(blocks?.count ?? 0)} entries`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* STATE: default — 输入框空 */}
          {/* STATE: filled — 合法 IPv4，添加可用 */}
          {/* STATE: error — 非法或重复，inline 提示且保留已输入内容 */}
          <div className="flex flex-col gap-2">
            <InputGroup>
              <InputGroupInput
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setErr(undefined)
                }}
                placeholder="203.0.113.7"
                aria-label={lang === 'zh' ? '要拉黑的 IP' : 'IP to block'}
              />
              <InputGroupAddon align="inline-end">
                <Button variant="secondary" size="sm" loading={busy} disabled={busy} onClick={() => void submit(draft)}>
                  {t(lang, 'add')}
                </Button>
              </InputGroupAddon>
            </InputGroup>
            {err && (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* 只预填不自动提交：账户级一键拉黑会把本人以后所有消息的访问都挡掉，
              服务器刻意不给这个 scope 开 action:"current"，界面就不该替用户按下确认 */}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!validIp(viewerIp)}
            title={validIp(viewerIp) ? undefined : lang === 'zh' ? '服务器没能识别出你的来源 IP' : 'The server could not determine your IP'}
            onClick={() => {
              setDraft(viewerIp)
              setErr(undefined)
            }}
          >
            <MapPin className="size-3.5" />
            {lang === 'zh' ? `填入我当前的 IP（${viewerIp}）` : `Fill in my current IP (${viewerIp})`}
          </Button>

          {state === 'loading' ? (
            <TypographyMuted className="py-6 text-center text-sm">
              {lang === 'zh' ? '正在读取黑名单…' : 'Loading blocklist…'}
            </TypographyMuted>
          ) : state === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>
                {lang === 'zh' ? '黑名单读取失败。下面的添加与移除操作暂时不要做，先刷新页面重试。' : 'Could not load the blocklist. Refresh this page before adding or removing entries.'}
              </AlertDescription>
            </Alert>
          ) : (blocks?.ips.length ?? 0) === 0 ? (
            <TypographyMuted className="py-6 text-center text-sm">
              {lang === 'zh' ? '还没有拉黑过任何 IP' : 'No IPs blocked yet'}
            </TypographyMuted>
          ) : (
            <ResponsiveTable columns={columns} data={blocks?.ips ?? []} primary="ip" metaKey="createdAt" />
          )}

          <Alert variant="info">
            <AlertTitle>{lang === 'zh' ? '被拉黑的访问会怎样' : 'What blocking actually does'}</AlertTitle>
            <AlertDescription>
              {lang === 'zh'
                ? '已读明细接口直接不返回这些 IP 的记录，界面上只出现「已过滤 N 条」的计数；数据库里的原始记录仍然保留，解除拉黑后可重新钻取。'
                : 'Matching rows are dropped from the API and surface only as a filtered count. The underlying rows stay in the store and reappear if you unblock.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* 三级作用域对照：原产品分处三屏，用户极易以为账户级=全站 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" />
            {lang === 'zh' ? '三级黑名单的作用域' : 'The three blocklist scopes'}
          </CardTitle>
          <CardDescription>
            {lang === 'zh' ? '同为「拉黑一个 IP」，生效范围完全不同 —— 别把账户级的当成全站生效' : 'Same verb, very different reach — your account list is not site-wide'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border-tertiary">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === 'zh' ? '作用域' : 'Scope'}</TableHead>
                  <TableHead>{lang === 'zh' ? '生效范围' : 'Applies to'}</TableHead>
                  <TableHead>{lang === 'zh' ? '谁能修改' : 'Who can edit'}</TableHead>
                  <TableHead>{lang === 'zh' ? '库表' : 'Table'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  {
                    scope: lang === 'zh' ? '全局' : 'Global',
                    reach: lang === 'zh' ? '本站所有消息与访客' : 'every message and visitor',
                    who: t(lang, 'adminBadge'),
                    table: 'ip_block_global',
                    tone: 'error' as const,
                  },
                  {
                    scope: lang === 'zh' ? '单条消息' : 'One message',
                    reach: lang === 'zh' ? '仅这一条消息的已读明细' : 'only this message reads',
                    who: lang === 'zh' ? '消息发布者或管理员' : 'owner or admin',
                    table: 'ip_block_message',
                    tone: 'warning' as const,
                  },
                  {
                    scope: lang === 'zh' ? '账户（本页）' : 'Account (this page)',
                    reach: lang === 'zh' ? '你自己名下的全部消息' : 'all messages you own',
                    who: lang === 'zh' ? '仅本人' : 'you only',
                    table: 'ip_block_account',
                    tone: 'success' as const,
                  },
                ].map((row) => (
                  <TableRow key={row.table}>
                    <TableCell>
                      <Tag color={row.tone} appearance="outline">
                        {row.scope}
                      </Tag>
                    </TableCell>
                    <TableCell className="text-sm">{row.reach}</TableCell>
                    <TableCell className="text-sm">{row.who}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-text-secondary">{row.table}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TypographyMuted className="mt-3 block text-xs">
            <Lock className="me-1 inline-block size-3" />
            {lang === 'zh'
              ? '全局名单只在管理后台「全局黑名单」里维护，这里看不到也不能改。'
              : 'The global list lives in the admin console only — it is neither shown nor editable here.'}
          </TypographyMuted>
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— 屏 3：危险区 —————————————————

/* ================================================
   FLOW: Account & Privacy
   SCREEN 3 of 3: 危险区 —— 清除我的全部消息
   ------------------------------------------------
   ENTRY:  账户设置页底部危险区
   EXIT:   输入本人 wxId 后确认 → 消息与已读一并清空 → 退出 flow 回总览
   BRANCH: 未逐字输入 wxId → 确认按钮保持 disabled
           取消 → 什么都不动，回到屏 1
   ================================================ */
export function Screen3_DangerZone({
  lang,
  wxId,
  messageCount,
  totalReads,
  onCleared,
}: {
  lang: Lang
  wxId: string
  messageCount: number
  /** null = 统计还在取或没取到。不可逆动作不能让人在"不知道会删掉多少"的情况下确认 */
  totalReads: number | null
  /** 清除成功后由上层刷新会话与本页数据；失败时不会被调用 */
  onCleared?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const readsLabel = totalReads === null ? '…' : fmtNum(totalReads)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-error">
          <TriangleAlert className="size-4" />
          {lang === 'zh' ? '危险区' : 'Danger zone'}
        </CardTitle>
        <CardDescription>
          {lang === 'zh' ? '这些操作影响面大且不可撤销，所以各自单独确认。' : 'Irreversible, and each asks for its own confirmation.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{lang === 'zh' ? '清除我的全部消息' : 'Clear all my messages'}</div>
            <TypographyMuted className="text-xs">
              {lang === 'zh'
                ? `将删除 ${fmtNum(messageCount)} 条消息与 ${readsLabel} 条已读记录；账号、配额与 IP 黑名单保留。`
                : `Removes ${fmtNum(messageCount)} messages and ${readsLabel} read rows; account, quota and blocklists stay.`}
            </TypographyMuted>
          </div>
          <Button
            variant="destructive"
            size="md"
            disabled={totalReads === null}
            title={totalReads === null ? (lang === 'zh' ? '正在统计将被删除的记录数' : 'Still counting what would be deleted') : undefined}
            onClick={() => setOpen(true)}
          >
            <Trash className="size-4" />
            {lang === 'zh' ? '清除我的' : 'Clear mine'}
          </Button>
        </div>
      </CardContent>

      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setConfirm('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-error" />
              {lang === 'zh' ? `清除 ${fmtNum(messageCount)} 条消息？` : `Clear ${fmtNum(messageCount)} messages?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === 'zh'
                ? `同时删除 ${readsLabel} 条已读记录，所有已发出的打点链接立即失效。账号本身、等级权益与 IP 黑名单不受影响。`
                : `Also deletes ${readsLabel} read rows and breaks every tracking link already sent. Your account, level and blocklist are untouched.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <Field orientation="vertical">
            <FieldLabel htmlFor="clear-confirm">
              {lang === 'zh' ? `逐字输入 ${wxId} 以确认` : `Type ${wxId} to confirm`}
            </FieldLabel>
            <Input
              id="clear-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={wxId}
              className="font-mono"
            />
            <FieldDescription>
              {lang === 'zh' ? '区分大小写。这是「清除我的」，不是删除账号。' : 'Case-sensitive. This clears messages, not the account.'}
            </FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(lang, 'cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirm !== wxId || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await clearMyMessages()
                } catch {
                  setBusy(false)
                  /* 删失败时对话框保持打开：用户已经逐字确认过一遍，不该让他再输一次 */
                  toast.error(lang === 'zh' ? '清除失败，请稍后重试' : 'Could not clear — try again')
                  return
                }
                setBusy(false)
                setOpen(false)
                setConfirm('')
                toast.success(lang === 'zh' ? `已清除 ${fmtNum(messageCount)} 条消息` : `Cleared ${fmtNum(messageCount)} messages`)
                onCleared?.()
                /* → 成功 → 上层刷新会话与本页计数，回到总览 */
              }}
            >
              {lang === 'zh' ? '确认清除' : 'Clear all'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ————————————————— Flow 组合器 —————————————————

export function Flow6_Account({
  lang = 'zh',
  session,
  onLogout,
  onPasswordChanged,
  onCleared,
}: {
  lang?: Lang
  session: Session
  onLogout?: () => void
  onPasswordChanged?: () => void
  onCleared?: () => void
}) {
  const stats = useResource<AccountStatsDto>(ACCOUNT_STATS_URL)
  const blocks = useResource<IpBlockList>(ACCOUNT_BLOCK_URL)
  const audit = useResource<AuditDto>(accountAuditUrl(10))

  const auditState = audit.error ? 'error' : audit.loading && !audit.data ? 'loading' : 'ready'
  const blockState = blocks.error ? 'error' : blocks.loading && !blocks.data ? 'loading' : 'ready'

  /** 添加 / 移除都会写审计，所以三个资源一起重取：留痕区不跟着变就是自相矛盾的画面 */
  const refreshAll = () => {
    blocks.reload()
    audit.reload()
    stats.reload()
  }

  const add = async (ip: string): Promise<string | undefined> => {
    try {
      await addAccountBlock(ip)
    } catch (e) {
      if (e instanceof ApiError && e.code.includes('exists')) {
        return lang === 'zh' ? `${ip} 已在你的黑名单中` : `${ip} is already on your blocklist`
      }
      return lang === 'zh' ? '拉黑失败，请稍后重试' : 'Could not blocklist — try again'
    }
    refreshAll()
    return undefined
  }

  const remove = async (ip: string) => {
    try {
      await removeAccountBlock(ip)
    } catch {
      toast.error(lang === 'zh' ? '移出失败，请稍后重试' : 'Could not unblock — try again')
      return
    }
    toast.success(
      lang === 'zh' ? '已移出黑名单；历史读记录仍在库中，重新钻取即可看到' : 'Unblocked; historic rows stay in the store',
    )
    refreshAll()
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{t(lang, 'navAccount')}</h1>
        <TypographyMuted className="text-sm">
          {lang === 'zh'
            ? '这一区从主导航下沉到头像下拉 —— 日常用不到，但改起来影响面大。'
            : 'Settings live behind the avatar menu, not in the primary nav.'}
        </TypographyMuted>
        {stats.error && (
          <TypographyMuted className="mt-1 block text-xs text-error">
            {lang === 'zh' ? '账户统计没取到，下方数字可能偏旧。' : 'Account stats could not be loaded — the numbers below may be stale.'}
          </TypographyMuted>
        )}
      </div>

      <Screen1_AccountOverview
        lang={lang}
        session={session}
        totalReads={stats.data?.totalReads ?? null}
        audit={audit.data ? toAuditEntries(audit.data) : []}
        auditState={auditState}
        onLogout={onLogout}
        onPasswordChanged={onPasswordChanged}
      />
      <Screen2_AccountIpBlock
        blocks={blocks.data ?? null}
        state={blockState}
        lang={lang}
        viewerIp={stats.data?.viewerIp ?? ''}
        onAdd={add}
        onRemove={remove}
      />
      <Screen3_DangerZone
        lang={lang}
        wxId={session.wxId}
        messageCount={session.messageCount}
        totalReads={stats.data?.totalReads ?? null}
        onCleared={() => {
          refreshAll()
          onCleared?.()
        }}
      />
    </div>
  )
}
