// ============================================================
// PHASE C · 路由表
// ------------------------------------------------------------
// 为什么用 HashRouter 而不是 BrowserRouter：
// Worker 上现在跑的是服务端拼 HTML 的六个页面，它们已经占掉了
//   /  /login  /messages  /reads/:id  /rank  /admin/*
// 这套 SPA 要在**同一批接口**上并行评审，就不能再去抢这些 path。
// hash 段服务端永远看不到，所以 #/overview 与 /overview（SSR）互不干扰，
// 也不需要给 Worker 配 SPA fallback 重写。
// SSR 页面退役后再切 BrowserRouter + 静态资源兜底，只改这一行。
//
// 权限分三层，逐层收紧：
//   1. RequireSignedIn —— 没有会话就回 /login（对应 401 → 跳登录）
//   2. RequireAdmin    —— 有会话但不是管理员：路由级直接挡掉，
//      而不是渲染出一个满屏 403 的页面（对应 FLOW 4 屏 4）
//   3. canManage       —— 看得到但不能改（他人公开消息），传给 FLOW 3
// ============================================================

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  TypographyMuted,
} from 'sparkdesign'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { blockListUrl, headerOf, readsDataUrl, type ReadsPayloadDto } from '../data/reads'
import { tzOfLang } from '../data/overview'
import { useResource } from '../data/hooks'
import { Flow1_Auth } from '../flows/flow-1/flow1-auth'
import { Flow2_Overview } from '../flows/flow-2/flow2-overview'
import type { OverviewPhase } from '../flows/flow-2/flow2-overview'
import { Flow3_ReadDetails } from '../flows/flow-3/flow3-read-details'
import { Flow4_AdminUsers } from '../flows/flow-4/flow4-admin-users'
import { Flow4_AdminMessages } from '../flows/flow-4/flow4-admin-messages'
import { Flow4_AdminBlocklist } from '../flows/flow-4/flow4-admin-blocklist'
import { Flow4_AdminAudit } from '../flows/flow-4/flow4-admin-audit'
import { Flow5_AdminConfig } from '../flows/flow-5/flow5-admin-config'
import { Flow6_Account } from '../flows/flow-6/flow6-account'
import { Flow7_Leaderboard } from '../flows/flow-7/flow7-leaderboard'
import type { BoardPhase, Flow7Stage } from '../flows/flow-7/flow7-leaderboard'
import { Screen3_PublicReadonly } from '../flows/flow-7/flow7-leaderboard'
import type { IpBlockList, Message } from '../flows/shared/types'
import { useApp, useSession } from './app-context'
import type { ApiError } from '../data/api'
import { AppShell } from './app-shell'
import {
  ADMIN_MESSAGES_PATH,
  ADMIN_USERS_PATH,
  OVERVIEW_PATH,
  ROUTE_ACCOUNT,
  ROUTE_LOGIN,
  ROUTE_ONBOARDING,
  pageTitleOf,
} from './nav'
import { useReviewParam } from './dev-dock'
import { useDocTitle } from './use-doc-title'

/** 明细表的服务端分页大小（与服务器 /reads/:id/data 的默认值一致） */
const PAGE_SIZE = 50

/**
 * 取数中 / 取不到时的页头占位。
 * 只有 id 是真的，其余一律空值：页头在 payload 到位前不渲染这些字段（走骨架屏分支），
 * 但 Flow3 的 message 是必填 prop，所以这里给的是一个"结构占位"，不是"数据"。
 */
function placeholderMessage(id: string): Message {
  return {
    id,
    content: '',
    reads: 0,
    timestamp: '',
    wxId: '',
    isPublic: false,
    distinctIps: 0,
    firstReadSeconds: null,
    dailyReads: [],
    blockedCount: 0,
  }
}

/** 引导中：/me 还没回来。这一步不能显示成"未登录"，也不能显示成"出错" */
function BootScreen() {
  const { lang } = useApp()
  return (
    <div className="flex min-h-screen items-center justify-center p-10" role="status" aria-live="polite">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <TypographyMuted className="text-sm">
          {lang === 'zh' ? '正在确认登录状态…' : 'Checking your session…'}
        </TypographyMuted>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    </div>
  )
}

