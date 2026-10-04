import { useEffect, useState } from 'react'

/**
 * 与 Spark 侧栏 MOBILE_BREAKPOINT 逐字一致的「窄屏」判定。
 *
 * 为什么不用 CSS 断点解决表格：手机端要的是**换一种排版**
 * （一行 → 一张卡，字段名从表头变成行内标签），不是把 <table> 用
 * display:block 拆了再贴 ::before —— 那种做法要求每个 <td> 都带
 * data-label，而 Spark 的 DataTable 不把 column.header 透传到单元格，
 * 要么 fork 它，要么在 7 个文件里逐个手写标签，两条都不干净。
 *
 * 用 JS 判定还有一层好处：堆叠态下渲染的是真正的语义列表（<ul>），
 * 读屏顺序和触控热区都是按卡片设计的，而不是被 CSS 掰弯的表格。
 */
const QUERY = '(max-width: 767px)'

export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}
