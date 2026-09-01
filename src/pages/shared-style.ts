/**
 * 三个 dashboard 页面（dashboard / leaderboard / read-details）共享的样式与设计令牌。
 *
 * 原先这三个页面各自复制了一整份样式（leaderboard 约 220 行与 dashboard 完全重复），
 * 任意改一处就会漂移。这里把「三页完全一致」的规则抽成单一来源，各页面只保留自己
 * 独有的部分，并在共享块之后再输出，保证层叠顺序不变（已用脚本校验无顺序反转）。
 *
 * 设计令牌：改这里即可整体换肤。页面独有规则里若仍有硬编码色值，属于尚未令牌化的
 * 残留，可逐步收敛。
 *
 * 与 shared.ts 同理：本文件返回的是浏览器端 CSS 源码字符串。
 */

/* 仅令牌 + 全局 a11y 规则（不含组件样式）。
   account / admin / login 等自带独立布局的页面，令牌化后同样注入这一段即可换肤。 */
export function themeTokens(): string {
  return `:root{
  --bg: #0f172a; /* 页面底色 */
  --surface: #1e293b; /* 卡片/悬浮层 */
  --border: #334155; /* 分隔线 */
  --border-strong: #475569; /* 输入框边框 */
  --primary: #2563eb; /* 主色 */
  --primary-hover: #1d4ed8; /* 主色 hover */
  --primary-light: #3b82f6; /* 主色亮调（聚焦/渐变） */
  --text: #e2e8f0; /* 正文 */
  --text-strong: #f1f5f9; /* 标题 */
  --text-soft: #cbd5e1; /* 单元格正文 */
  --muted: #94a3b8; /* 次要文本 */
  --faint: #64748b; /* 弱化文本 */
  --row-hover: #0f172a80; /* 表格行 hover */
  --on-primary: #fff; /* 主色上的文字 */
  --danger: #dc2626; /* 危险描边 */
  --danger-strong: #b91c1c; /* 危险按钮 */
  --danger-hover: #991b1b; /* 危险按钮 hover */
  --danger-bg: #7f1d1d; /* 错误 toast 底 */
  --danger-text: #fecaca; /* 错误 toast 文字 */
  --ok: #059669; /* 成功描边 */
  --ok-bg: #065f46; /* 成功 toast 底 */
  --ok-text: #a7f3d0; /* 成功 toast 文字 */
  --info-bg: #1e3a5f; /* 信息 toast 底 */
  --info-text: #bfdbfe; /* 信息 toast 文字 */
  --radius: 10px; /* 卡片圆角 */
  --radius-sm: 6px; /* 按钮/输入框圆角 */
}
/* 浅色主题：只覆盖色板，结构令牌（圆角/间距）不变 */
html[data-theme="light"] {
  --bg: #f1f5f9;
  --surface: #ffffff;
  --border: #cbd5e1;
  --border-strong: #94a3b8;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-light: #3b82f6;
  --text: #0f172a;
  --text-strong: #020617;
  --text-soft: #334155;
  --muted: #475569;
  --faint: #64748b;
  --row-hover: #e2e8f0b0;
  --on-primary: #ffffff;
  --danger: #dc2626;
  --danger-strong: #b91c1c;
  --danger-hover: #991b1b;
  --danger-bg: #fecaca;
  --danger-text: #7f1d1d;
  --ok: #059669;
  --ok-bg: #d1fae5;
  --ok-text: #065f46;
  --info-bg: #bfdbfe;
  --info-text: #1e3a5f;
}
/* 键盘焦点环：原先只有 input 有聚焦边框，按钮/分页/可点击行对键盘用户完全不可见 */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
/* 照顾前庭功能敏感的用户：关掉动画与过渡，而不是简单粗暴地隐藏内容 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* 触屏设备：输入控件字号不低于 16px，避免 iOS Safari 聚焦时整页自动放大。
   页面级选择器（如 .controls input）特异性更高，故需 !important；仅 coarse pointer 生效，桌面观感不变。 */
@media (pointer: coarse) {
  input, select, textarea {
    font-size: 1rem !important;
  }
}
/* 去掉点按高亮，并消除按钮上双击缩放的等待延迟 */
button, input, select, textarea {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}`;
}

export function sharedStyle(): string {
  return `<style>
${themeTokens()}
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.container {
  max-width: 960px;
  margin: 0 auto;
}
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
}
.btn:active {
  transform: scale(0.97);
}
.btn-outline {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border-strong);
}
.btn-outline:hover {
  background: var(--surface);
  color: var(--text);
}
.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
}
.lang-toggle {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  background: transparent;
  color: var(--faint);
  border: 1px solid var(--border-strong);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  letter-spacing: 0.03em;
}
.lang-toggle:hover {
  color: var(--text);
  border-color: var(--muted);
}
/* 主题切换按钮：与语言切换同款 */
.theme-toggle {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  background: transparent;
  color: var(--faint);
  border: 1px solid var(--border-strong);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  letter-spacing: 0.03em;
}
.theme-toggle:hover {
  color: var(--text);
  border-color: var(--muted);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  text-align: left;
  padding: 0.65rem 1rem;
  font-size: 0.825rem;
}
th {
  background: var(--bg);
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}
td {
  border-bottom: 1px solid var(--surface);
  color: var(--text-soft);
}
tr:last-child td {
  border-bottom: none;
}
tr:hover td {
  background: var(--row-hover);
}
.empty-row td {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--border-strong);
  font-size: 0.85rem;
}
.hidden {
  display: none !important;
}
.repo-footer:hover {
  color: var(--text);
  background: var(--surface);
}
.repo-footer svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  body {
    padding: 1rem 0.75rem;
  }
  .header {
    flex-direction: column;
    align-items: stretch;
  }
  .header .flex {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
  .header .user-chip {
    grid-column: 1 / -1;
    justify-content: center;
  }
  .header .btn, .header .lang-toggle, .header .theme-toggle {
    width: 100%;
    justify-content: center;
    min-height: 40px;
  }
  table {
    display: block;
  }
  thead {
    display: none;
  }
  tbody {
    display: block;
  }
  tbody tr {
    display: block;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.25rem 0;
    margin-bottom: 0.6rem;
  }
  tbody tr:hover td, tbody tr:last-child td {
    background: transparent;
  }
  tbody tr td {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-bottom: 1px solid var(--surface);
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }
  tbody tr td:last-child {
    border-bottom: none;
  }
  tbody tr td::before {
    content: attr(data-label);
    color: var(--faint);
    font-weight: 600;
    font-size: 0.72rem;
    flex-shrink: 0;
  }
  .empty-row {
    border: 1px dashed var(--border);
    background: transparent !important;
  }
  .empty-row td {
    justify-content: center;
    text-align: center;
    color: var(--faint);
  }
  .empty-row td::before {
    display: none;
  }
  .toast-container {
    left: 1rem;
    align-items: stretch;
  }
  .toast {
    max-width: 100%;
  }
}
</style>`;
}
