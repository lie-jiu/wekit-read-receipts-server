// ============================================================
// PHASE C · 文档标题
// ------------------------------------------------------------
// 标题不能只在 AppShell 的页头里设：/login、/onboarding、/reads/:id
// 三块画面刻意不套外壳，如果标题跟着页头走，它们就会一直留着
// 上一个页面的 title —— 匿名公开链接顶着「排行榜」的标题尤其离谱。
// 所以抽成 hook，由每个画面自己声明。
// ============================================================

import { useEffect } from 'react'
import { docTitleOf } from './nav'

export function useDocTitle(label: string): void {
  useEffect(() => {
    if (label) document.title = docTitleOf(label)
  }, [label])
}
