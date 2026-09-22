// ============================================================
// FLOW 4 of 7: Manage Users & Levels（用户管理与等级调整）
// Scenario ref: SaaS Management · Flow 1（成员列表 + 邀请）+ Flow 2（改权限，高风险）
// Screens: 4 — 用户列表 / 用户详情抽屉 / 新建与重置密码 / 变更后的列表
// ============================================================

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  ButtonGroup,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EllipsisText,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
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
import { Check, ChevronRight, Clock3, Ellipsis, Info, KeyRound, Minus, Plus, Search, ShieldAlert, Trash, UserPlus, UserRound, X } from 'lucide-react'
import { displayTime } from '../shared/mock-data'
import { ApiError } from '../../data/api'
import { useResource } from '../../data/hooks'
import {
  adminAuditUrl,
  adminCreateUser,
  adminDeleteUser,
  adminMessagesUrl,
  adminResetPassword,
  adminSetLevel,
  adminUsersUrl,
  toAdminMessage,
  toAuditEntries,
  type AdminMessageDto,
  type AdminUserDto,
  type AuditDto,
  type Paged,
} from '../../data/admin'
import { pageItems } from '../shared/pagination'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum, t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type { AdminUserRow, AuditEntry, Message } from '../shared/types'

// ————————————————— 规则与校验 —————————————————

const LEVEL_MIN = 0
const LEVEL_MAX = 99

/** 真实约束：wxId 1–64 可打印 ASCII；密码 8–128 位 */
const WXID_RE = /^[\x20-\x7E]{1,64}$/

function validateNewUser(row: AdminUserRow[], wxId: string, password: string): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!WXID_RE.test(wxId)) errs.wxId = '1–64 个可打印字符'
  else if (row.some((u) => u.wxId === wxId)) errs.wxId = '该微信 ID 已存在'
  if (password.length < 8) errs.password = '密码至少 8 位'
  else if (password.length > 128) errs.password = '密码最多 128 位'
  return errs
}

function relTime(ts: string | null, lang: Lang): string {
  if (!ts) return lang === 'zh' ? '从未发消息' : 'never'
  const days = Math.round((Date.parse('2026-09-18T00:00:00Z') - Date.parse(ts.replace(' ', 'T') + 'Z')) / 86400000)
  if (days <= 0) return lang === 'zh' ? '今天' : 'today'
  if (days === 1) return lang === 'zh' ? '昨天' : 'yesterday'
  if (days < 30) return lang === 'zh' ? `${days} 天前` : `${days}d ago`
  return lang === 'zh' ? `${Math.round(days / 30)} 个月前` : `${Math.round(days / 30)}mo ago`
}

/**
 * 等级徽标的语义。
 *
 * 注意 env ADMIN 决定后台入口权限，与 level 完全无关 —— 所以「降到 Lv 0」
 * 不会让管理员失去 /admin 访问，它只意味着该账号不能再注册新消息。
 * 原界面把 Lv 0 呈现得像"封号"，这里显性化成「已停注册」。
 */
function StatusTag({ user, lang }: { user: AdminUserRow; lang: Lang }) {
  if (user.isAdmin)
    return (
      <Tag color="purple" appearance="outline">
        <ShieldAlert className="size-3" />
        {t(lang, 'adminBadge')}
      </Tag>
    )
  if (user.level === LEVEL_MIN)
    return (
      <Tooltip
        content={
          lang === 'zh'
            ? 'Lv 0 仅禁止注册新消息，历史消息与已读记录全部保留，随时可调回'
            : 'Lv 0 blocks new registrations only; existing messages and reads are kept'
        }
      >
        <Tag color="warning" appearance="outline">
          {t(lang, 'stateSuspended')}
        </Tag>
      </Tooltip>
    )
  return (
    <Tag color="success" appearance="outline">
      {t(lang, 'stateActive')}
    </Tag>
  )
}