/** 问不出身份 ≠ 没登录：这里给的是重试，不是登录页（服务在恢复时跳登录只会误导） */
function BootFailed({ error }: { error: ApiError | null }) {
  const { lang, refresh } = useApp()
  const zh = lang === 'zh'
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{zh ? '连不上服务器' : 'Cannot reach the server'}</CardTitle>
          <TypographyMuted className="text-sm">
            {zh
              ? '登录状态没能确认。这通常是服务未启动或网络中断，不是你的账号问题。'
              : 'The session could not be verified. This is usually the server or the network, not your account.'}
          </TypographyMuted>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <TypographyMuted className="text-xs break-all">
              {error.status ? `HTTP ${error.status} · ` : ''}
              {error.code}
            </TypographyMuted>
          )}
          <div>
            <Button variant="secondary" size="sm" onClick={refresh}>
              {zh ? '重试' : 'Retry'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RequireSignedIn({ children }: { children: ReactNode }) {
  const { phase, signedIn, error } = useApp()
  const { pathname } = useLocation()
  if (phase === 'booting') return <BootScreen />
  if (phase === 'error') return <BootFailed error={error} />
  if (!signedIn) return <Navigate to={ROUTE_LOGIN} replace state={{ from: pathname }} />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const session = useSession()
  // 非管理员根本没有这个 URL 的入口；手敲进来也不该看到运营数据
  if (!session.isAdmin) return <Navigate to={OVERVIEW_PATH} replace />
  return <>{children}</>
}

function LoginPage() {
  const { phase, signedIn, lang, appearance, setLang, setAppearance, signIn, refresh } = useApp()
  const { state } = useLocation()
  const navigate = useNavigate()
  useDocTitle(lang === 'zh' ? '登录' : 'Sign in')
  if (phase === 'booting') return <BootScreen />
  if (signedIn) return <Navigate to={(state as { from?: string } | null)?.from ?? OVERVIEW_PATH} replace />
  return (
    <Flow1_Auth
      lang={lang}
      appearance={appearance}
      onLangChange={setLang}
      onAppearanceChange={setAppearance}
      onAuthenticated={(session) => {
        // /auth/verify 只回 {ok:true}，身份要再问一次 /me —— Flow1 已经问好了，
        // 这里只做"写进会话 + 跳转"，避免刷新一次 /me 造成的空档
        if (session) signIn(session)
        else refresh()
        navigate(OVERVIEW_PATH, { replace: true })
      }}
    />
  )
}

function OnboardingPage() {
  const { lang, appearance, setLang, setAppearance, signIn, refresh } = useApp()
  const navigate = useNavigate()
  useDocTitle(lang === 'zh' ? '开始使用' : 'Get started')
  return (
    <Flow1_Auth
      key="firstrun"
      initialScreen="firstrun"
      lang={lang}
      appearance={appearance}
      onLangChange={setLang}
      onAppearanceChange={setAppearance}
      onAuthenticated={(session) => {
        if (session) signIn(session)
        else refresh()
        navigate(OVERVIEW_PATH, { replace: true })
      }}
    />
  )
}

function OverviewPage() {
  const session = useSession()
  const { lang } = useApp()
  const navigate = useNavigate()
  const simulate = useReviewParam('simulate', 'ready') as OverviewPhase
  return (
    <Flow2_Overview
      // simulate 会被 flow 内部复制进 state，改 URL 必须重挂载才生效
      key={simulate}
      session={session}
      lang={lang}
      simulate={simulate}
      onOpenMessage={(m) => navigate(`/messages/${m.id}`)}
      onFirstRun={() => navigate(ROUTE_ONBOARDING)}
    />
  )
}

function MessageDetailPage() {
  const session = useSession()
  const { lang } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  /** 钻取页有两个入口：总览（owner 看自己的）与运营页（管理员看别人的）。
   *  后者把来源路径放进 history state，回程面包屑才回得去那一页 —— 写死总览
   *  等于把管理员的搜索和翻页作废掉。直接 URL 打开时没有 state，回总览。
   *  来源必须查得到页面标题才认，免得把任意字符串当跳转目标。 */
  const { state } = useLocation()
  const from = (state as { from?: string } | null)?.from
  const backLabel = from ? pageTitleOf(from, lang) : undefined
  const backPath = from && backLabel ? from : OVERVIEW_PATH
  const [page, setPage] = useState(1)
  const msgId = id ?? ''
  const data = useResource<ReadsPayloadDto>(msgId ? readsDataUrl(msgId, page, PAGE_SIZE) : null)
  // 黑名单列表只有 owner / admin 读得到（readsMessageOr 卡得很死）：
  // 没权限时连请求都不发，免得给控制台留一条假的 403
  const canManage = data.data?.canManage ?? false
  const blocks = useResource<IpBlockList>(canManage && msgId ? blockListUrl(msgId) : null)
  const payload = data.data

  useEffect(() => setPage(1), [msgId])

  const refresh = () => {
    data.reload()
    blocks.reload()
  }

  if (!payload) {
    return (
      <Flow3_ReadDetails
        message={placeholderMessage(msgId)}
        payload={null}
        blocks={null}
        session={session}
        lang={lang}
        tz={tzOfLang(lang)}
        loading={data.loading}
        backLabel={backLabel}
        onBack={() => navigate(backPath)}
      />
    )
  }
  return (
    <Flow3_ReadDetails
      message={headerOf(payload, session.wxId)}
      payload={payload}
      blocks={blocks.data ?? null}
      session={session}
      lang={lang}
      tz={tzOfLang(lang)}
      canManage={payload.canManage}
      page={page}
      backLabel={backLabel}
      onBack={() => navigate(backPath)}
      onPageChange={setPage}
      onLocated={refresh}
      onChanged={refresh}
    />
  )
}

function LeaderboardPage() {
  const session = useSession()
  const { lang, appearance, setAppearance } = useApp()
  const navigate = useNavigate()
  const stage = useReviewParam('stage', 'board') as Flow7Stage
  const phase = useReviewParam('phase', 'ready') as BoardPhase

  return (
    <Flow7_Leaderboard
      lang={lang}
      appearance={appearance}
      session={session}
      stage={stage}
      phase={phase}
      onAppearanceChange={setAppearance}
      onOpenMessage={(id) => navigate(`/messages/${id}`)}
      onOpenPublicLink={(id) => navigate(`/reads/${id}`)}
      onSignIn={() => navigate(ROUTE_LOGIN)}
    />
  )
}

/** 匿名公开链接：不套 AppShell，也不要求会话 */
function PublicReadPage() {
  const { lang, appearance, setAppearance } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const msgId = id ?? ''
  // 与 F3 同一个端点：publicReadOr() 对 is_public=1 的消息放行匿名只读访问，
  // 所以这里不需要"公开版接口"，只要不带会话地请求同一个 URL
  const data = useResource<ReadsPayloadDto>(msgId ? readsDataUrl(msgId, 1, PAGE_SIZE) : null)
  const payload = data.data
  const state = payload
    ? 'ready'
    : data.error
      ? data.error.forbidden || data.error.unauthorized
        ? 'forbidden'
        : 'error'
      : 'loading'

  // [NEW] 原服务端把这页的 <title> 写死成 "Read Details"，同时开好几条公开链接时
  // 标签页完全分不开。改成取消息前 18 字：内容本来就整页可见，所以标题不额外泄露什么，
  // 但浏览器历史里会留下片段 —— 若在意可退回固定标题。
  useDocTitle(
    payload
      ? `${payload.content.slice(0, 18)}${payload.content.length > 18 ? '…' : ''}`
      : lang === 'zh'
        ? '已读明细'
        : 'Read details',
  )

  return (
    <Screen3_PublicReadonly
      lang={lang}
      appearance={appearance}
      payload={payload}
      state={state}
      onAppearanceChange={setAppearance}
      onSignIn={() => navigate(ROUTE_LOGIN)}
    />
  )
}

function AdminUsersPage() {
  const session = useSession()
  const { lang } = useApp()
  const navigate = useNavigate()
  /** 从「全站消息」点账号列进来时带来过滤词：列表直接落在那一个账号上 */
  const { state } = useLocation()
  const initialQuery = typeof (state as { q?: unknown } | null)?.q === 'string' ? (state as { q: string }).q : ''
  return (
    <Flow4_AdminUsers
      lang={lang}
      currentWxId={session.wxId}
      initialQuery={initialQuery}
      // state.from：钻取页据此把回程面包屑指回来源页，而不是写死总览
      onOpenMessage={(m) => navigate(`/messages/${m.id}`, { state: { from: ADMIN_USERS_PATH } })}
    />
  )
}

function AdminMessagesPage() {
  const { lang } = useApp()
  const navigate = useNavigate()
  return (
    <Flow4_AdminMessages
      lang={lang}
      onOpenMessage={(m) => navigate(`/messages/${m.id}`, { state: { from: ADMIN_MESSAGES_PATH } })}
      onOpenUser={(wxId) => navigate(ADMIN_USERS_PATH, { state: { q: wxId } })}
    />
  )
}

function AdminConfigPage() {
  const { lang } = useApp()
  return <Flow5_AdminConfig lang={lang} />
}

function AdminBlocklistPage() {
  const { lang } = useApp()
  return <Flow4_AdminBlocklist lang={lang} />
}

function AdminAuditPage() {
  const { lang } = useApp()
  return <Flow4_AdminAudit lang={lang} />
}

function AccountPage() {
  const { lang, signOut, refresh } = useApp()
  const session = useSession()
  const navigate = useNavigate()
  return (
    <Flow6_Account
      lang={lang}
      session={session}
      onLogout={() => {
        signOut()
        navigate(ROUTE_LOGIN, { replace: true })
      }}
      onPasswordChanged={() => {
        // 服务器改密时已经删掉该账号全部会话，这里要做的只是让本地立刻承认"没登录"。
        // 用 refresh() 不行：它是异步的，在这一次往返之间 signedIn 仍为 true，
        // 登录页会据此把人弹回 /overview，再被 401 弹回登录页 —— 实测到的一次闪屏。
        // signOut() 多发的 /auth/logout 打向一条已不存在的会话，服务器回 ok，顺带清掉浏览器里那条旧 cookie。
        signOut()
        navigate(ROUTE_LOGIN, { replace: true })
      }}
      onCleared={() => {
        refresh() // messageCount 变了：不重问 /me，配额卡会一直停在清除前的数字
        navigate(OVERVIEW_PATH)
      }}
    />
  )
}

function NotFoundPage() {
  const navigate = useNavigate()
  const { lang } = useApp()
  useDocTitle(lang === 'zh' ? '页面不存在' : 'Not found')
  return (
    <div className="p-6">
      <Card className="max-w-md">
        <CardContent className="flex flex-col gap-2 p-6">
          <span className="text-lg font-semibold">这个地址下没有页面</span>
          <TypographyMuted className="text-sm">
            地址可能是从旧版服务端页面复制过来的 —— 那批页面仍然挂在服务端路径下，不在 SPA 的 hash 路由里。
          </TypographyMuted>
          <div>
            <Button variant="secondary" size="sm" onClick={() => navigate(OVERVIEW_PATH)}>
              回到总览
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      {/* —— 外壳之外的三类画面：认证、引导、匿名公开链接 —— */}
      <Route path={ROUTE_LOGIN} element={<LoginPage />} />
      <Route path={ROUTE_ONBOARDING} element={<OnboardingPage />} />
      <Route path="/reads/:id" element={<PublicReadPage />} />

      {/* —— 受保护的工作区 —— */}
      <Route
        element={
          <RequireSignedIn>
            <AppShell />
          </RequireSignedIn>
        }
      >
        <Route index element={<Navigate to={OVERVIEW_PATH} replace />} />
        <Route path={OVERVIEW_PATH} element={<OverviewPage />} />
        <Route path="/messages/:id" element={<MessageDetailPage />} />
        <Route path="/messages" element={<MessageDetailPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route
          path={ADMIN_USERS_PATH}
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path={ADMIN_MESSAGES_PATH}
          element={
            <RequireAdmin>
              <AdminMessagesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/config"
          element={
            <RequireAdmin>
              <AdminConfigPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/blocklist"
          element={
            <RequireAdmin>
              <AdminBlocklistPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireAdmin>
              <AdminAuditPage />
            </RequireAdmin>
          }
        />
        <Route path={ROUTE_ACCOUNT} element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
