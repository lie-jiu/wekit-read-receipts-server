import { useEffect } from 'react'
import type { Appearance, StylePreset, ThemePreset } from 'sparkdesign'

/**
 * 把 data-theme / data-style 同步到 <html>。
 *
 * 必须做，不能只靠 ThemeStyleProvider：sparkdesign@0.4.11 的 theme-base.css 用普通
 * `@theme`（非 `@theme inline`）把 `--color-*` 只声明在 `:root`，值为
 * `var(--token-color-*)`。自定义属性在声明它的那个元素上完成 var() 替换，因此工具类
 * 永远取到 `:root` 的那一份 —— 而 light-mint.css 的选择器里含 `:root`，于是
 * Provider 挂在 <div> 上的 `[data-theme="light-parchment"]` 对 mint 以外的主题完全无效。
 *
 * 挂到 <html> 后 `:root` 与 `[data-theme=…]` 命中同一元素，themes 的导入顺序
 * （mint → forest → parchment）保证同特异度下后者胜出。Portal 到 body 的
 * Drawer / Dialog / Tooltip 也由此一并拿到正确 token。
 */
export function useDocumentTheme(appearance: Appearance, theme: ThemePreset, style: StylePreset): void {
  useEffect(() => {
    const el = document.documentElement
    // 与包内 Uc(appearance, theme) 的取值规则保持一致：mint 不带后缀
    el.setAttribute('data-theme', theme === 'mint' ? appearance : `${appearance}-${theme}`)
    el.setAttribute('data-style', style)
    el.style.colorScheme = appearance
  }, [appearance, theme, style])
}
