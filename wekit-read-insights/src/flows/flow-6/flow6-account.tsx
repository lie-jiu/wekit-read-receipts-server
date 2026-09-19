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
import {
  CURRENT_VISITOR_IP,
  displayTime,
  mockAccountBlock,
  mockAuditLog,
  mockMessages,
  mockSession,
} from '../shared/mock-data'
import { fmtNum, t } from '../shared/i18n'
import { ResponsiveTable } from '../shared/responsive-table'
import type { Lang } from '../shared/i18n'
import type { IpBlockEntry, IpBlockList } from '../shared/types'

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
  onLogout,
  onPasswordChanged,
}: {
  lang: Lang
  onLogout?: () => void
  onPasswordChanged?: () => void
}) {
  const s = mockSession
  const myMessages = mockMessages.filter((m) => m.wxId === s.wxId)
  const readsTotal = myMessages.reduce((a, m) => a + m.reads, 0)
  const audit = mockAuditLog.filter((a) => a.wxId === s.wxId)

  const [pwOpen, setPwOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const oldErr = touched && oldPw.length < 8 ? '密码至少 8 位' : undefined
  const newErr =
    touched && newPw.length < 8
      ? '新密码至少 8 位'
      : touched && newPw === oldPw && newPw.length >= 8
        ? '新密码不能与当前密码相同'
        : undefined

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
                  ? `注册于 ${displayTime(s.createdAt, lang)} · 已注册 ${fmtNum(myMessages.length)} 条消息 · 累计 ${fmtNum(readsTotal)} 次被读`
                  : `Registered ${s.createdAt} · ${fmtNum(myMessages.length)} messages · ${fmtNum(readsTotal)} reads`}
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
          headline={`${fmtNum(Math.max(0, s.messageQuota - myMessages.length))}`}
          headlineSuffix={`/ ${fmtNum(s.messageQuota)} ${t(lang, 'unitItems')}`}
          bar={{ used: myMessages.length, total: s.messageQuota, unit: t(lang, 'unitItems') }}
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
            {audit.length === 0 ? (
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
              onClick={() => {
                setTouched(true)
                if (oldPw.length < 8 || newPw.length < 8 || newPw === oldPw) return
                setBusy(true)
                window.setTimeout(() => {
                  setBusy(false)
                  setPwOpen(false)
                  onPasswordChanged?.()
                  toast.success(lang === 'zh' ? '密码已修改，其他设备需重新登录' : 'Password changed; other devices must sign in again')
                  /* → 成功 → 本屏停留，其他会话已失效 */
                }, 600)
              }}
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
  lang,
  onAdd,
  onRemove,
}: {
  blocks: IpBlockList
  lang: Lang
  onAdd: (ip: string) => string | undefined
  onRemove: (ip: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | undefined>(undefined)

  const submit = (value: string) => {
    const v = value.trim()
    if (!validIp(v)) {
      setErr(lang === 'zh' ? '请输入合法的 IPv4 地址，例如 203.0.113.7' : 'Enter a valid IPv4 address')
      return
    }
    const dup = onAdd(v)
    if (dup) {
      setErr(dup)
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
              ? `作用域：你名下全部消息 · 当前 ${blocks.count} 条`
              : `Scoped to every message you own · ${blocks.count} entries`}
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
                <Button variant="secondary" size="sm" onClick={() => submit(draft)}>
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

          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => submit(CURRENT_VISITOR_IP)}
          >
            <MapPin className="size-3.5" />
            {lang === 'zh' ? `屏蔽我当前的 IP（${CURRENT_VISITOR_IP}）` : `Block my current IP (${CURRENT_VISITOR_IP})`}
          </Button>

          {blocks.ips.length === 0 ? (
            <TypographyMuted className="py-6 text-center text-sm">
              {lang === 'zh' ? '还没有拉黑过任何 IP' : 'No IPs blocked yet'}
            </TypographyMuted>
          ) : (
            <ResponsiveTable columns={columns} data={blocks.ips} primary="ip" metaKey="createdAt" />
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
  onCleared,
}: {
  lang: Lang
  onCleared?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const mine = mockMessages.filter((m) => m.wxId === mockSession.wxId)
  const readsTotal = mine.reduce((a, m) => a + m.reads, 0)

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
                ? `将删除 ${fmtNum(mine.length)} 条消息与 ${fmtNum(readsTotal)} 条已读记录；账号、配额与 IP 黑名单保留。`
                : `Removes ${fmtNum(mine.length)} messages and ${fmtNum(readsTotal)} read rows; account, quota and blocklists stay.`}
            </TypographyMuted>
          </div>
          <Button variant="destructive" size="md" onClick={() => setOpen(true)}>
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
              {lang === 'zh' ? `清除 ${fmtNum(mine.length)} 条消息？` : `Clear ${fmtNum(mine.length)} messages?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === 'zh'
                ? `同时删除 ${fmtNum(readsTotal)} 条已读记录，所有已发出的打点链接立即失效。账号本身、等级权益与 IP 黑名单不受影响。`
                : `Also deletes ${fmtNum(readsTotal)} read rows and breaks every tracking link already sent. Your account, level and blocklist are untouched.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <Field orientation="vertical">
            <FieldLabel htmlFor="clear-confirm">
              {lang === 'zh' ? `逐字输入 ${mockSession.wxId} 以确认` : `Type ${mockSession.wxId} to confirm`}
            </FieldLabel>
            <Input
              id="clear-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={mockSession.wxId}
              className="font-mono"
            />
            <FieldDescription>
              {lang === 'zh' ? '区分大小写。这是「清除我的」，不是删除账号。' : 'Case-sensitive. This clears messages, not the account.'}
            </FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(lang, 'cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirm !== mockSession.wxId}
              onClick={() => {
                setOpen(false)
                setConfirm('')
                onCleared?.()
                toast.success(lang === 'zh' ? `已清除 ${fmtNum(mine.length)} 条消息` : `Cleared ${fmtNum(mine.length)} messages`)
                /* → 确认 → 退出 flow，回到 FLOW 2 空列表 */
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
  onLogout,
  onCleared,
}: {
  lang?: Lang
  onLogout?: () => void
  onCleared?: () => void
}) {
  const [blocks, setBlocks] = useState<IpBlockList>({
    count: mockAccountBlock.ips.length,
    ips: [...mockAccountBlock.ips],
  })

  const add = (ip: string): string | undefined => {
    if (blocks.ips.some((b) => b.ip === ip))
      return lang === 'zh' ? `${ip} 已在你的黑名单中` : `${ip} is already on your blocklist`
    setBlocks((b) => ({
      count: b.count + 1,
      ips: [{ ip, createdAt: '2026-09-18 12:00:00' }, ...b.ips],
    }))
    return undefined
  }

  const remove = (ip: string) => {
    setBlocks((b) => ({ count: Math.max(0, b.count - 1), ips: b.ips.filter((x) => x.ip !== ip) }))
    toast.success(lang === 'zh' ? '已移出黑名单，历史记录需重新钻取' : 'Unblocked')
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
      </div>

      <Screen1_AccountOverview lang={lang} onLogout={onLogout} />
      <Screen2_AccountIpBlock blocks={blocks} lang={lang} onAdd={add} onRemove={remove} />
      <Screen3_DangerZone lang={lang} onCleared={onCleared} />
    </div>
  )
}
