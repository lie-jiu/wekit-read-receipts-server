// ============================================================
// FLOW 4 · 运营：操作留痕（全站）
// ------------------------------------------------------------
// audit_logs 一直在写，原先只有"某个账号的留痕"这一种看法（FLOW 4 屏 2 的
// Timeline）。这一屏是它的全站视角：谁在什么时候对哪个账号做了什么。
//
// 与「全局黑名单」那一屏的关键差别：那张名单服务器一次给回整份，筛选留在前端；
// 这张表是全站的，只能服务器分页。所以两个过滤条件（账号 / 动作）都拼进查询串
// 交给服务器 —— 在前端筛会得到"本页没有"的假结论，翻页后结果还会突然变多。
//
// 账号列的语义要小心：多数行是操作发起人，但「删除账号 / 清空某账号消息」这类
// 后台操作记的是被操作的一方（发起人写在详情里）。这一点必须在页面上说清，
// 否则管理员会据此判断"某人删了东西"。
// ============================================================

import { useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
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
  Skeleton,
  Tag,
  TypographyMuted,
} from 'sparkdesign'
import { Info, RefreshCw, ScrollText, Search } from 'lucide-react'
import { displayTime } from '../shared/mock-data'
import { pageItems } from '../shared/pagination'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type { AuditEntry } from '../shared/types'
import { useResource } from '../../data/hooks'
import { AUDIT_ACTION_GROUPS, auditActionLabel, auditListUrl, toAuditEntries, type AuditDto } from '../../data/admin'

/** 与服务器 clampLimit 的上界一致：超过会被收敛，翻页显示就会对不上 */
const PAGE_SIZES = [20, 50, 100, 200]
const DEFAULT_PAGE_SIZE = 50

/**
 * 下拉里"不过滤"这一项的取值。不能直接用空串：Radix 的 SelectItem 以空串作 value 时
 * 既不会被触发器显示成已选（按钮会空着），选中它也不会回抛 onValueChange —— 实测踩过。
 * 所以界面内用这个哨兵，拼 URL 时才换算回"不带 action 参数"。
 */
const ACTION_ALL = '__all__'
const ACTION_OPTIONS: Array<{ value: string; label: (lang: Lang) => string }> = AUDIT_ACTION_GROUPS.flatMap((g) =>
  g.actions.map((a) => ({ value: a, label: (lang: Lang) => auditActionLabel(a, lang) })),
)

function toneColor(tone: AuditEntry['tone']): 'success' | 'warning' | 'error' | 'slate' {
  return tone === 'neutral' ? 'slate' : tone
}

// ————————————————— 屏 1：全站留痕 —————————————————

/* ================================================
   FLOW: Audit Log
   SCREEN 1 of 1: 全站操作留痕（账号 / 动作过滤 + 服务器分页）
   ------------------------------------------------
   ENTRY:  Sidebar「运营 › 操作留痕」（仅 isAdmin 渲染）
   BRANCH: loading → 骨架行
           error(403) → 权限说明；error(其他) → 重试
           无条件无命中 → 空态；有筛选无命中 → 空态 + 清除筛选
   ================================================ */
