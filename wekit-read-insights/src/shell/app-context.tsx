// ============================================================
// PHASE C+ · 全局外壳状态
// ------------------------------------------------------------
// 三件事放在一起，因为它们互相咬着：
//   · 会话：GET /me 是唯一真相。以前用 sessionStorage 里的标记冒充登录态，
//     接了真接口之后必须去掉 —— cookie 会过期、会在别的标签页被登出、
//     改密时服务器会把它整条删掉（见 changePassword 的副作用），
//     任何本地镜像都会和服务器不一致，而且是"看不出来"的那种不一致。
//   · 语言：与原产品一致存 localStorage('lang')，值域 'zh-CN' | 'en'
//   · 明暗：与原产品一致存 localStorage('theme')
//
// viewAs 是评审开关：只在前端把 isAdmin 关掉，用来验证「运营」整组
// 从侧边栏消失，而不是仅仅把按钮置灰。它不改服务器返回的数据，
// 真实工程里这个开关不存在。
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Appearance } from 'sparkdesign'
import { ApiError, onUnauthorized } from '../data/api'
import { fetchMe, signOutRequest } from '../data/session'
import type { Session } from '../flows/shared/types'
import type { Lang } from '../flows/shared/i18n'

export type ViewAs = 'admin' | 'member'

/**
 * booting：还没问过服务器。这个阶段绝不能被当成"未登录"，
 * 否则每次刷新都会闪一下登录页、把用户从深链接上踢下来。
 * error：问了但没问出来（断网 / 5xx）。它和 signed-out 是两件事，
 * 混为一谈就是把服务故障说成"你还没登录"。
 */
export type SessionPhase = 'booting' | 'signed-out' | 'ready' | 'error'

type AppValue = {
  phase: SessionPhase
  /** 按 viewAs 覆盖后的会话；非 ready 阶段为 null */
  session: Session | null
  /** 未登录时发起登录用；ready 后取数据请走 useSession() */
  me: Session | null
  error: ApiError | null
  signedIn: boolean
  signIn: (session: Session) => void
  signOut: () => void
  /** 登录成功 / 需要重新对齐服务器状态时：再问一次 /me */
  refresh: () => void
  viewAs: ViewAs
  setViewAs: (next: ViewAs) => void
  lang: Lang
  setLang: (next: Lang) => void
  appearance: Appearance
  setAppearance: (next: Appearance) => void
}

const AppContext = createContext<AppValue | null>(null)

/** 与原产品 shared.ts 一致的两个存储键与取值，迁移时不必再改一遍 */
const LANG_KEY = 'lang'
const THEME_KEY = 'theme'

function readLang(): Lang {
  const v = typeof window === 'undefined' ? null : window.localStorage.getItem(LANG_KEY)
  if (v === 'en') return 'en'
  if (v === 'zh-CN' || v === 'zh') return 'zh'
  return 'zh'
}

function readAppearance(): Appearance {
  const v = typeof window === 'undefined' ? null : window.localStorage.getItem(THEME_KEY)
  return v === 'light' || v === 'dark' ? v : 'light'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<SessionPhase>('booting')
  const [me, setMe] = useState<Session | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [nonce, setNonce] = useState(0)
  const [viewAs, setViewAs] = useState<ViewAs>('admin')
  const [lang, setLang] = useState<Lang>(readLang)
  const [appearance, setAppearance] = useState<Appearance>(readAppearance)

  useEffect(() => {
    window.localStorage.setItem(LANG_KEY, lang === 'zh' ? 'zh-CN' : 'en')
  }, [lang])

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, appearance)
  }, [appearance])

  // 引导：问服务器"我是谁"。/auth/verify 成功后由登录页调用 refresh() 再走一遍
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    fetchMe(controller.signal).then(
      (session) => {
        if (!active) return
        setMe(session)
        setError(null)
        setPhase('ready')
      },
      (e: unknown) => {
        if (!active || (e as Error)?.name === 'AbortError') return
        const err = e instanceof ApiError ? e : new ApiError(0, 'unknown', String((e as Error)?.message ?? e))
        setMe(null)
        setError(err)
        // 401 是"没登录"，其它都按"问不出来"处理
        setPhase(err.status === 401 ? 'signed-out' : 'error')
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [nonce])

  // 任何资源请求撞上 401（会话过期 / 改密后被服务器清掉）都会收敛到这里
  useEffect(
    () =>
      onUnauthorized(() => {
        setMe(null)
        setError(null)
        setPhase('signed-out')
      }),
    [],
  )

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const signIn = useCallback((session: Session) => {
    setMe(session)
    setError(null)
    setPhase('ready')
  }, [])

  const signOut = useCallback(() => {
    // 先清本地再通知服务器：登出请求失败也不该把用户留在"看起来还登录着"的状态
    void signOutRequest().catch(() => undefined)
    setMe(null)
    setError(null)
    setPhase('signed-out')
  }, [])

  const session = useMemo<Session | null>(() => {
    if (!me) return null
    // 评审开关只动 isAdmin：level 一并降下来会让配额卡跟着变，看起来像数据错了
    return viewAs === 'admin' ? me : { ...me, isAdmin: false }
  }, [me, viewAs])

  const value = useMemo<AppValue>(
    () => ({
      phase,
      session,
      me,
      error,
      signedIn: phase === 'ready' && session !== null,
      signIn,
      signOut,
      refresh,
      viewAs,
      setViewAs,
      lang,
      setLang,
      appearance,
      setAppearance,
    }),
    [phase, session, me, error, signIn, signOut, refresh, viewAs, lang, appearance],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

/**
 * 受保护页面用它取会话：这些组件只会在 RequireSignedIn 之下渲染，
 * 所以 null 在这里是编程错误而不是运行分支 —— 用抛错暴露它，
 * 比在每个页面里写 session?.wxId ?? '' 然后显示半个空壳更好。
 */
export function useSession(): Session {
  const { session } = useApp()
  if (!session) throw new Error('useSession 只能在已登录的子树里使用')
  return session
}