/** 等级步进器：改动只落本地 state，点别处不会偷偷写库 */
function LevelStepper({
  user,
  lang,
  pending = false,
  onCommit,
}: {
  user: AdminUserRow
  lang: Lang
  /** 有写操作在途时整组控件禁掉：连点会把等级改到用户没点过的位置 */
  pending?: boolean
  onCommit: (user: AdminUserRow, next: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const value = draft ?? user.level
  const set = (n: number) => setDraft(Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, n)))

  return (
    <fieldset disabled={pending} className="contents">
    <div className="flex items-center gap-2">
      <ButtonGroup>
        <IconButton
          icon={<Minus className="size-3.5" />}
          variant="tertiary"
          size="sm"
          aria-label={lang === 'zh' ? `降低 ${user.wxId} 的等级` : `Decrease level of ${user.wxId}`}
          onClick={() => set(value - 1)}
        />
        <Input
          value={String(value)}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || 0)}
          inputMode="numeric"
          size="sm"
          className="w-14 text-center tabular-nums"
          aria-label={lang === 'zh' ? `${user.wxId} 的等级` : `Level of ${user.wxId}`}
        />
        <IconButton
          icon={<Plus className="size-3.5" />}
          variant="tertiary"
          size="sm"
          aria-label={lang === 'zh' ? `提高 ${user.wxId} 的等级` : `Increase level of ${user.wxId}`}
          onClick={() => set(value + 1)}
        />
      </ButtonGroup>
      {draft !== null && draft !== user.level && (
        <div className="flex items-center gap-1">
          <IconButton
            icon={<Check className="size-3.5" />}
            variant="secondary"
            size="sm"
            aria-label={lang === 'zh' ? '保存等级' : 'Save level'}
            onClick={() => {
              onCommit(user, draft)
              setDraft(null)
            }}
          />
          <IconButton
            icon={<X className="size-3.5" />}
            variant="ghost"
            size="sm"
            aria-label={lang === 'zh' ? '放弃修改' : 'Discard'}
            onClick={() => setDraft(null)}
          />
          <Tag color="info" appearance="outline">
            Lv {user.level} → Lv {draft}
          </Tag>
        </div>
      )}
    </div>
    </fieldset>
  )
}

// ————————————————— 共享的用户表 —————————————————

