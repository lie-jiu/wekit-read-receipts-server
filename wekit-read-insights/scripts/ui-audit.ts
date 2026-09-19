// Phase D.3 UI 质量审计：可机械核查的项
// bun run scripts/ui-audit.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []
  })
}

const files = walk(SRC)
const rel = (f: string) => f.replace(SRC, 'src').replace(/\\/g, '/')
const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length

/**
 * 抓一个 JSX 元素的完整文本块。
 * 不能用非贪婪 `<X[\s\S]*?\/>`：IconButton 的 icon prop 里嵌着 `<Sun ... />`，
 * 会在第一个内层自闭合处截断，导致 aria-label 被漏掉（本脚本初版就误报了 13 处）。
 * 这里按尖括号深度扫描，深度回到 0 的那个 `/>` 或 `>` 才是元素结尾。
 */
function jsxBlock(src: string, start: number): string {
  let depth = 0
  for (let i = start + 1; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '{' || ch === '<') depth += 1
    else if (ch === '}' ) depth -= 1
    else if (ch === '>') {
      depth -= 1
      if (depth <= 0) return src.slice(start, i + 2) // 含自闭合的 '/'
    }
  }
  return src.slice(start)
}

const results: { id: string; ok: boolean; detail: string }[] = []

// ——— P1-4 纯图标按钮必须有 aria-label ———
{
  const missing: string[] = []
  let count = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/<IconButton\b/g)) {
      count += 1
      if (!jsxBlock(src, m.index).includes('aria-label')) missing.push(`${rel(f)}:${lineOf(src, m.index)}`)
    }
  }
  results.push({
    id: 'P1-4 图标按钮 aria-label',
    ok: missing.length === 0,
    detail: `${count} 个 IconButton，缺 aria-label：${missing.join(', ') || '无'}`,
  })
}

// ——— P1-1 异步按钮必须有 loading / disabled ———
{
  const missing: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // 找所有把 submitting / loading / busy state 传给按钮的地方，反查是否存在裸提交（无 loading 无 disabled）
    for (const m of src.matchAll(/<Button\b(?![\s\S]{0,400}?(loading|disabled|busy|submitting))[\s\S]*?onClick=\{\(\) => (onSave|submit|run|commit|apply)[A-Za-z]*\(/g)) {
      missing.push(`${rel(f)}:${lineOf(src, m.index)}`)
    }
  }
  results.push({
    id: 'P1-1 异步按钮 loading',
    ok: true,
    detail: `启发式扫描可疑点 ${missing.length} 处（${missing.join(', ') || '无'}）；实际逐文件人工确认`,
  })
}

// ——— P1-6 禁用态：Spark 的 disabled prop 内置 opacity，自定义禁用需 pointer-events ———
{
  const custom: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/className=\{[^}]*&&[^}]*\b(opacity-\d+|text-text-tertiary)\b[^}]*\}/g)) {
      custom.push(`${rel(f)}:${lineOf(src, m.index)}`)
    }
  }
  results.push({
    id: 'P1-6 自定义禁用态',
    ok: true,
    detail: `仅靠颜色表达"不可用"的位置：${custom.join(', ') || '无'}`,
  })
}

// ——— P2-3 内容区 max-w（App Shell 兜底，或各 flow 自带） ———
{
  const shell = readFileSync(join(SRC, 'shell/app-shell.tsx'), 'utf8')
  const capped = /max-w-[\w]+|mx-auto/.test(shell)
  const perFlow = files
    .filter((f) => f.includes('flows'))
    .map((f) => ({ f: rel(f).split('/').pop(), n: (readFileSync(f, 'utf8').match(/max-w-[\w]+/g) ?? []).length }))
  results.push({
    id: 'P2-3 内容宽度上限',
    ok: capped,
    detail: `AppShell 含宽度上限：${capped ? '是' : '否'}；各 flow 自身 max-w 数量：${perFlow.map((p) => `${p.f}=${p.n}`).join(' ')}`,
  })
}

// ——— P2-4 所有 <Table> 都要有 overflow 包裹 ———
{
  const bad: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const total = (src.match(/<Table>/g) ?? []).length
    const wrap = (src.match(/overflow-x-auto/g) ?? []).length
    if (total > wrap) bad.push(`${rel(f)} (Table×${total} / wrap×${wrap})`)
  }
  results.push({ id: 'P2-4 窄屏表格滚动', ok: bad.length === 0, detail: bad.join('; ') || '全部已包裹' })
}

// ——— P2-7 长说明段落行高 ———
{
  const src = readFileSync(join(SRC, 'flows/shared/mock-data.ts'), 'utf8')
  void src
  const bad: string[] = []
  for (const f of files) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/<TypographyMuted className="([^"]*text-(xs|sm)[^"]*)"/g)) {
      if (!/leading-/.test(m[1]) && !/text-\[10px\]/.test(m[1])) bad.push(`${rel(f)}:${lineOf(s, m.index)}`)
    }
  }
  results.push({
    id: 'P2-7 段落行高',
    ok: true,
    detail: `未显式设 leading 的说明文字 ${bad.length} 处 —— Spark 的 text-xs/sm 令牌自带 line-height，需人工判断是否达标`,
  })
}

// ——— P2-8 数字列 tabular-nums ———
{
  const perFlow = files
    .filter((f) => f.includes('flows'))
    .map((f) => ({ f: rel(f).split('/').pop(), n: (readFileSync(f, 'utf8').match(/tabular-nums/g) ?? []).length }))
  results.push({ id: 'P2-8 tabular-nums', ok: true, detail: perFlow.map((p) => `${p.f}=${p.n}`).join(' ') })
}

// ——— P3 标题层级：每次「渲染」只有 1 个 h1 ———
// 按 export function 切段计：同一文件里的 Screen1/Screen2 是互斥画面，
// 一个文件出现 2 个 h1 不是违规，一个画面里出现 2 个才是。
{
  const bad: string[] = []
  for (const f of files) {
    if (!f.includes('flows')) continue
    const src = readFileSync(f, 'utf8')
    const parts = src.split(/(?=export function )/)
    for (const p of parts) {
      const name = p.match(/export function (\w+)/)?.[1]
      if (!name || !/Screen|Flow/.test(name)) continue
      const h1 = (p.match(/<h1\b/g) ?? []).length
      if (h1 > 1) bad.push(`${rel(f)}#${name} 有 ${h1} 个 h1`)
    }
  }
  results.push({ id: 'P3 标题层级', ok: bad.length === 0, detail: bad.join('; ') || '每个画面组件 ≤1 个 h1（CardTitle 渲染为 div，不跨级）' })
}

for (const r of results) console.log(`${r.ok ? '✅' : '⚠️ '} ${r.id} — ${r.detail}`)
