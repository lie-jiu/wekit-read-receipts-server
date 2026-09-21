// ============================================================
// PHASE C · App Shell
// ------------------------------------------------------------
// Scenario ref: SaaS Management 决策① —— 侧边栏 + 三级 IA + 高信息密度
//               SaaS Management 决策④ —— Settings 下沉到头像下拉
//
// 外壳本身不做任何业务，只负责：导航、身份、明暗与语言、⌘K、
// 以及「未登录 → /login」的守卫。
//
// 三条刻意的取舍：
// 1. collapsible="icon"：折叠后只剩 3rem 图标列，配合 tooltip，
//    让明细表格在 1280px 上仍有可用宽度（原产品没有折叠态）。
// 2. 「运营」整组按 isAdmin 摘掉，而不是把里面的按钮置灰 ——
//    普通用户不需要知道有一组他永远点不动的入口存在。
// 3. 导航用 <a href="#/…">：外壳因此不与具体路由器耦合，
//    换成 history API 或 SSR 直链都不用改这一层（见 router.tsx 的说明）。
// ============================================================

import { useEffect, useState } from 'react'
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarNavMenu,
  SidebarNavMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  Tooltip,
  TypographyMuted,
} from 'sparkdesign'
import { CircleUser, Languages, LogOut, Moon, Search, Settings, Sun } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp, useSession } from './app-context'
import { GROUP_LABEL, NAV, OVERVIEW_PATH, pageTitleOf, ROUTE_ACCOUNT, ROUTE_LOGIN } from './nav'
import type { NavEntry, NavGroup } from './nav'
import { CommandMenu } from './command-menu'
import { BrandMark } from '../flows/shared/brand-mark'
import { useDocTitle } from './use-doc-title'

const initialsOf = (wxId: string) => {
  const letters = wxId.replace(/[^A-Za-z]/g, '')
  return (letters.slice(0, 2) || wxId.slice(0, 2)).toUpperCase()
}

