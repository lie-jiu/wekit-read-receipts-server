// ============================================================
// 移动端表格：同一份列定义，两种排版
// ------------------------------------------------------------
// 与 Spark DataTable 的 props 兼容（columns / data / emptyText / className），
// 所以各 flow 只需把 import 从 sparkdesign 换成本地路径，列定义不用重写。
//
// 窄屏下不渲染 <table>，而是「一记录一卡片」：
//   · primary 指定的列升为卡片标题（不然 6 个字段等权平铺，
//     读一行要竖着扫六遍，比横向滚动更难用）
//   · compactHidden 指定的列直接不显示 —— 手机上不该把所有列都塞给用户，
//     例如 IP 明细表的 user_agent 属于「要时再看」的信息
//   · 其余列以「标签 ←→ 值」两端对齐成行，标签复用 column.header，
//     所以中英切换、改文案都只需要改列定义一处
// ============================================================

import type { ReactNode } from 'react'
import { DataTable, TypographyMuted } from 'sparkdesign'
import type { DataTableColumn } from 'sparkdesign'
import { useIsCompact } from './use-is-compact'

export type ResponsiveTableProps<TData> = {
  columns: DataTableColumn<TData>[]
  data: TData[]
  emptyText?: ReactNode
  className?: string
  /** 卡片标题取哪一列（用 column.key 指定）；省略则不强调首列 */
  primary?: string
  /** 窄屏下不展示的列 —— 宽屏照旧全部可见 */
  compactHidden?: string[]
  /**
   * 卡片右上角的次要信息，用 column.key 指定。
   * 故意不收 `meta: (row) => ReactNode`：那样传进来的值往往同时也是某一列，
   * 于是同一个时间戳会在右上角和正文行各显示一次 —— 六个调用点全都踩到了。
   * 改成 key 之后，组件自己把它从正文行里摘出去，重复在类型层面就不可能发生。
   */
  metaKey?: string
}

export function ResponsiveTable<TData extends Record<string, unknown>>({
  columns,
  data,
  emptyText = '—',
  className,
  primary,
  compactHidden = [],
  metaKey,
}: ResponsiveTableProps<TData>) {
  const compact = useIsCompact()

  if (!compact) {
    return <DataTable columns={columns} data={data} emptyText={emptyText} className={className} />
  }

  const pick = (col: DataTableColumn<TData> | undefined, row: TData, i: number): ReactNode =>
    col ? (col.cell ? col.cell(row, i) : col.accessor ? String(row[col.accessor] ?? '') : null) : null

  const titleCol = primary ? columns.find((c) => c.key === primary) : undefined
  const metaCol = metaKey ? columns.find((c) => c.key === metaKey) : undefined
  const rest = columns.filter((c) => c.key !== titleCol?.key && c.key !== metaCol?.key && !compactHidden.includes(c.key))

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-tertiary px-4 py-10 text-center">
        <TypographyMuted className="text-sm">{emptyText}</TypographyMuted>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row, rowIndex) => (
        <li
          key={rowIndex}
          className="rounded-lg border border-border-tertiary bg-bg-container px-3 py-2.5"
        >
          {(titleCol || metaCol) && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-sm text-text">{pick(titleCol, row, rowIndex)}</div>
              {metaCol && <div className="shrink-0 text-xs text-text-tertiary tabular-nums">{pick(metaCol, row, rowIndex)}</div>}
            </div>
          )}
          <dl className={titleCol || metaCol ? 'mt-2 flex flex-col gap-1.5' : 'flex flex-col gap-1.5'}>
            {rest.map((col) => (
              <div key={col.key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs text-text-tertiary">{col.header}</dt>
                <dd className="min-w-0 text-right text-sm text-text">{pick(col, row, rowIndex)}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}
