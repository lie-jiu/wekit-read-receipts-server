// ============================================================
// sparkdesign barrel 的"什么都不渲染"桩件
// ------------------------------------------------------------
// 见 vite.config.ts 的 STUBBED_DEPS 注释。这个文件不是组件库的一部分，
// 它存在的唯一理由是把 markdown / 公式 / 动画那一整族依赖挡在产物之外。
// ============================================================

/**
 * 同时充当被桩件化的三种角色：
 *   · React 组件（react-markdown / lottie-react / prism 的 Highlight）→ 渲染 null；
 *   · unified 插件（remark-gfm / remark-math / rehype-katex）→ 只有 ReactMarkdown 真去渲染时
 *     才会被调用，而它已经是这个函数了，所以永远不会被调用。
 * 也就是说：只要有人真在页面上渲染了这些组件，症状是"那块区域空白"，
 * 而不是抛错 —— 所以 vite.config.ts 里配了一条构建期断言，别只依赖这里的注释。
 */
export default function NoRender(): null {
  return null;
}

/** prism-react-renderer 用到的具名导出（其余是给未来变更留的兜底，未引用即被 tree-shake） */
export const Highlight = NoRender;
export const Lottie = NoRender;
export const Markdown = NoRender;
