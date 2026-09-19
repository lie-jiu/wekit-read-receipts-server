// ============================================================
// PHASE C · ⌘K 命令面板
// ------------------------------------------------------------
// 高信息密度的后台里，键盘直达是减少来回点击的主要手段：
// 原产品六个页面全靠侧栏/顶部链接逐跳，没有任何搜索式入口。
//
// 面板里的条目 = 导航目的地 + 少量全局动作。
// 「运营」组按 isAdmin 过滤，和侧边栏用同一份 NAV，所以两边永远不会对不上。
// ============================================================

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'sparkdesign'
import { LogOut, Moon, Settings, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp, useSession } from './app-context'
import { GROUP_LABEL, NAV, ROUTE_ACCOUNT, ROUTE_LOGIN } from './nav'

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const session = useSession()
  const { lang, appearance, setAppearance, signOut } = useApp()
  const navigate = useNavigate()
  const zh = lang === 'zh'

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  const groups: ('main' | 'ops')[] = ['main', 'ops']

  return (
    /**
     * 没有用 Spark 的 CommandDialog：它把 <DialogHeader className="sr-only"> 放在
     * <Dialog> 直下而不是 <DialogContent> 里，Radix 只按 open 卸载 Portal 部分，
     * 于是那个「命令面板」h2 会常驻无障碍树 —— 实测每页都会多出一个看不见的标题。
     * 这里自己组 Dialog + Command，标题跟着内容一起挂载 / 卸载。
     */
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>{zh ? '命令面板' : 'Command palette'}</DialogTitle>
          <DialogDescription>{zh ? '跳转到任意页面或执行全局动作' : 'Jump to a page or run a global action'}</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder={zh ? '搜索页面或动作…' : 'Search pages and actions…'} />
          <CommandList>
            {groups.map((g) => {
              const entries = NAV.filter((n) => n.group === g && (!n.adminOnly || session.isAdmin) && !n.planned)
              if (entries.length === 0) return null
              return (
                <CommandGroup key={g} heading={GROUP_LABEL[g].zh}>
                  {entries.map((e) => (
                    <CommandItem key={e.path} value={`${e.label} ${e.path}`} onSelect={() => go(e.path)}>
                      {/* CommandItem 自带图标位：直接把导航图标塞进来，保持与侧栏一致 */}
                      <span className="[&>svg]:size-4">{e.icon}</span>
                      <span>{zh ? e.label : e.labelEn}</span>
                      <CommandShortcut>{e.path}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
    
            <CommandSeparator />
            <CommandGroup heading={zh ? '动作' : 'Actions'}>
              <CommandItem
                value={zh ? '账户设置' : 'account settings'}
                onSelect={() => {
                  onOpenChange(false)
                  navigate(ROUTE_ACCOUNT)
                }}
              >
                <Settings />
                <span>{zh ? '账户设置' : 'Account settings'}</span>
                <CommandShortcut>{ROUTE_ACCOUNT}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value={zh ? '切换明暗' : 'toggle theme'}
                onSelect={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}
              >
                {appearance === 'dark' ? <Sun /> : <Moon />}
                <span>{zh ? '切换明暗' : 'Toggle light / dark'}</span>
                <CommandShortcut>{appearance === 'dark' ? 'light' : 'dark'}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value={zh ? '退出登录' : 'sign out'}
                onSelect={() => {
                  onOpenChange(false)
                  signOut()
                  navigate(ROUTE_LOGIN)
                }}
              >
                <LogOut />
                <span>{zh ? '退出登录' : 'Sign out'}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
