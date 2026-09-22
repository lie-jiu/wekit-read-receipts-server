// ============================================================
// FLOW 4 · 运营：全局 IP 黑名单
// ------------------------------------------------------------
// 与「用户管理」同一套 DataTable + 确认框范式，但作用域是三级里最大的一级：
// 这里的一条 IP 会让**全站所有账号**的已读明细都看不到它，包括别人消息的
// 公开链接。所以：
//   · 移除要单独确认（加错一个人只影响一条消息，删错一条影响所有人的报表）
//   · 页面上必须写清作用域，不能让人以为它和「我名下」是一回事
//
// 服务器一次给回整份名单（没有分页/搜索参数），所以筛选与翻页都在前端做。
// ============================================================

import { useState } from 'react'
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
  Skeleton,
  TypographyMuted,
  toast,
} from 'sparkdesign'
import { Ban, Info, RefreshCw, Search, ShieldBan } from 'lucide-react'
import { displayTime } from '../shared/mock-data'
import { pageItems } from '../shared/pagination'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum, t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import { validIp } from '../shared/ip'
import type { IpBlockEntry, IpBlockList } from '../shared/types'
import { ApiError } from '../../data/api'
import { useResource } from '../../data/hooks'
import { GLOBAL_BLOCK_URL, addGlobalBlock, removeGlobalBlock } from '../../data/admin'

/** 名单是整份取回的，翻页只是切视图 */
const PAGE_SIZE = 20

// ————————————————— 屏 1：名单 —————————————————

/* ================================================
   FLOW: Global IP Blocklist
   SCREEN 1 of 1: 全局名单（添加 / 筛选 / 翻页 / 移除）
   ------------------------------------------------
   ENTRY:  Sidebar「运营 › 全局黑名单」（仅 isAdmin 渲染）
   BRANCH: loading → 骨架行
           error(403) → 权限说明；error(其他) → 重试
           空名单 → 空态；筛选无命中 → 空态 + 清除筛选
   ================================================ */