function Brand() {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <a href={`#${OVERVIEW_PATH}`} className="flex items-center gap-2 px-2 py-1 outline-none">
          <BrandMark className="size-8 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">WeKit Read Insights</span>
            <span className="truncate text-xs text-text-tertiary">已读轨迹 · 自建服务端</span>
          </span>
        </a>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function NavItem({ entry, active }: { entry: NavEntry; active: boolean }) {
  const label = entry.label
  if (entry.planned)
    return (
      <SidebarNavMenuItem>
        {/* 本轮没为这两页设计专属 flow：画成禁用 + 说明，而不是假装已经做好 */}
        <Tooltip content={entry.planned}>
          <span className="block w-full">
            <SidebarMenuButton disabled aria-label={`${label}（待设计）`}>
              {entry.icon}
              <span>{label}</span>
            </SidebarMenuButton>
          </span>
        </Tooltip>
      </SidebarNavMenuItem>
    )

  return (
    <SidebarNavMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <a href={`#${entry.path}`}>
          {entry.icon}
          <span>{label}</span>
        </a>
      </SidebarMenuButton>
    </SidebarNavMenuItem>
  )
}

function NavGroups({ isAdmin, pathname }: { isAdmin: boolean; pathname: string }) {
  const groups: NavGroup[] = ['main', 'ops']
  return (
    <>
      {groups.map((g) => {
        const entries = NAV.filter((n) => n.group === g && (!n.adminOnly || isAdmin))
        if (entries.length === 0) return null
        return (
          <SidebarGroup key={g}>
            <SidebarGroupLabel>{GROUP_LABEL[g].zh}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarNavMenu>
                {entries.map((e) => (
                  <NavItem key={e.path} entry={e} active={pathname === e.path || pathname.startsWith(`${e.path}/`)} />
                ))}
              </SidebarNavMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}

/** 身份卡 + 次级菜单：等级与管理员来自会话，不是硬编码 */
function UserChip() {
  return (
    <SidebarNavMenu>
      <SidebarNavMenuItem>
        <UserChipMenu />
      </SidebarNavMenuItem>
    </SidebarNavMenu>
  )
}

function UserChipMenu() {
  const session = useSession()
  const { lang, setLang, appearance, setAppearance, signOut, viewAs, setViewAs } = useApp()
  const navigate = useNavigate()
  const zh = lang === 'zh'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="w-full" aria-label={zh ? '账户菜单' : 'Account menu'}>
          <Avatar className="size-7">
            <AvatarFallback className="bg-fill-secondary text-xs text-text-secondary">
              {initialsOf(session.wxId)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col text-left">
            <span className="truncate font-mono text-xs">{session.wxId}</span>
            <span className="truncate text-xs text-text-tertiary">
              Lv {session.level}
              {session.isAdmin ? ' · 管理员' : ''}
            </span>
          </span>
          <CircleUser className="ml-auto size-4 shrink-0 text-text-tertiary" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="flex items-center gap-2">
            <Languages className="size-3.5 text-text-tertiary" />
            {zh ? '语言' : 'Language'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as 'zh' | 'en')}>
          <DropdownMenuRadioItem value="zh">简体中文</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}>
          {appearance === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {zh ? '切换明暗' : 'Toggle theme'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        {/* → FLOW 6 账户与隐私（Settings 不占主导航一级） */}
        <DropdownMenuItem onSelect={() => navigate(ROUTE_ACCOUNT)}>
          <Settings className="size-4" />
          {zh ? '账户设置' : 'Account settings'}
        </DropdownMenuItem>

        {/* 评审开关：真实工程里不存在，这里用来验证「运营」整组随 isAdmin 消失。
            与 DevDock 同一套门禁——生产构建里整块摇掉，否则非管理员会看到一个勾着
            「管理员」的惰性控件（它只能降级 session.isAdmin，不能提权）。 */}
        {import.meta.env.DEV && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">
              <TypographyMuted className="text-xs">
                {zh ? '评审：以…身份查看' : 'Review: view as'}
              </TypographyMuted>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={viewAs} onValueChange={(v) => setViewAs(v as 'admin' | 'member')}>
              <DropdownMenuRadioItem value="admin">{zh ? '管理员' : 'Admin'}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="member">{zh ? '普通用户' : 'Member'}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut()
            /* → FLOW 1 屏 1 */
            navigate(ROUTE_LOGIN)
          }}
        >
          <LogOut className="size-4" />
          {zh ? '退出登录' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PageHeader({ onOpenCommand }: { onOpenCommand: () => void }) {
  const { pathname } = useLocation()
  const { lang } = useApp()
  const label = pageTitleOf(pathname, lang) ?? ''
  const zh = lang === 'zh'

  useDocTitle(label)

  return (
    <header className="pt-safe sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border-tertiary bg-bg-base/85 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <span className="text-sm font-medium">{label || (zh ? '详情' : 'Detail')}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onOpenCommand} className="gap-2">
          <Search className="size-4" />
          {zh ? '搜索' : 'Search'}
          <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
        </Button>
      </div>
    </header>
  )
}

/** 布局路由：子路由通过 Outlet 渲染进 SidebarInset 的内容区 */
export function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false)
  const session = useSession()
  const { pathname } = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <SidebarProvider className="min-h-screen bg-bg-layout">
      <Sidebar collapsible="icon" className="border-r border-border-tertiary">
        <SidebarHeader className="border-b border-border-tertiary py-3">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="gap-0">
          <NavGroups isAdmin={session.isAdmin} pathname={pathname} />
        </SidebarContent>
        <SidebarFooter className="border-t border-border-tertiary p-2">
          <UserChip />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="flex min-w-0 flex-1 flex-col">
        <PageHeader onOpenCommand={() => setCommandOpen(true)} />
        <div className="min-w-0 flex-1">
          {/*
           * 内容宽度上限放在外壳而不是各 flow：
           * 21:9 超宽屏上用户表格会被拉到 3000px，一行要横扫半米。
           * SaaS Management 要「高密度」，所以取 max-w-7xl（1280px）而不是
           * 阅读型的 max-w-3xl —— 既止住超宽形变，又不牺牲可放的列数。
           * 侧栏折叠时表格可用宽度增加，上限让内容始终居中而不是贴着左边缘。
           */}
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </div>
      </SidebarInset>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </SidebarProvider>
  )
}
