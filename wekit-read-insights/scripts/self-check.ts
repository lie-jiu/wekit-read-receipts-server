// Phase D.4 自检脚本：import / export 与第三方符号存在性核查
// 用 bun 直接跑：bun run scripts/self-check.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(tsx|ts)$/.test(e.name) ? [p] : []
  })
}

const files = walk(SRC).filter((f) => !f.includes('scripts'))

/** 收集 `import { A, type B, C as D } from 'x'` 里的所有被导入符号 */
function importsOf(src: string) {
  const out: Map<string, { name: string; isType: boolean }[]> = new Map()
  const re = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g
  for (const m of src.matchAll(re)) {
    const leadingType = Boolean(m[1]) // `import type { X }` —— 整条都是类型
    const mod = m[3]
    const list = m[2]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        // `import { type X }` —— 内联标记，与 leadingType 取或
        const isType = leadingType || /^type\s/.test(s)
        const body = s.replace(/^type\s+/, '')
        const name = body.split(/\s+as\s+/)[0].trim()
        return { name, isType }
      })
    out.set(mod, [...(out.get(mod) ?? []), ...list])
  }
  return out
}

const sparkImported = new Set<string>()
const lucideImported = new Set<string>()
const localImports: { file: string; mod: string; name: string; isType: boolean }[] = []

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const [mod, list] of importsOf(src)) {
    // 类型 import 在编译后被擦除，运行时不存在，不参与运行时导出核查
    if (mod === 'sparkdesign') list.filter((x) => !x.isType).forEach((x) => sparkImported.add(x.name))
    else if (mod === 'lucide-react') list.filter((x) => !x.isType).forEach((x) => lucideImported.add(x.name))
    else if (mod.startsWith('.')) list.forEach((x) => localImports.push({ file: f, mod, ...x }))
  }
}

// —— Spark 运行时真实导出 ——
const bundlePath = join(ROOT, 'node_modules/sparkdesign/dist/spark-design.es.js')
const bundle = readFileSync(bundlePath, 'utf8')
const exportStart = bundle.lastIndexOf('\nexport {')
const exportBlk = bundle.slice(exportStart < 0 ? bundle.lastIndexOf('export {') : exportStart)
const sparkExports = new Set<string>()
for (const m of exportBlk.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?(\s*[,}])/g)) {
  sparkExports.add(m[2] ?? m[1])
}

// —— lucide 真实导出 ——
const lucideDts = readFileSync(join(ROOT, 'node_modules/lucide-react/dist/lucide-react.d.ts'), 'utf8')
const lucideExports = new Set<string>()
for (const m of lucideDts.matchAll(/^declare const ([A-Za-z0-9_$]+):/gm)) lucideExports.add(m[1])
for (const m of lucideDts.matchAll(/^\s+(\w+) as /gm)) lucideExports.add(m[1])

const sparkMissing = [...sparkImported].filter((x) => !sparkExports.has(x))
const lucideMissing = [...lucideImported].filter((x) => !lucideExports.has(x))

console.log(`扫描文件: ${files.length}`)
console.log(`sparkdesign 被导入符号: ${sparkImported.size} | 真实导出: ${sparkExports.size}`)
console.log(`  缺失: ${sparkMissing.join(', ') || '(无)'}`)
console.log(`lucide-react 被导入符号: ${lucideImported.size} | 真实导出: ${lucideExports.size}`)
console.log(`  缺失: ${lucideMissing.join(', ') || '(无)'}`)

// —— 本地模块 export 自洽 ——
let localChecked = 0
const localMissing: string[] = []
for (const imp of localImports) {
  const from = join(SRC, imp.file.replace(/^.*[\\/]src[\\/]/, ''), '..', imp.mod.replace(/^\.\//, ''))
  const candidates = [from + '.ts', from + '.tsx', join(from, 'index.ts'), join(from, 'index.tsx')]
  const target = candidates.find((c) => existsSync(c))
  localChecked += 1
  if (!target) {
    localMissing.push(`${imp.file.replace(SRC, 'src')} → 找不到模块 ${imp.mod}`)
    continue
  }
  const tsrc = readFileSync(target, 'utf8')
  const has =
    new RegExp(`export\\s+(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+${imp.name}\\b`).test(tsrc) ||
    // 含 `export { X }`、`export type { Phase as OverviewPhase }` 两种重导出写法
    [...tsrc.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].some((m) =>
      m[1].split(',').some((raw) => {
        const spec = raw.trim().replace(/^type\s+/, '')
        const exported = spec.split(/\s+as\s+/).pop()?.trim()
        return exported === imp.name
      }),
    ) ||
    new RegExp(`export\\s+\\*`).test(tsrc)
  if (!has) localMissing.push(`${imp.file.replace(SRC, 'src')} → ${imp.mod} 未导出 ${imp.name}`)
}
console.log(`本地 import 符号核查: ${localChecked}`)
console.log(`  缺失: ${localMissing.length ? '\n    ' + localMissing.join('\n    ') : '(无)'}`)

// —— import type 规则：从纯类型模块取值导入 ——
const typeOnlyModules = /types|i18n$/
const badTypeImports: string[] = []
for (const imp of localImports) {
  if (!typeOnlyModules.test(imp.mod)) continue
  const target = [imp.mod + '.ts', imp.mod + '.tsx']
    .map((m) => join(SRC, imp.file.replace(/^.*[\\/]src[\\/]/, ''), '..', m.replace(/^\.\//, '')))
    .find((c) => existsSync(c))
  if (!target) continue
  const tsrc = readFileSync(target, 'utf8')
  const isPureType = !/\bexport\s+(const|function|class|async function)\s/.test(tsrc)
  const exportedTypes = [...tsrc.matchAll(/export\s+(?:type|interface|enum)\s+(\w+)/g)].map((m) => m[1])
  if (isPureType && !imp.isType && exportedTypes.includes(imp.name))
    badTypeImports.push(`${imp.file.replace(SRC, 'src')} → ${imp.name} 应改为 import type`)
}
console.log(`import type 违规: ${badTypeImports.length ? '\n    ' + badTypeImports.join('\n    ') : '(无)'}`)

const failed = sparkMissing.length + lucideMissing.length + localMissing.length + badTypeImports.length
console.log(failed === 0 ? '\n✅ D.4.1 全部通过' : `\n❌ D.4.1 共 ${failed} 项待修`)
process.exit(failed === 0 ? 0 : 1)
