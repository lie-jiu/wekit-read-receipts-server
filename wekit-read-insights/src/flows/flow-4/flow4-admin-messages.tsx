// ============================================================
// FLOW 4 · 运营：全站消息
// ------------------------------------------------------------
// 「用户管理」的抽屉只能按账号看最新 5 条，管理员因此没法回答
// "最近全站注册了什么"、"哪条消息被读得最多" 这类横向问题。
// 这一屏就是 GET /admin/messages 不带 wxId 的那条分支。
//
// 与「操作留痕」同一套做法：两个过滤条件（正文关键词 / 账号）都拼进查询串
// 交给服务器，分页也在服务器 —— 这张表是全站口径，前端筛只会得到"本页没有"。
//
// 行内不显示"是否公开 / 首读耗时 / 被屏蔽数"：这个端点按行只给
// id / wxId / content / timestamp / 已读数，缺的字段宁可不要显示，也不要编。
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
  EllipsisText,
  IconButton,
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
  Tooltip,
  TypographyMuted,
} from 'sparkdesign'
import { ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react'
import { displayTime } from '../shared/mock-data'
import { pageItems } from '../shared/pagination'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type { Message } from '../shared/types'
import { useResource } from '../../data/hooks'
import { adminMessagesUrl, toAdminMessage, type AdminMessagesDto } from '../../data/admin'

/** 与服务器 clampLimit 的上界一致（/admin/messages 是 100）：超过会被收敛，翻页显示就对不上 */
const PAGE_SIZES = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

// ————————————————— 屏 1：全站消息 —————————————————

/* ================================================
   FLOW: Site-wide messages
   SCREEN 1 of 1: 全站消息列表（正文 / 账号过滤 + 服务器分页 + 行内钻取）
   ------------------------------------------------
   ENTRY:  Sidebar「运营 › 全站消息」（仅 isAdmin 渲染）
   BRANCH: loading → 骨架行
           error(403) → 权限说明；error(其他) → 重试
           无筛选无命中 → 空态；有筛选无命中 → 空态 + 清除筛选
   ================================================ */
export function Screen1_MessagesList({
  rows,
  total,
  page,
  totalPages,
  lang,
  state,
  fetchedAt,
  qDraft,
  wxDraft,
  pageSize,
  hasFilter,
  onQDraft,
  onWxDraft,
  onSubmit,
  onPageSize,
  onPage,
  onClear,
  onReload,
  onOpenMessage,
  onOpenUser,
}: {
  rows: Message[]
  total: number
  page: number
  totalPages: number
  lang: Lang
  state: 'loading' | 'ready' | 'error'
  fetchedAt: number | null
  qDraft: string
  wxDraft: string
  pageSize: number
  hasFilter: boolean
  onQDraft: (v: string) => void
  onWxDraft: (v: string) => void
  onSubmit: () => void
  onPageSize: (v: number) => void
  onPage: (p: number) => void
  onClear: () => void
  onReload: () => void
  onOpenMessage?: (m: Message) => void
  onOpenUser?: (wxId: string) => void
}) {
  const zh = lang === 'zh'

  const columns = [
    {
      key: 'content',
      header: zh ? '消息' : 'Message',
      cell: (r: Message) => (
        <div className="flex min-w-0 items-center gap-1">
          {onOpenMessage && (
            <Tooltip content={zh ? '查看这条消息的已读明细' : 'Open read details for this message'}>
              <IconButton
                icon={<ChevronRight className="size-3.5" />}
                variant="ghost"
                size="sm"
                aria-label={zh ? '查看明细' : 'Details'}
                onClick={() => onOpenMessage(r)}
              />
            </Tooltip>
          )}
          <EllipsisText className="min-w-0 max-w-[26rem]" tooltipContent={r.content}>
            {r.content}
          </EllipsisText>
        </div>
      ),
    },
    {
      key: 'wxId',
      header: zh ? '账号' : 'Account',
      cell: (r: Message) =>
        onOpenUser ? (
          <Button variant="text" size="sm" className="font-mono" onClick={() => onOpenUser(r.wxId)}>
            {r.wxId}
          </Button>
        ) : (
          <span className="font-mono text-sm">{r.wxId}</span>
        ),
    },
    {
      key: 'reads',
      header: zh ? '已读' : 'Reads',
      cell: (r: Message) => <span className="text-sm tabular-nums">{fmtNum(r.reads)}</span>,
    },
    {
      key: 'timestamp',
      header: zh ? '发送时间' : 'Sent',
      cell: (r: Message) => <span className="text-sm tabular-nums text-text-secondary">{displayTime(r.timestamp, lang)}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">{zh ? '全站消息' : 'Site-wide Messages'}</h1>
        <TypographyMuted className="text-sm">
          {zh
            ? `各账号当前留存的注册消息 · 共 ${fmtNum(total)} 条`
            : `Messages accounts currently keep · ${fmtNum(total)} in total`}
        </TypographyMuted>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-4" />
            {zh ? '消息列表' : 'All messages'}
          </CardTitle>
          <CardAction>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* 两个过滤框都是草稿态：敲回车或点「查」才打服务器，
                  不必为每个字符发一次全站查询 */}
              <div className="w-52">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <Search className="size-4 text-text-tertiary" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={qDraft}
                    onChange={(e) => onQDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onSubmit()
                      }
                    }}
                    placeholder={zh ? '正文关键词' : 'Search content'}
                    aria-label={zh ? '正文关键词' : 'Search content'}
                  />
                </InputGroup>
              </div>
              <div className="w-48">
                <InputGroup>
                  <InputGroupInput
                    value={wxDraft}
                    onChange={(e) => onWxDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onSubmit()
                      }
                    }}
                    placeholder={zh ? '按账号筛选' : 'Filter by account'}
                    aria-label={zh ? '按账号筛选' : 'Filter by account'}
                  />
                </InputGroup>
              </div>
              <Button variant="text" size="sm" onClick={onSubmit}>
                {zh ? '查' : 'Go'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onReload}
                loading={state === 'loading' && rows.length > 0}
                aria-label={zh ? '刷新' : 'Reload'}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state === 'loading' ? (
            /* 首屏取数时给骨架，不要把"还没取到"演成"一条消息都没有" */
            <div className="flex flex-col gap-2 py-4" role="status" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : state === 'error' ? (
            <Alert variant="destructive">
              <AlertTitle>{zh ? '消息读取失败' : 'Could not load messages'}</AlertTitle>
              <AlertDescription>{zh ? '点右上角刷新重试。' : 'Try the refresh button above.'}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <TypographyMuted className="py-8 text-center text-sm">
              {hasFilter ? (
                <>
                  {zh ? '没有符合筛选条件的消息 · ' : 'Nothing matches these filters · '}
                  <Button variant="text" size="sm" onClick={onClear}>
                    {zh ? '清除筛选' : 'clear filters'}
                  </Button>
                </>
              ) : (
                (zh ? '还没有任何账号注册过消息' : 'No messages have been registered yet')
              )}
            </TypographyMuted>
          ) : (
            <>
              <ResponsiveTable
                columns={columns}
                data={rows}
                primary="content"
                metaKey="timestamp"
                emptyText={zh ? '没有匹配的消息' : 'No matching messages'}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TypographyMuted className="text-xs tabular-nums">
                  {zh
                    ? `第 ${page} / ${fmtNum(totalPages)} 页 · 共 ${fmtNum(total)} 条 · 取数于 ${fetchedAt === null ? '—' : displayTime(new Date(fetchedAt).toISOString().slice(0, 19).replace('T', ' '), lang)}`
                    : `Page ${page} of ${fmtNum(totalPages)} · ${fmtNum(total)} messages · fetched ${fetchedAt === null ? '—' : `${new Date(fetchedAt).toISOString().slice(0, 19).replace('T', ' ')} UTC`}`}
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

          <Alert variant="warning">
            <AlertDescription>
              {zh
                ? '这里列的是各账号当前仍保留的消息。账号的等级决定它能保留多少条以及保留多久，超出的最旧一条会被自动淘汰，所以这不是注册历史的全量。'
                : 'This lists what accounts still keep. Each account’s level caps how many messages and how long, and the oldest past that cap is dropped automatically — this is not the full registration history.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— Flow 组合器 —————————————————

export function Flow4_AdminMessages({
  lang = 'zh',
  onOpenMessage,
  onOpenUser,
}: {
  lang?: Lang
  /** 行内「查看明细」→ FLOW 3 单条消息钻取页 */
  onOpenMessage?: (m: Message) => void
  /** 账号列 → 「用户管理」页并按该账号筛选 */
  onOpenUser?: (wxId: string) => void
}) {
  const zh = lang === 'zh'
  /** 已提交的过滤词。输入框另有草稿态，所以改字不会立刻打服务器 */
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [wx, setWx] = useState('')
  const [wxDraft, setWxDraft] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  const url = adminMessagesUrl({ q, wxId: wx, page, pageSize })
  const res = useResource<AdminMessagesDto>(url)
  const dto = res.data

  const state: 'loading' | 'ready' | 'error' = res.error ? 'error' : res.loading && !dto ? 'loading' : 'ready'

  const rows = dto ? dto.rows.map(toAdminMessage) : []
  const total = dto?.total ?? 0
  const totalPages = dto?.totalPages ?? 1
  const hasFilter = q !== '' || wx !== ''

  /** 换筛选条件就回第 1 页：停在第 3 页看一个新过滤词，最可能拿到空表并被当成"没有记录" */
  const apply = (next: { q?: string; wxId?: string; pageSize?: number }) => {
    if (next.q !== undefined) setQ(next.q.trim())
    if (next.wxId !== undefined) setWx(next.wxId.trim())
    if (next.pageSize !== undefined) setPageSize(next.pageSize)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Screen1_MessagesList
        rows={rows}
        total={total}
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        lang={lang}
        state={state}
        fetchedAt={res.fetchedAt}
        qDraft={qDraft}
        wxDraft={wxDraft}
        pageSize={pageSize}
        hasFilter={hasFilter}
        onQDraft={setQDraft}
        onWxDraft={setWxDraft}
        onSubmit={() => apply({ q: qDraft, wxId: wxDraft })}
        onPageSize={(v) => apply({ pageSize: v })}
        onPage={setPage}
        onClear={() => {
          setQDraft('')
          setWxDraft('')
          apply({ q: '', wxId: '' })
        }}
        onReload={res.reload}
        onOpenMessage={onOpenMessage}
        onOpenUser={onOpenUser}
      />

      {state === 'error' && res.error?.forbidden && (
        <Alert variant="warning">
          <AlertDescription>
            {zh
              ? '当前账号没有运营权限。可能是登录已过期，也可能是这个账号不在管理名单里。'
              : 'This account has no operations access — the session may have expired, or the account is not listed as an operator.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
