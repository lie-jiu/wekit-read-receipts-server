// ============================================================
// PHASE C · 评审 dock（仅 DEV）
// ------------------------------------------------------------
// 把逐屏生成期的「状态选择器」保留下来，但改成正经的 hash query：
//   #/overview?simulate=loading      #/leaderboard?stage=public
// 于是任何一个状态都是可以直接贴给同事的 URL，而不是要点三下按钮。
//
// 生产构建里 import.meta.env.DEV 为 false，整块被摇掉，不会进包。
// ============================================================

import { ToggleGroup, ToggleGroupItem } from 'sparkdesign'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useApp } from './app-context'
import { NAV } from './nav'

export function DevDock() {
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const { lang } = useApp()

  if (!import.meta.env.DEV) return null

  const entry = NAV.find((n) => pathname === n.path || pathname.startsWith(`${n.path}/`))
  const specs = entry?.review
  if (!specs?.length) return null

  const zh = lang === 'zh'
  const first = (v: string) => params.get(v) ?? specs.find((s) => s.key === v)?.options[0].value ?? ''

  const write = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        // 默认值不写进 URL，保持地址干净
        const def = specs.find((s) => s.key === key)?.options[0].value
        if (value === def) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="pb-safe fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-lg border border-border-secondary bg-bg-container p-2 shadow-sm">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
        {zh ? '评审状态' : 'Review'}
      </span>
      {specs.map((spec) => (
        <ToggleGroup
          key={spec.key}
          type="single"
          value={first(spec.key)}
          onValueChange={(v) => v && write(spec.key, v)}
          spacing="sm"
          aria-label={zh ? `${spec.label}选择器` : `${spec.key} selector`}
        >
          {spec.options.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className="text-xs">
              {zh ? o.label : o.value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ))}
    </div>
  )
}

/** 路由组件读取评审状态；缺省值 = nav.ts 里该 spec 的第一项 */
export function useReviewParam(key: string, fallback: string): string {
  const [params] = useSearchParams()
  return params.get(key) ?? fallback
}
