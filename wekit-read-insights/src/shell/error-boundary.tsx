// ============================================================
// PHASE C · 崩溃兜底
// ------------------------------------------------------------
// 原产品是服务端拼 HTML，前端崩了整页白屏且没有回退路径。
// SPA 至少要把「哪个页面崩了、能回到哪」说清楚，并把错误码留在页面上，
// 便于自建服务端的使用者贴出来求助。
//
// 两层：
//   · ErrorBoundary —— 抓渲染期抛出的异常（组件树内部）
//   · RouteError    —— 抓 react-router 抛出的 loader / render 错误
// ============================================================

import { Component } from 'react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, TypographyMuted } from 'sparkdesign'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'

type State = { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error): void {
    // 自建服务端没有托管的错误收集，先保证本地能看见；接入 Sentry 时替换这一行
    console.error('[wekit-read-insights] 渲染异常', error)
  }

  private readonly reset = () => this.setState({ error: null })

  override render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <CrashScreen message={error.message} onReset={this.reset} />
  }
}

function CrashScreen({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg-layout p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-3 p-6">
          <Alert variant="destructive">
            <AlertTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4" />
              页面渲染出错
            </AlertTitle>
            <AlertDescription>{message || '未知错误'}</AlertDescription>
          </Alert>
          <TypographyMuted className="text-xs">
            数据仍在你自己的服务端里，刷新不会丢任何东西。若反复出现，请把上面的错误信息带到 issue 里。
          </TypographyMuted>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onReset}>
              重试
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                window.location.hash = '#/overview'
                window.location.reload()
              }}
            >
              回到总览
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** react-router 的 errorElement：路由级错误复用同一块画面 */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : '未知错误'
  return <CrashScreen message={message} onReset={() => window.location.reload()} />
}
