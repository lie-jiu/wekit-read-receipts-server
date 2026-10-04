/**
 * 品牌图形：与 public/favicon.svg 同一枚「消息气泡 + 已读勾」。
 *
 * 颜色不写死，取主题的 --color-primary / --color-text-on-primary，所以明暗两档
 * 自动跟随（favicon 那份只能写死十六进制 + @media，因为浏览器标签页读不到这里的 token）。
 * 改图形时两份一起改，否则 tab 图标和站内标识会分叉。
 */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <rect x="4.6" y="5.6" width="19" height="14.4" rx="3.8" className="fill-text-on-primary" />
      {/* 尾巴与气泡同色且顶部重叠，圆角矩形压住接缝 */}
      <path d="M8.6 18.6h7l-5.7 6.8c-.7.8-1.3.4-1.3-.7z" className="fill-text-on-primary" />
      <path
        d="M8.8 12.6l4 3.8 6.6-7.2"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      />
    </svg>
  )
}