function UsersTable({
  users,
  lang,
  currentWxId = '',
  busy = null,
  onDetail,
  onResetPassword,
  onDelete,
  onCommitLevel,
}: {
  users: AdminUserRow[]
  lang: Lang
  /** 用来标「本人」—— 由容器从会话里给，不再是 mock 常量 */
  currentWxId?: string
  /** 正在提交写操作的那一行 wxId：期间整表的行内动作都禁用，防连点 */
  busy?: string | null
  onDetail: (u: AdminUserRow) => void
  onResetPassword: (u: AdminUserRow) => void
  onDelete: (u: AdminUserRow) => void
  onCommitLevel: (u: AdminUserRow, next: number) => void
}) {
  const columns = [
    {
      key: 'wxId',
      header: t(lang, 'wxId'),
      cell: (u: AdminUserRow) => (
        <div className="min-w-0">
          <EllipsisText tooltipContent={u.wxId}>
            <span className="font-mono text-sm">{u.wxId}</span>
          </EllipsisText>
          {u.wxId === currentWxId && (
            <Tag color="slate" appearance="outline" className="ms-1">
              {lang === 'zh' ? '本人' : 'you'}
            </Tag>
          )}
        </div>
      ),
    },
    {
      key: 'level',
      header: t(lang, 'level'),
      cell: (u: AdminUserRow) => <LevelStepper user={u} lang={lang} pending={busy !== null} onCommit={onCommitLevel} />,
    },
    {
      key: 'status',
      header: lang === 'zh' ? '状态' : 'Status',
      cell: (u: AdminUserRow) => <StatusTag user={u} lang={lang} />,
    },
    {
      key: 'messages',
      header: lang === 'zh' ? '当前 / 累计' : 'Now / total',
      cell: (u: AdminUserRow) => (
        <span className="text-sm tabular-nums">
          {u.messageCount} <span className="text-text-tertiary">/ {u.totalRegMsgs}</span>
        </span>
      ),
    },
    {
      key: 'lastMsgAt',
      header: t(lang, 'lastActive'),
      cell: (u: AdminUserRow) => (
        <Tooltip content={u.lastMsgAt ? displayTime(u.lastMsgAt, lang) : ''}>
          <span className="text-sm text-text-secondary">{relTime(u.lastMsgAt, lang)}</span>
        </Tooltip>
      ),
    },
    {
      key: 'createdAt',
      header: t(lang, 'registeredAt'),
      cell: (u: AdminUserRow) => (
        <span className="text-sm text-text-secondary tabular-nums">{u.createdAt.slice(0, 10)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (u: AdminUserRow) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<Ellipsis className="size-4" />} variant="ghost" size="sm" aria-label={`${u.wxId} ${lang === 'zh' ? '的操作' : 'actions'}`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{lang === 'zh' ? '用户操作' : 'User actions'}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onDetail(u)}>{lang === 'zh' ? '查看详情' : 'View detail'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onResetPassword(u)}>
              <KeyRound className="size-3.5" />
              {lang === 'zh' ? '重置密码' : 'Reset password'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(u)}>
              <Trash className="size-3.5" />
              {lang === 'zh' ? '删除用户' : 'Delete user'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <ResponsiveTable
      columns={columns}
      data={users}
      primary="wxId"
      compactHidden={['createdAt']}
      metaKey="lastMsgAt"
      emptyText={lang === 'zh' ? '没有匹配的用户' : 'No matching users'}
    />
  )
}

// ————————————————— 屏 1 / 屏 4：用户列表 —————————————————

/* ================================================
   FLOW: Manage Users & Levels
   SCREEN 1 of 4: 用户列表
   ------------------------------------------------
   ENTRY:  Sidebar「运营 › 用户」（仅 isAdmin 渲染）
   EXIT:   行菜单「查看详情」→ SCREEN 2；「重置密码」→ SCREEN 3
           「+ 新建用户」→ SCREEN 3
   BRANCH: 搜索无命中 → 表内空态 + 清除搜索动作
   ================================================ */
export function Screen1_UsersList({
  users,
  lang,
  query,
  page,
  pageSize,
  total,
  loading = false,
  currentWxId = '',
  busy = null,
  onQuery,
  onPage,
  onPageSize,
  onDetail,
  onResetPassword,
  onDelete,
  onCreate,
  onCommitLevel,
}: {
  users: AdminUserRow[]
  lang: Lang
  query: string
  page: number
  pageSize: number
  total: number
  /** 服务端分页 + 服务端搜索：没有数据时先骨架，不直接判空 */
  loading?: boolean
  currentWxId?: string
  busy?: string | null
  onQuery: (v: string) => void
  onPage: (p: number) => void
  onPageSize: (n: number) => void
  onDetail: (u: AdminUserRow) => void
  onResetPassword: (u: AdminUserRow) => void
  onDelete: (u: AdminUserRow) => void
  onCreate: () => void
  onCommitLevel: (u: AdminUserRow, next: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text">{t(lang, 'navUsers')}</h1>
          <TypographyMuted className="text-sm">
            {lang === 'zh' ? `共 ${fmtNum(total)} 个账号 · 等级 0 表示仅禁止注册新消息` : `${fmtNum(total)} accounts · level 0 blocks new registrations only`}
          </TypographyMuted>
        </div>
        <Button variant="primary" size="md" onClick={onCreate}>
          <UserPlus className="size-4" />
          {lang === 'zh' ? '新建用户' : 'New user'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4" />
            {lang === 'zh' ? '账号列表' : 'Accounts'}
          </CardTitle>
          <CardAction>
            <div className="w-56">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <Search className="size-4 text-text-tertiary" />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder={lang === 'zh' ? '按微信 ID 搜索' : 'Filter by WeChat ID'}
                  aria-label={lang === 'zh' ? '按微信 ID 搜索' : 'Filter by WeChat ID'}
                />
              </InputGroup>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? (
            /* 首屏 / 换页 / 换搜索词时给骨架，不要把"还没取到"演成"一个用户都没有" */
            <div className="flex flex-col gap-2 py-4" role="status" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <TypographyMuted className="py-8 text-center text-sm">
              {lang === 'zh' ? `没有 ID 包含「${query}」的用户 · ` : `No ID matches “${query}” · `}
              <Button variant="text" size="sm" onClick={() => onQuery('')}>
                {lang === 'zh' ? '清除搜索' : 'clear search'}
              </Button>
            </TypographyMuted>
          ) : (
            <UsersTable
              users={users}
              lang={lang}
              currentWxId={currentWxId}
              busy={busy}
              onDetail={onDetail}
              onResetPassword={onResetPassword}
              onDelete={onDelete}
              onCommitLevel={onCommitLevel}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
              <SelectTrigger size="sm" aria-label={lang === 'zh' ? '每页条数' : 'Page size'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
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
                      onPage(Math.max(1, page - 1))
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
                          onPage(item)
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
                      onPage(Math.min(totalPages, page + 1))
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— 屏 2：用户详情抽屉 —————————————————

/* ================================================
   FLOW: Manage Users & Levels
   SCREEN 2 of 4: 用户详情抽屉
   ------------------------------------------------
   ENTRY:  SCREEN 1 行菜单「查看详情」
   EXIT:   关闭回到 SCREEN 1（列表状态不变）
   BRANCH: 无消息的用户 → 子表空态；无留痕的用户 → 时间线空态
   ================================================ */
export function Screen2_UserDetail({
  user,
  lang,
  open,
  onOpenChange,
  messages = [],
  auditLogs = [],
  loading = false,
  onResetPassword,
  onOpenMessage,
}: {
  user: AdminUserRow | null
  lang: Lang
  open: boolean
  onOpenChange: (v: boolean) => void
  /** 容器给的真数据（GET /admin/messages?wxId= / GET /admin/audit?wxId=）。
   *  默认空数组而不是退回 mock：抽屉里宁可显示"没有记录"，也不要显示编造的记录。 */
  messages?: Message[]
  auditLogs?: AuditEntry[]
  loading?: boolean
  onResetPassword: (u: AdminUserRow) => void
  /** 钻取单条消息的已读明细（跳 FLOW 3）。不给就不渲染行内入口 */
  onOpenMessage?: (m: Message) => void
}) {
  const msgs = messages
  const audit = auditLogs

  return (
    <Drawer open={open && !!user} onOpenChange={onOpenChange}>
      <DrawerContent side="right" showCloseButton>
        <DrawerHeader>
          <DrawerTitle className="font-mono">{user?.wxId}</DrawerTitle>
          <DrawerDescription>
            {lang === 'zh'
              ? `注册于 ${user?.createdAt ?? ''} · 等级决定消息容量、每日定位次数与保留时长`
              : `Registered ${user?.createdAt ?? ''} · level drives quota, daily geo lookups and retention`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-auto px-6 pb-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Item variant="outline" size="sm">
              <ItemMedia variant="icon">
                <Info className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemDescription>{t(lang, 'level')}</ItemDescription>
                <ItemTitle>
                  Lv {user?.level} {user && <StatusTag user={user} lang={lang} />}
                </ItemTitle>
              </ItemContent>
            </Item>
            <Item variant="outline" size="sm">
              <ItemMedia variant="icon">
                <UserRound className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemDescription>{lang === 'zh' ? '当前留存 / 累计注册' : 'Kept / registered'}</ItemDescription>
                <ItemTitle className="tabular-nums">
                  {user?.messageCount} / {user?.totalRegMsgs}
                </ItemTitle>
              </ItemContent>
            </Item>
            <Item variant="outline" size="sm">
              <ItemMedia variant="icon">
                <Clock3 className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemDescription>{t(lang, 'lastActive')}</ItemDescription>
                <ItemTitle>{user ? relTime(user.lastMsgAt, lang) : '—'}</ItemTitle>
              </ItemContent>
            </Item>
            <Item variant="outline" size="sm">
              <ItemMedia variant="icon">
                <ShieldAlert className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemDescription>{lang === 'zh' ? '后台权限来源' : 'Admin source'}</ItemDescription>
                <ItemTitle className="text-sm">
                  {user?.isAdmin
                    ? lang === 'zh'
                      ? 'env ADMIN 名单'
                      : 'env ADMIN list'
                    : lang === 'zh'
                      ? '无（普通用户）'
                      : 'none'}
                </ItemTitle>
              </ItemContent>
            </Item>
          </div>

          {/* 最新 5 条消息：抽屉宽度只有 384px，用两行式列表而不是表格 */}
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">{lang === 'zh' ? '最近注册的 5 条消息' : 'Latest 5 messages'}</div>
            {loading ? (
              /* "还没取到"和"这个账号没有消息"是两件事，不能都演成后者 */
              <div className="flex flex-col gap-2" role="status" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : msgs.length === 0 ? (
              <TypographyMuted className="text-xs">{lang === 'zh' ? '该账号还没有注册过消息' : 'No messages registered'}</TypographyMuted>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border-tertiary">
                <ul className="divide-y divide-border-tertiary">
                  {msgs.map((m) => (
                    <li key={m.id} className="flex items-start gap-1 px-3 py-2">
                      {/* 抽屉是 sm:max-w-sm = 384px，正文列按 max-content 撑开（实测整表 416 > 可视 271），
                          三列表格的后两列在任何视口下都落在横向滚动区外。所以这里用两行式列表：
                          已读数必须和正文同屏，它正是管理员决定"要不要钻取这条"的依据。 */}
                      {onOpenMessage && (
                        <Tooltip
                          content={lang === 'zh' ? '查看这条消息的已读明细' : 'Open read details for this message'}
                        >
                          <IconButton
                            icon={<ChevronRight className="size-3.5" />}
                            variant="ghost"
                            size="sm"
                            className="mt-0.5 shrink-0"
                            aria-label={lang === 'zh' ? '查看明细' : 'Details'}
                            onClick={() => onOpenMessage(m)}
                          />
                        </Tooltip>
                      )}
                      <div className="min-w-0 flex-1">
                        <EllipsisText tooltipContent={m.content}>{m.content}</EllipsisText>
                        <div className="text-xs text-text-secondary tabular-nums">
                          {lang === 'zh' ? `${m.reads} 次已读` : `${m.reads} reads`} ·{' '}
                          {displayTime(m.timestamp, lang)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <Separator />

          {/* audit_logs 一直在写，原先没有任何 UI —— 本次补上 */}
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t(lang, 'navAudit')}</div>
            {audit.length === 0 ? (
              <TypographyMuted className="text-xs">
                {lang === 'zh' ? '该账号近期没有后台可留痕的操作' : 'No audited actions recently'}
              </TypographyMuted>
            ) : (
              <Timeline>
                {audit.map((a) => (
                  <TimelineItem key={a.id}>
                    <TimelineMarker tone={a.tone === 'neutral' ? 'default' : a.tone}>
                      {a.tone === 'error' ? <Trash className="size-3" /> : <Check className="size-3" />}
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
          </section>
        </div>

        <DrawerFooter className="flex-row gap-2">
          {user && (
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                onOpenChange(false)
                onResetPassword(user)
              }}
            >
              <KeyRound className="size-4" />
              {lang === 'zh' ? '重置密码' : 'Reset password'}
            </Button>
          )}
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

// ————————————————— 屏 3：新建用户 / 重置密码 —————————————————

/* ================================================
   FLOW: Manage Users & Levels
   SCREEN 3 of 4: 新建用户（Dialog）/ 重置密码（Dialog）
   ------------------------------------------------
   ENTRY:  SCREEN 1「+ 新建用户」或行菜单「重置密码」
   EXIT:   提交成功 → 关闭并落回 SCREEN 4（局部插入 / Toast）
   BRANCH: wxId 重复或密码过短 → 字段级 inline 错误，Dialog 不关闭
   ================================================ */
export function Screen3_CreateUser({
  open,
  users,
  lang,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  users: AdminUserRow[]
  lang: Lang
  onOpenChange: (v: boolean) => void
  onCreate: (values: { wxId: string; password: string; level: number }) => void
}) {
  const [wxId, setWxId] = useState('')
  const [password, setPassword] = useState('')
  const [level, setLevel] = useState(1)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = touched ? validateNewUser(users, wxId, password) : {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{lang === 'zh' ? '新建用户' : 'New user'}</DialogTitle>
          <DialogDescription>
            {lang === 'zh'
              ? '直接写库，不校验部署方设置的注册邀请码，适用于自建初始化。'
              : 'Writes straight to the store and bypasses the invite code — meant for self-hosted bootstrapping.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* STATE: default — 三字段空，level 默认 1 */}
          {/* STATE: filled — 校验通过，创建可用 */}
          {/* STATE: submitting — 按钮 loading，字段 disabled */}
          {/* STATE: error — ID 重复 / 密码过短走字段级 inline，不用 Toast */}
          <Field orientation="vertical">
            <FieldLabel htmlFor="new-wxid">{t(lang, 'wxId')}</FieldLabel>
            <Input
              id="new-wxid"
              value={wxId}
              onChange={(e) => setWxId(e.target.value)}
              placeholder="wxid_xxxxxxxx"
              disabled={busy}
            />
            <FieldDescription>{lang === 'zh' ? '1–64 个可打印 ASCII 字符' : '1–64 printable ASCII characters'}</FieldDescription>
            <FieldError errors={errors.wxId ? [{ message: errors.wxId }] : undefined} />
          </Field>

          <Field orientation="vertical">
            <FieldLabel htmlFor="new-password">{t(lang, 'password')}</FieldLabel>
            <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            <FieldDescription>{lang === 'zh' ? '8–128 位，以 PBKDF2-HMAC-SHA256 加盐存储' : '8–128 chars, stored as PBKDF2-HMAC-SHA256'}</FieldDescription>
            <FieldError errors={errors.password ? [{ message: errors.password }] : undefined} />
          </Field>

          <Field orientation="horizontal">
            <FieldLabel htmlFor="new-level">{t(lang, 'level')}</FieldLabel>
            <ButtonGroup>
              <IconButton icon={<Minus className="size-3.5" />} variant="tertiary" size="sm" aria-label="level -" onClick={() => setLevel(Math.max(LEVEL_MIN, level - 1))} />
              <Input
                id="new-level"
                value={String(level)}
                onChange={(e) => setLevel(Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Number(e.target.value.replace(/\D/g, '')) || 0)))}
                inputMode="numeric"
                size="sm"
                className="w-14 text-center tabular-nums"
              />
              <IconButton icon={<Plus className="size-3.5" />} variant="tertiary" size="sm" aria-label="level +" onClick={() => setLevel(Math.min(LEVEL_MAX, level + 1))} />
            </ButtonGroup>
            <FieldDescription>
              {lang === 'zh' ? '0 = 仅禁止注册新消息；权益随等级由公式换算' : '0 = no new registrations; entitlements scale by formula'}
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            {t(lang, 'cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={busy}
            onClick={() => {
              setTouched(true)
              if (Object.keys(validateNewUser(users, wxId, password)).length > 0) return
              setBusy(true)
              window.setTimeout(() => {
                onCreate({ wxId, password, level })
                setBusy(false)
                setWxId('')
                setPassword('')
                setLevel(1)
                setTouched(false)
                onOpenChange(false)
                /* → 创建成功 → SCREEN 4：列表局部插入新行 */
              }, 500)
            }}
          >
            {lang === 'zh' ? '创建' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Screen3_ResetPassword({
  target,
  lang,
  onOpenChange,
  onSubmit,
}: {
  target: AdminUserRow | null
  lang: Lang
  onOpenChange: (v: boolean) => void
  onSubmit: (wxId: string, password: string) => void
}) {
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const err = touched && (password.length < 8 || password.length > 128) ? '密码长度需在 8–128 位之间' : undefined

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {lang === 'zh' ? '重置密码' : 'Reset password'}
            <span className="ms-1 font-mono text-sm font-normal">{target?.wxId}</span>
          </DialogTitle>
          <DialogDescription>
            {lang === 'zh' ? '保存后该用户的全部会话立即失效，需要用新密码重新登录。' : 'Saving revokes every session of this user.'}
          </DialogDescription>
        </DialogHeader>
        <Field orientation="vertical">
          <FieldLabel htmlFor="reset-password">{t(lang, 'newPassword')}</FieldLabel>
          <Input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FieldError errors={err ? [{ message: err }] : undefined} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            {t(lang, 'cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setTouched(true)
              if (!target || password.length < 8 || password.length > 128) return
              onSubmit(target.wxId, password)
              setPassword('')
              setTouched(false)
              onOpenChange(false)
              /* → 重置成功 → SCREEN 4：Toast 确认 */
            }}
          >
            {t(lang, 'save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ————————————————— 屏 4 的错误分支：服务器拒绝该变更 —————————————————

/* ================================================
   FLOW: Manage Users & Levels
   SCREEN 4 of 4: 变更后的列表（含阻断分支）
   ------------------------------------------------
   ENTRY:  任一等级变更、创建、重置、删除完成
   EXIT:  停留在列表继续操作
   BRANCH: 服务器拒绝的变更（env ADMIN 名单里的账号降到 Lv 0）→ AlertDialog 说明原因
           删除 ADMIN 名单里的账号 → 确认框额外说明权限收回方式
   ================================================ */
export function Screen4_LevelBlocked({
  blocked,
  lang,
  onClose,
}: {
  blocked: { user: AdminUserRow; reason: string } | null
  lang: Lang
  onClose: () => void
}) {
  return (
    <AlertDialog open={!!blocked} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-warning" />
            {lang === 'zh' ? '这个改动被拒绝' : 'Change not allowed'}
          </AlertDialogTitle>
          <AlertDialogDescription>{blocked?.reason}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{lang === 'zh' ? '知道了' : 'Got it'}</AlertDialogCancel>
          <AlertDialogAction onClick={onClose}>{t(lang, 'close')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ————————————————— Flow 组合器 —————————————————

export function Flow4_AdminUsers({
  lang = 'zh',
  currentWxId = '',
  onOpenMessage,
}: {
  lang?: Lang
  currentWxId?: string
  /** 详情抽屉里的「查看明细」→ 容器（router）跳 FLOW 3 单条消息钻取页 */
  onOpenMessage?: (m: Message) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detail, setDetail] = useState<AdminUserRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [blocked, setBlocked] = useState<{ user: AdminUserRow; reason: string } | null>(null)
  /** 正在提交写操作的那一行：同一行同时只允许一个动作，避免连点把等级改乱 */
  const [busyRow, setBusyRow] = useState<string | null>(null)

  // 原项目即 300ms 防抖；搜索词交给服务器（它支持精确匹配后回退模糊）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const users = useResource<Paged<AdminUserDto>>(adminUsersUrl({ q: debounced, page, pageSize }))
  const rows = users.data?.rows ?? []
  // 抽屉里的两块列表按选中的账号取；没选中就不请求（也避免 403 噪音）
  const detailMsgs = useResource<Paged<AdminMessageDto>>(detail ? adminMessagesUrl(detail.wxId) : null)
  const detailAudit = useResource<AuditDto>(detail ? adminAuditUrl(detail.wxId) : null)

  const fail = (e: unknown, fallback: string) => {
    const code = e instanceof ApiError ? e.code : String(e)
    toast.error(`${fallback}${code ? `（${code}）` : ''}`)
  }

  /**
   * 改等级。服务器成功后重取整页而不是本地改那一行：
   * level 变了 canRegister 也跟着变，还会牵动额度显示，本地补丁很容易漏掉连带项。
   *
   * 管理员改自己的等级是允许的（决策：2026-09-19）。唯一的硬限制在服务器那边 ——
   * env ADMIN 名单里的账号不能被降到 0，所以这里的错误分支照服务器的说法报，
   * 不再由前端自定一条"不能动自己"的规则。
   */
  const commitLevel = async (user: AdminUserRow, next: number) => {
    const from = user.level
    setBusyRow(user.wxId)
    try {
      await adminSetLevel(user.wxId, next)
      users.reload()
      setDetail((d) => (d && d.wxId === user.wxId ? { ...d, level: next, canRegister: next > 0 } : d))
      toast.success(
        lang === 'zh'
          ? `${user.wxId}：Lv ${from} → Lv ${next}${next === 0 ? ' · 已停注册' : ''}`
          : `${user.wxId}: Lv ${from} → Lv ${next}`,
      )
      /* → 局部更新该行，不刷新整页 */
    } catch (e) {
      const code = e instanceof ApiError ? e.code : String(e)
      if (code.includes('protected')) {
        setBlocked({
          user,
          reason:
            lang === 'zh'
              ? `${user.wxId} 在部署的 env ADMIN 名单里，不能降到 Lv 0。要真正收回后台权限，请改环境变量里的 ADMIN 并重新部署。`
              : `${user.wxId} is in the deployed env ADMIN list and cannot drop to Lv 0. To revoke admin, edit the ADMIN env and redeploy.`,
        })
      } else {
        fail(e, lang === 'zh' ? '改等级失败：' : 'Level update failed: ')
      }
    } finally {
      setBusyRow(null)
    }
  }

  const createUser = async (form: { wxId: string; password: string; level: number }) => {
    try {
      await adminCreateUser(form)
    } catch (e) {
      // 409 exists 是最常见的一种，文案要分得开
      fail(e, lang === 'zh' ? '创建失败：' : 'Create failed: ')
      return
    }
    setCreateOpen(false)
    users.reload()
    toast.success(lang === 'zh' ? `已创建 ${form.wxId} · Lv ${form.level}` : `Created ${form.wxId} · Lv ${form.level}`)
  }

  const resetPassword = async (wxId: string, password: string) => {
    try {
      await adminResetPassword(wxId, password)
    } catch (e) {
      fail(e, lang === 'zh' ? '重置失败：' : 'Reset failed: ')
      return
    }
    // 服务器会顺带删掉该用户全部会话，这句"其全部会话已失效"从此有了依据
    toast.success(lang === 'zh' ? `已重置 ${wxId} 的密码，其全部会话已失效` : `Password reset; all sessions of ${wxId} revoked`)
    setResetTarget(null)
  }

  const deleteUser = async () => {
    if (!deleteTarget || confirmText !== deleteTarget.wxId) return
    const wxId = deleteTarget.wxId
    setBusyRow(wxId)
    try {
      await adminDeleteUser(wxId)
    } catch (e) {
      fail(e, lang === 'zh' ? '删除失败：' : 'Delete failed: ')
      setBusyRow(null)
      return
    }
    setBusyRow(null)
    setDeleteTarget(null)
    setConfirmText('')
    users.reload()
    toast.success(lang === 'zh' ? `已删除 ${wxId}` : `Deleted ${wxId}`)
    /* → 确认删除 → SCREEN 4：行移除 */
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Screen1_UsersList
        users={rows}
        lang={lang}
        query={query}
        page={page}
        pageSize={pageSize}
        total={users.data?.total ?? 0}
        loading={users.loading}
        currentWxId={currentWxId}
        busy={busyRow}
        onQuery={(v) => {
          setQuery(v)
          setPage(1)
        }}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n)
          setPage(1)
        }}
        onDetail={setDetail}
        onResetPassword={setResetTarget}
        onDelete={(u) => {
          setDeleteTarget(u)
          setConfirmText('')
        }}
        onCreate={() => setCreateOpen(true)}
        onCommitLevel={commitLevel}
      />

      <Screen2_UserDetail
        user={detail}
        lang={lang}
        open={!!detail}
        loading={detailMsgs.loading}
        messages={(detailMsgs.data?.rows ?? []).map(toAdminMessage)}
        auditLogs={detailAudit.data ? toAuditEntries(detailAudit.data) : []}
        onOpenChange={(v) => !v && setDetail(null)}
        onResetPassword={setResetTarget}
        onOpenMessage={onOpenMessage}
      />

      <Screen3_CreateUser open={createOpen} users={rows} lang={lang} onOpenChange={setCreateOpen} onCreate={createUser} />

      <Screen3_ResetPassword
        target={resetTarget}
        lang={lang}
        onOpenChange={(v) => !v && setResetTarget(null)}
        onSubmit={(wxId, password) => void resetPassword(wxId, password)}
      />

      {/* 删除用户：不可逆 + 涉及他人数据，输入 wxId 强确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash className="size-4 text-error" />
              {lang === 'zh' ? `删除 ${deleteTarget?.wxId}？` : `Delete ${deleteTarget?.wxId}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === 'zh'
                ? `将删除该账号、它的 ${deleteTarget?.messageCount ?? 0} 条消息与全部已读记录，不可恢复。`
                : `This removes the account, its ${deleteTarget?.messageCount ?? 0} messages and every read row. Irreversible.`}
              {deleteTarget?.isAdmin && (
                <span className="mt-2 block text-warning">
                  {lang === 'zh'
                    ? `注意：${deleteTarget.wxId} 在部署的 env ADMIN 名单里。删库不会收回后台权限 —— 用同一 wxId 重新注册即可立刻恢复管理员。要真正收回，请改环境变量里的 ADMIN 并重新部署。`
                    : `Note: ${deleteTarget.wxId} is in the deployed env ADMIN list. Deleting the row does not revoke admin — re-registering the same wxId gets it straight back. Change the ADMIN env and redeploy.`}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field orientation="vertical">
            <FieldLabel htmlFor="confirm-wxid">
              {lang === 'zh' ? `输入 ${deleteTarget?.wxId} 以确认` : `Type ${deleteTarget?.wxId} to confirm`}
            </FieldLabel>
            <Input
              id="confirm-wxid"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleteTarget?.wxId}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(lang, 'cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={confirmText !== deleteTarget?.wxId} onClick={deleteUser}>
              {lang === 'zh' ? '确认删除' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Screen4_LevelBlocked blocked={blocked} lang={lang} onClose={() => setBlocked(null)} />
    </div>
  )
}
