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
      <Toaster position="top-right" />
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
