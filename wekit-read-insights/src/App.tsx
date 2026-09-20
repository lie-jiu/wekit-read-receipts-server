// ============================================================
// PHASE C · 应用入口
// ------------------------------------------------------------
// 顺序有讲究：
//   AppProvider   会话 / 语言 / 明暗，外壳与所有 flow 共用
//   HashRouter    路由（原因见 shell/router.tsx 顶部说明）
//   ThemeStyleProvider + useDocumentTheme
//                 Spark 的 Provider 只下发 CSS 变量，不会在 <html> 上
//                 写 data-theme；而不写它的话 light-parchment 与
//                 light-mint 都命中 :root，品牌色会静默退回 mint。
//                 useDocumentTheme 就是补这一刀，见该文件的注释。
//   ErrorBoundary 包住路由，保证渲染异常时还有可操作的兜底页
// ============================================================

import { ThemeStyleProvider, Toaster } from 'sparkdesign'
import { HashRouter } from 'react-router-dom'
import { APP_STYLE, APP_THEME } from './flows/shared/theme'
import { useDocumentTheme } from './flows/shared/use-document-theme'
import { AppProvider, useApp } from './shell/app-context'
import { DevDock } from './shell/dev-dock'
import { ErrorBoundary } from './shell/error-boundary'
import { AppRoutes } from './shell/router'

function Themed() {
  const { appearance } = useApp()
  useDocumentTheme(appearance, APP_THEME, APP_STYLE)

  return (
    <ThemeStyleProvider appearance={appearance} theme={APP_THEME} style={APP_STYLE}>
      {/* theme 必须显式传：sparkdesign 的 Toaster 用 documentElement 的 data-theme==='dark'
          判断深浅，而 useDocumentTheme 写的是 'dark-parchment' 这类复合值，于是它永远
          判成 light，sonner 内部那套 --normal-bg / --normal-border 令牌就取浅色 ——
          toast 本体靠 CSS 变量没受影响，关闭按钮却是个纯白圆饼。 */}
      <Toaster position="top-right" theme={appearance} />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <DevDock />
    </ThemeStyleProvider>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Themed />
      </HashRouter>
    </AppProvider>
  )
}
