// ============================================================
// PHASE C · App Shell —— 信息架构单一事实源
// ------------------------------------------------------------
// 侧边栏、⌘K 命令面板、文档标题、评审 dock 全部从这里读，
// 避免三处各写一份导航而对不上。
//
// IA 三级（Phase A 已确认的骨架）：
//   一级 = 分组（主功能区 / 运营）
//   二级 = 侧边栏条目（一个条目 = 一个 FLOW 的主屏）
//   三级 = 屏内切换（Tabs / Drawer / 钻取），不进侧边栏
//
// 两条刻意的设计决策：
// 1. 「账户设置」不占主导航一级 —— 日常用不到、改起来影响面大，
//    放在头像下拉里（SaaS Management 决策④）。
// 2. 消息明细不是导航条目，而是总览的钻取目标（Data Analytics/BI：
//    aggregate → dimension 的下钻是页内行为，不该占一级入口）。
// ============================================================

import type { ReactNode } from 'react'
import {
  Ban,
  LayoutDashboard,
  ScrollText,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react'

export type NavGroup = 'main' | 'ops'

export type NavEntry = {
  /** HashRouter 内的路径；与 Worker 上的 SSR 路径不冲突 */
  path: string
  label: string
  labelEn: string
  icon: ReactNode
  group: NavGroup
  /** 运营组整组按 isAdmin 门控，普通用户连入口都看不到 */
  adminOnly?: boolean
  /** 评审 dock 可选的状态模拟项 */
  review?: ReviewSpec[]
}

export type ReviewOption = { value: string; label: string }
/** key 会写进 hash query（如 #/overview?simulate=loading），所以 URL 可寻址 */
export type ReviewSpec = { key: string; label: string; options: ReviewOption[] }

export const NAV: NavEntry[] = [
  {
    path: '/overview',
    label: '总览',
    labelEn: 'Overview',
    icon: <LayoutDashboard />,
    group: 'main',
    review: [
      {
        key: 'simulate',
        label: '数据状态',
        options: [
          { value: 'ready', label: '正常' },
          { value: 'loading', label: '加载' },
          { value: 'error', label: '失败' },
          { value: 'empty-filter', label: '空·筛选' },
          { value: 'empty-never', label: '空·无消息' },
        ],
      },
    ],
  },
  {
    path: '/leaderboard',
    label: '排行榜',
    labelEn: 'Leaderboard',
    icon: <Trophy />,
    group: 'main',
    review: [
      {
        key: 'stage',
        label: '屏',
        options: [
          { value: 'board', label: '1 排行榜' },
          { value: 'states', label: '2 状态屏' },
          { value: 'public', label: '3 公开链接' },
        ],
      },
      {
        key: 'phase',
        label: '榜单状态',
        options: [
          { value: 'ready', label: '正常' },
          { value: 'loading', label: '加载' },
          { value: 'empty', label: '空榜' },
          { value: 'error', label: '失败' },
        ],
      },
    ],
  },
  {
    path: '/admin/users',
    label: '用户管理',
    labelEn: 'Users',
    icon: <Users />,
    group: 'ops',
    adminOnly: true,
  },
  {
    path: '/admin/config',
    label: '权益与清理',
    labelEn: 'Entitlements & Retention',
    icon: <SlidersHorizontal />,
    group: 'ops',
    adminOnly: true,
  },
  {
    path: '/admin/blocklist',
    label: '全局黑名单',
    labelEn: 'Global IP Blocklist',
    icon: <Ban />,
    group: 'ops',
    adminOnly: true,
  },
  {
    path: '/admin/audit',
    label: '操作留痕',
    labelEn: 'Audit Log',
    icon: <ScrollText />,
    group: 'ops',
    adminOnly: true,
  },
]

/** 头像下拉里的次级入口：不进主导航 */
export const ROUTE_ACCOUNT = '/account'
export const ROUTE_LOGIN = '/login'
export const ROUTE_ONBOARDING = '/onboarding'
/** 公开链接（匿名只读）；路径与原服务端 /reads/:id 对齐 */
export const routeReads = (id: string) => `/reads/${id}`

export const GROUP_LABEL: Record<NavGroup, { zh: string; en: string }> = {
  main: { zh: '工作区', en: 'Workspace' },
  ops: { zh: '运营', en: 'Operations' },
}

/**
 * 不占侧边栏一级、但仍然是一个正经页面的标题。
 * /messages 是从总览下钻进来的（Data Analytics/BI：钻取是页内行为，
 * 不该占一级导航），/account 在头像下拉里 —— 两者都不该顶着上一页的 title。
 */
export const PAGE_TITLE: Record<string, { zh: string; en: string }> = {
  [ROUTE_ACCOUNT]: { zh: '账户设置', en: 'Account settings' },
  '/messages': { zh: '已读明细', en: 'Read details' },
}

/** 路由 → 页头标题；先查导航表，再查非导航页 */
export function navOf(path: string): NavEntry | undefined {
  return NAV.find((n) => path === n.path || path.startsWith(`${n.path}/`))
}

export function pageTitleOf(path: string, lang: 'zh' | 'en'): string | undefined {
  const entry = navOf(path)
  if (entry) return lang === 'zh' ? entry.label : entry.labelEn
  const prefix = Object.keys(PAGE_TITLE).find((p) => path === p || path.startsWith(`${p}/`))
  if (!prefix) return undefined
  return lang === 'zh' ? PAGE_TITLE[prefix].zh : PAGE_TITLE[prefix].en
}

export function docTitleOf(label: string): string {
  return `${label} · WeKit Read Insights`
}

export const OVERVIEW_PATH = '/overview'