export function Screen1_GlobalBlocklist({
  blocks,
  lang,
  state,
  query,
  page,
  rows,
  total,
  onQuery,
  onPage,
  onAdd,
  onRemove,
  onReload,
}: {
  blocks: IpBlockList | null
  lang: Lang
  /** 名单是独立一次请求：没取到和取到空表是两件事 */
  state: 'loading' | 'ready' | 'error'
  query: string
  page: number
  rows: IpBlockEntry[]
  total: number
  onQuery: (v: string) => void
  onPage: (p: number) => void
  /** 返回错误文案表示没加成；undefined 表示成功 */
  onAdd: (ip: string) => Promise<string | undefined>
  onRemove: (ip: string) => void
  onReload: () => void
}) {
  const zh = lang === 'zh'
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const v = draft.trim()
    if (!validIp(v)) {
      setErr(zh ? '请输入合法的 IP 地址，例如 203.0.113.7 或 2001:db8::1' : 'Enter a valid IP address, e.g. 203.0.113.7 or 2001:db8::1')
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
  }

  const columns = [
    {
      key: 'ip',
      header: t(lang, 'ipCase'),
      cell: (r: IpBlockEntry) => <span className="font-mono text-sm">{r.ip}</span>,
    },
    {
      key: 'createdAt',
      header: zh ? '加入时间' : 'Added at',
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = query.trim() !== ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text">{zh ? '全局黑名单' : 'Global IP Blocklist'}</h1>
          <TypographyMuted className="text-sm">
            {zh
              ? `作用域：全站所有账号的全部消息 · 当前 ${fmtNum(blocks?.count ?? 0)} 条`
              : `Applies to every message of every account · ${fmtNum(blocks?.count ?? 0)} entries`}
          </TypographyMuted>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldBan className="size-4" />
            {zh ? '已拉黑的 IP' : 'Blocked IPs'}
          </CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <div className="w-56">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <Search className="size-4 text-text-tertiary" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder={zh ? '按 IP 筛选' : 'Filter by IP'}
                    aria-label={zh ? '按 IP 筛选' : 'Filter by IP'}
                  />
                </InputGroup>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onReload}
                loading={state === 'loading' && blocks !== null}
                aria-label={zh ? '刷新名单' : 'Reload list'}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* STATE: default — 输入框空 */}
          {/* STATE: filled — 合法 IP，添加可用 */}
          {/* STATE: error — 非法或重复，inline 提示且保留已输入内容 */}
          <div className="flex flex-col gap-2">
            <InputGroup>
              <InputGroupInput
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setErr(undefined)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) void submit()
                }}
                placeholder="203.0.113.7"
                aria-label={zh ? '要全局拉黑的 IP' : 'IP to block globally'}
              />
              <InputGroupAddon align="inline-end">
                <Button variant="secondary" size="sm" loading={busy} disabled={busy} onClick={() => void submit()}>
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

          {state === 'loading' ? (
            /* 首屏取数时给骨架，不要把"还没取到"演成"一个人都没拉黑" */
            <div className="flex flex-col gap-2 py-4" role="status" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : state === 'error' ? (
            <Alert variant="destructive">
              <AlertTitle>{zh ? '名单读取失败' : 'Could not load the list'}</AlertTitle>
              <AlertDescription>
                {zh
                  ? '添加与移除操作暂时不要做，先点右上角刷新重试。'
                  : 'Skip adding or removing entries until a refresh succeeds.'}
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <TypographyMuted className="py-8 text-center text-sm">
              {filtered ? (
                <>
                  {zh ? `没有 IP 包含「${query}」 · ` : `No IP matches “${query}” · `}
                  <Button variant="text" size="sm" onClick={() => onQuery('')}>
                    {zh ? '清除筛选' : 'clear filter'}
                  </Button>
                </>
              ) : (
                zh ? '全局名单目前是空的' : 'No IP is blocked globally yet'
              )}
            </TypographyMuted>
          ) : (
            <>
              <ResponsiveTable
                columns={columns}
                data={rows}
                primary="ip"
                metaKey="createdAt"
                emptyText={zh ? '没有匹配的记录' : 'No matching entries'}
              />
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2">
                  <TypographyMuted className="text-xs tabular-nums">
                    {zh ? `第 ${page} / ${totalPages} 页 · 共 ${fmtNum(total)} 条` : `Page ${page} of ${totalPages} · ${fmtNum(total)} entries`}
                  </TypographyMuted>
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
                </div>
              )}
            </>
          )}

          <Alert variant="info">
            <AlertTitle>{zh ? '被全局拉黑的访问会怎样' : 'What a global block does'}</AlertTitle>
            <AlertDescription>
              {zh
                ? '所有消息的已读明细都不再返回这些 IP 的记录，界面上只出现「已过滤 N 条」的计数；原始记录仍然保留，解除拉黑后可重新钻取。'
                : 'Matching rows drop out of every message’s details and surface only as a filtered count. The underlying rows stay in the store and reappear once unblocked.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— 移除确认 —————————————————

/* 全局作用域的删除影响所有人的报表，所以单独确认一次；
   消息级/账户级那些"只影响自己"的名单不需要这个仪式。 */
function RemoveConfirm({
  ip,
  lang,
  busy,
  onOpenChange,
  onConfirm,
}: {
  ip: string | null
  lang: Lang
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const zh = lang === 'zh'
  return (
    <AlertDialog open={ip !== null} onOpenChange={(v) => !v && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Ban className="size-4 text-error" />
            {zh ? `把 ${ip} 移出全局黑名单？` : `Unblock ${ip} globally?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {zh
              ? '解除后，这个 IP 之后产生的已读会重新计入所有账号的统计与明细。'
              : 'Reads this IP makes from now on count again for every account.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t(lang, 'cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-error text-white hover:bg-error/90"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {zh ? '移出' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ————————————————— Flow 组合器 —————————————————

export function Flow4_AdminBlocklist({ lang = 'zh' }: { lang?: Lang }) {
  const zh = lang === 'zh'
  const blocks = useResource<IpBlockList>(GLOBAL_BLOCK_URL)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const state: 'loading' | 'ready' | 'error' = blocks.error
    ? 'error'
    : blocks.loading && !blocks.data
      ? 'loading'
      : 'ready'

  const all = blocks.data?.ips ?? []
  const needle = query.trim().toLowerCase()
  // 一千条以内的子串筛选不值得 memo：blocks.data?.ips 每次渲染都是新引用，
  // 挂着 useMemo 只会得到一个"依赖项恒变"的假优化
  const matched = needle ? all.filter((r) => r.ip.toLowerCase().includes(needle)) : all
  // 删掉最后一条 / 筛选到更少的页时当前页会越界，按实际页数收口而不是等用户点错
  const totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const rows = matched.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  /**
   * 添加。成功后重取整份名单而不是本地插一行：服务器按加入时间倒序给回，
   * 本地补丁要么插错位、要么和服务器排序规则对不上。
   */
  const add = async (ip: string): Promise<string | undefined> => {
    try {
      await addGlobalBlock(ip)
    } catch (e) {
      if (e instanceof ApiError && e.code.includes('exists')) {
        return zh ? `${ip} 已经在全局黑名单中` : `${ip} is already globally blocked`
      }
      return zh ? '拉黑失败，请稍后重试' : 'Could not blocklist — try again'
    }
    blocks.reload()
    // 新加的这条多半不在当前筛选词里：不清掉筛选，用户会以为"加了但没生效"
    setQuery('')
    setPage(1)
    toast.success(zh ? `已全局拉黑 ${ip}` : `Globally blocked ${ip}`)
    return undefined
  }

  const confirmRemove = async () => {
    const ip = removeTarget
    if (!ip) return
    setRemoving(true)
    try {
      await removeGlobalBlock(ip)
    } catch (e) {
      setRemoving(false)
      const code = e instanceof ApiError ? e.code : String(e)
      toast.error(`${zh ? '移出失败：' : 'Could not unblock: '}${code}`)
      return
    }
    setRemoving(false)
    setRemoveTarget(null)
    blocks.reload()
    toast.success(
      zh ? '已移出全局黑名单；历史读记录仍在库中，重新钻取即可看到' : 'Unblocked; historic rows stay in the store',
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Screen1_GlobalBlocklist
        blocks={blocks.data}
        lang={lang}
        state={state}
        query={query}
        page={pageSafe}
        rows={rows}
        total={matched.length}
        onQuery={(v) => {
          setQuery(v)
          setPage(1)
        }}
        onPage={setPage}
        onAdd={add}
        onRemove={setRemoveTarget}
        onReload={blocks.reload}
      />

      <RemoveConfirm
        ip={removeTarget}
        lang={lang}
        busy={removing}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />

      {state === 'error' && blocks.error?.forbidden && (
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
