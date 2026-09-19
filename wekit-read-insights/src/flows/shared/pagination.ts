/** 分页页码窗口：首尾恒在，中间随当前页滑动，超出用 gap 折叠 */
export function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | 'gap')[] = [1]
  if (current > 3) out.push('gap')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i += 1) out.push(i)
  if (current < total - 2) out.push('gap')
  out.push(total)
  return out
}