export function Screen1_AuditLog({
  entries,
  total,
  page,
  totalPages,
  lang,
  state,
  fetchedAt,
  wxDraft,
  action,
  pageSize,
  hasFilter,
  onWxDraft,
  onWxSubmit,
  onAction,
  onPageSize,
  onPage,
  onClear,
  onReload,
}: {
  entries: AuditEntry[]
  total: number
  page: number
  totalPages: number
  lang: Lang
  state: 'loading' | 'ready' | 'error'
  fetchedAt: number | null
  wxDraft: string
  action: string
  pageSize: number
  hasFilter: boolean
  onWxDraft: (v: string) => void
  onWxSubmit: () => void
  onAction: (v: string) => void
  onPageSize: (v: number) => void
  onPage: (p: number) => void
  onClear: () => void
  onReload: () => void
}) {
  const zh = lang === 'zh'

  const columns = [
    {
      key: 'timestamp',
      header: zh ? '时间' : 'When',
      cell: (r: AuditEntry) => (
        <span className="text-sm tabular-nums text-text-secondary">{displayTime(r.timestamp, lang)}</span>
      ),
    },
    {
      key: 'wxId',
      header: zh ? '账号' : 'Account',
      cell: (r: AuditEntry) =>
        r.wxId ? (
          <span className="font-mono text-sm">{r.wxId}</span>
        ) : (
          <TypographyMuted className="text-sm">—</TypographyMuted>
        ),
    },
    {
      key: 'action',
      header: zh ? '操作' : 'Action',
      // title 留原始动作名：新增动作在这里还没对照时，管理员需要看得见服务器写的是什么
      cell: (r: AuditEntry) => (
        <span title={r.action}>
          <Tag color={toneColor(r.tone)} appearance="outline">
            {auditActionLabel(r.action, lang)}
          </Tag>
        </span>
      ),
    },
    {
      key: 'detail',
      header: zh ? '详情' : 'Detail',
      cell: (r: AuditEntry) =>
        r.detail ? (
          <span className="block max-w-[22rem] truncate font-mono text-xs text-text-secondary" title={r.detail}>
            {r.detail}
          </span>
        ) : (
          <TypographyMuted className="text-sm">—</TypographyMuted>
        ),
    },
    {
      key: 'ip',
      header: zh ? '来源 IP' : 'Source IP',
      cell: (r: AuditEntry) =>
        r.ip ? (
          <span className="font-mono text-xs">{r.ip}</span>
        ) : (
          <TypographyMuted className="text-sm">—</TypographyMuted>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">{zh ? '操作留痕' : 'Audit Log'}</h1>
        <TypographyMuted className="text-sm">
          {zh
            ? `后台与账号的关键操作 · 共 ${fmtNum(total)} 条`
            : `Key account and admin actions · ${fmtNum(total)} entries`}
        </TypographyMuted>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4" />
            {zh ? '全站记录' : 'All entries'}
          </CardTitle>
          <CardAction>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* 账号过滤是精确匹配，交给服务器：敲回车或点按钮才提交，
                  不必为每个字符发一次全站查询 */}
              <div className="w-48">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <Search className="size-4 text-text-tertiary" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={wxDraft}
                    onChange={(e) => onWxDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onWxSubmit()
                      }
                    }}
                    placeholder={zh ? '按账号筛选' : 'Filter by account'}
                    aria-label={zh ? '按账号筛选' : 'Filter by account'}
                  />
                  <InputGroupAddon align="inline-end">
                    <Button variant="text" size="sm" onClick={onWxSubmit}>
                      {zh ? '查' : 'Go'}
                    </Button>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              <Select value={action} onValueChange={onAction}>
                <SelectTrigger size="sm" aria-label={zh ? '按操作类型筛选' : 'Filter by action'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACTION_ALL}>{zh ? '全部操作' : 'All actions'}</SelectItem>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label(lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={onReload}
                loading={state === 'loading' && entries.length > 0}
                aria-label={zh ? '刷新' : 'Reload'}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state === 'loading' ? (
            /* 首屏取数时给骨架，不要把"还没取到"演成"一条记录都没有" */
            <div className="flex flex-col gap-2 py-4" role="status" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : state === 'error' ? (
            <Alert variant="destructive">
              <AlertTitle>{zh ? '记录读取失败' : 'Could not load the log'}</AlertTitle>
              <AlertDescription>
                {zh ? '点右上角刷新重试。' : 'Try the refresh button above.'}
              </AlertDescription>
            </Alert>
          ) : entries.length === 0 ? (
            <TypographyMuted className="py-8 text-center text-sm">
              {hasFilter ? (
                <>
                  {zh ? '没有符合筛选条件的记录 · ' : 'Nothing matches these filters · '}
                  <Button variant="text" size="sm" onClick={onClear}>
                    {zh ? '清除筛选' : 'clear filters'}
                  </Button>
                </>
              ) : (
                (zh ? '还没有任何留痕记录' : 'Nothing has been recorded yet')
              )}
            </TypographyMuted>
          ) : (
            <>
              <ResponsiveTable
                columns={columns}
                data={entries}
                primary="action"
                metaKey="timestamp"
                emptyText={zh ? '没有匹配的记录' : 'No matching entries'}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TypographyMuted className="text-xs tabular-nums">
                  {zh
                    ? `第 ${page} / ${fmtNum(totalPages)} 页 · 共 ${fmtNum(total)} 条 · 取数于 ${fetchedAt === null ? '—' : displayTime(new Date(fetchedAt).toISOString().slice(0, 19).replace('T', ' '), lang)}`
                    : `Page ${page} of ${fmtNum(totalPages)} · ${fmtNum(total)} entries · fetched ${fetchedAt === null ? '—' : `${new Date(fetchedAt).toISOString().slice(0, 19).replace('T', ' ')} UTC`}`}
                </TypographyMuted>
                <div className="flex items-center gap-3">
                  <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
                    <SelectTrigger size="sm" aria-label={zh ? '每页条数' : 'Page size'}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} / {zh ? '页' : 'page'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {totalPages > 1 && (
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            text={zh ? '上一页' : 'Previous'}
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
                            text={zh ? '下一页' : 'Next'}
                            aria-disabled={page === totalPages}
                            onClick={(e) => {
                              e.preventDefault()
                              onPage(Math.min(totalPages, page + 1))
                            }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </div>
            </>
          )}

          <Alert variant="info">
            <AlertTitle>{zh ? '这两列分别是谁' : 'Which account is which'}</AlertTitle>
            <AlertDescription>
              {zh
                ? '登录、注册、改密码、拉黑 IP 这类自己名下的操作，账号列就是操作发起人；删除账号、清空某账号的消息这类后台操作，账号列是被操作的一方，执行人记在详情里。'
                : "For an account's own actions (sign-in, password, blocklists) the account column is who did it. For admin actions on someone else, it is the account acted upon — who did it is in the detail."}
            </AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertDescription className="flex items-center gap-2">
              <Info className="size-3.5 shrink-0" />
              {zh
                ? '这里只显示服务器仍在保留的记录，越早的操作可能已经不在其中。'
                : 'Only the records still being kept appear here; older ones may already be gone.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— Flow 组合器 —————————————————

export function Flow4_AdminAudit({ lang = 'zh' }: { lang?: Lang }) {
  const zh = lang === 'zh'
  /** 已提交的账号过滤词。输入框另有草稿态，所以改字不会立刻打服务器 */
  const [wxFilter, setWxFilter] = useState('')
  const [wxDraft, setWxDraft] = useState('')
  const [action, setAction] = useState(ACTION_ALL)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  const url = auditListUrl({
    wxId: wxFilter,
    action: action === ACTION_ALL ? '' : action,
    page,
    pageSize,
  })
  const res = useResource<AuditDto>(url)
  const dto = res.data

  const state: 'loading' | 'ready' | 'error' = res.error
    ? 'error'
    : res.loading && !dto
      ? 'loading'
      : 'ready'

  const entries = dto ? toAuditEntries(dto) : []
  const total = dto?.total ?? 0
  const totalPages = dto?.totalPages ?? 1
  const hasFilter = wxFilter !== '' || action !== ACTION_ALL

  /** 换筛选条件就回第 1 页：停在第 3 页看一个新过滤词，最可能拿到空表并被当成"没有记录" */
  const apply = (next: { wxId?: string; action?: string; pageSize?: number }) => {
    if (next.wxId !== undefined) setWxFilter(next.wxId.trim())
    if (next.action !== undefined) setAction(next.action)
    if (next.pageSize !== undefined) setPageSize(next.pageSize)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Screen1_AuditLog
        entries={entries}
        total={total}
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        lang={lang}
        state={state}
        fetchedAt={res.fetchedAt}
        wxDraft={wxDraft}
        action={action}
        pageSize={pageSize}
        hasFilter={hasFilter}
        onWxDraft={setWxDraft}
        onWxSubmit={() => apply({ wxId: wxDraft })}
        onAction={(v) => apply({ action: v })}
        onPageSize={(v) => apply({ pageSize: v })}
        onPage={setPage}
        onClear={() => {
          setWxDraft('')
          apply({ wxId: '', action: ACTION_ALL })
        }}
        onReload={res.reload}
      />

      {state === 'error' && res.error?.forbidden && (
        <Alert variant="warning">
          <AlertDescription className="flex items-center gap-2">
            <Info className="size-3.5 shrink-0" />
            {zh
              ? '当前账号没有运营权限。可能是登录已过期，也可能是这个账号不在管理名单里。'
              : 'This account has no operations access — the session may have expired, or the account is not listed as an operator.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
