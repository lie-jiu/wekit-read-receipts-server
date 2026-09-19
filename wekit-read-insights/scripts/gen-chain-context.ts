// ============================================================
// Phase D · 链式上下文生成器
// ------------------------------------------------------------
// 写 spark-output/context/flow-web.json + _session-state.json，
// 并按 chain-protocol §九 从 _shared/dashboard-template.html 生成面板。
//
// components_used 不手写：直接从每个 flow 的 sparkdesign import 里抽，
// 手写清单一定会和代码对不上。
//
// 用法：bun run scripts/gen-chain-context.ts
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'spark-output')
const CTX = join(OUT, 'context')

// ——— 1. 机械抽取每个 flow 实际用到的 Spark 组件 ———
function sparkComponentsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out = new Set<string>()
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'sparkdesign'/g)) {
    if (m[1]) continue // 整条是 import type，不是组件
    for (const raw of m[2].split(',')) {
      const s = raw.trim()
      if (!s || /^type\s/.test(s)) continue
      out.add(s.split(/\s+as\s+/)[0].trim())
    }
  }
  return [...out].sort()
}

const FLOW_FILES: Record<string, string> = {
  'flow-1': 'src/flows/flow-1/flow1-auth.tsx',
  'flow-2': 'src/flows/flow-2/flow2-overview.tsx',
  'flow-3': 'src/flows/flow-3/flow3-read-details.tsx',
  'flow-4': 'src/flows/flow-4/flow4-admin-users.tsx',
  'flow-5': 'src/flows/flow-5/flow5-admin-config.tsx',
  'flow-6': 'src/flows/flow-6/flow6-account.tsx',
  'flow-7': 'src/flows/flow-7/flow7-leaderboard.tsx',
}

type Screen = { name: string; file_path: string; route: string; state_variants: string[]; note?: string }
type Flow = {
  id: string
  name: string
  screens: Screen[]
  components_used: string[]
  components_missing: string[]
}

const FLOWS: Flow[] = [
  {
    id: 'flow-1',
    name: '登录与进入（认证 → 首次引导）',
    screens: [
      { name: '屏 1 登录', file_path: 'src/flows/flow-1/flow1-auth.tsx', route: '#/login', state_variants: ['default', 'filled', 'submitting', 'error:invalid_credentials', 'error:invite_required', 'error:rate_limited(倒计时)', 'error:network'] },
      { name: '屏 2 注册', file_path: 'src/flows/flow-1/flow1-auth.tsx', route: '#/login (Tabs→注册)', state_variants: ['default', 'error:wxid_taken', 'submitting'] },
      { name: '屏 3 首次运行引导', file_path: 'src/flows/flow-1/flow1-auth.tsx', route: '#/onboarding', state_variants: ['step1', 'step2', 'done'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-1']),
    components_missing: ['无（认证卡是 Minimal 外壳，不需要专属组件）'],
  },
  {
    id: 'flow-2',
    name: '已读总览 + 全局时间范围',
    screens: [
      { name: '屏 1 总览', file_path: 'src/flows/flow-2/flow2-overview.tsx', route: '#/overview', state_variants: ['ready', 'loading', 'error', 'empty-never', 'empty-filter'] },
      { name: '屏 2 时间范围选择器', file_path: 'src/flows/flow-2/flow2-overview.tsx', route: '#/overview (Popover)', state_variants: ['presets', 'custom-range', 'range-incomplete', 'range-applied'] },
      { name: '屏 3 时间切换后的重载态', file_path: 'src/flows/flow-2/flow2-overview.tsx', route: '#/overview?simulate=loading', state_variants: ['skeleton-then-ready'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-2']),
    components_missing: ['Sparkline（KPI 卡内的 7 日微缩趋势，手写内联 SVG）', 'StackedBar（注册/已读双序列堆叠柱，用 div 宽度拼）', 'HourBars（24 小时活跃分布，手写 div 柱）'],
  },
  {
    id: 'flow-3',
    name: '单条消息已读明细钻取',
    screens: [
      { name: '屏 1 消息已读汇总', file_path: 'src/flows/flow-3/flow3-read-details.tsx', route: '#/messages/:id', state_variants: ['ready', 'empty-no-reads', 'loading'] },
      { name: '屏 2 已读明细表格', file_path: 'src/flows/flow-3/flow3-read-details.tsx', route: '#/messages/:id (Tabs→明细)', state_variants: ['ready', 'located', 'not-located', 'blocked-filtered-count', 'error:quota_exhausted'] },
      { name: '屏 3 单 IP 定位结果', file_path: 'src/flows/flow-3/flow3-read-details.tsx', route: '#/messages/:id (行内展开)', state_variants: ['success', 'partial(仅中文)', 'all-providers-failed'] },
      { name: '屏 4 管理抽屉', file_path: 'src/flows/flow-3/flow3-read-details.tsx', route: '#/messages/:id (Drawer)', state_variants: ['private', 'public', 'blocklist-empty', 'blocklist-filled', 'confirm-delete'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-3']),
    components_missing: ['无（Drawer 取代了 Spark 尚未导出的 Sheet）'],
  },
  {
    id: 'flow-4',
    name: '管理后台 · 用户与等级',
    screens: [
      { name: '屏 1 用户列表', file_path: 'src/flows/flow-4/flow4-admin-users.tsx', route: '#/admin/users', state_variants: ['ready', 'searching', 'empty-search', 'pending-level-badge'] },
      { name: '屏 2 用户详情抽屉', file_path: 'src/flows/flow-4/flow4-admin-users.tsx', route: '#/admin/users (Drawer)', state_variants: ['with-activity', 'no-messages', 'no-audit'] },
      { name: '屏 3 新建用户 / 重置密码', file_path: 'src/flows/flow-4/flow4-admin-users.tsx', route: '#/admin/users (Dialog)', state_variants: ['default', 'submitting', 'error:wxid_taken', 'success'] },
      { name: '屏 4 等级不足拦截', file_path: 'src/flows/flow-4/flow4-admin-users.tsx', route: '#/admin/* (非管理员)', state_variants: ['level-blocked'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-4']),
    components_missing: ['无'],
  },
  {
    id: 'flow-5',
    name: '管理后台 · 权益公式与僵尸清理',
    screens: [
      { name: '屏 1 权益公式编辑器', file_path: 'src/flows/flow-5/flow5-admin-config.tsx', route: '#/admin/config', state_variants: ['default', 'draft-dirty', 'preview-updating', 'source:builtin-vs-formula'] },
      { name: '屏 2 公式非法', file_path: 'src/flows/flow-5/flow5-admin-config.tsx', route: '#/admin/config (inline)', state_variants: ['error:unknown-identifier', 'error:assignment', 'error:non-numeric', 'error:too-deep'] },
      { name: '屏 3 僵尸数据预览', file_path: 'src/flows/flow-5/flow5-admin-config.tsx', route: '#/admin/config (Tabs→清理)', state_variants: ['idle', 'previewing', 'has-matches', 'no-matches'] },
      { name: '屏 4 执行清理与孤儿表', file_path: 'src/flows/flow-5/flow5-admin-config.tsx', route: '#/admin/config (AlertDialog)', state_variants: ['confirm', 'purging', 'done(deleted/skipped)', 'orphan-empty', 'orphan-filled'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-5']),
    components_missing: ['无（公式编辑器是 textarea + 自研解析器，不需要新组件）'],
  },
  {
    id: 'flow-6',
    name: '账户与隐私设置',
    screens: [
      { name: '屏 1 账户总览与配额', file_path: 'src/flows/flow-6/flow6-account.tsx', route: '#/account', state_variants: ['ample-quota', 'tight-quota(≥85%)', 'no-remaining-semantics(不画条)'] },
      { name: '屏 2 账户级 IP 黑名单', file_path: 'src/flows/flow-6/flow6-account.tsx', route: '#/account (同页第二卡)', state_variants: ['empty', 'filled', 'error:invalid-ipv4', 'error:duplicate', 'success'] },
      { name: '屏 3 危险区', file_path: 'src/flows/flow-6/flow6-account.tsx', route: '#/account (页尾卡)', state_variants: ['gate-locked', 'gate-unlocked(逐字匹配)', 'confirming'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-6']),
    components_missing: ['无'],
  },
  {
    id: 'flow-7',
    name: '排行榜与公开链接',
    screens: [
      { name: '屏 1 排行榜主视图', file_path: 'src/flows/flow-7/flow7-leaderboard.tsx', route: '#/leaderboard', state_variants: ['reg/read/msg × day/total', 'rank≤10', 'rank>10', 'rank=null(本窗口无计数)'] },
      { name: '屏 2 榜单状态屏', file_path: 'src/flows/flow-7/flow7-leaderboard.tsx', route: '#/leaderboard?stage=states&phase=empty', state_variants: ['loading', 'empty-daily(UTC 日切)', 'empty-global', 'error:500'] },
      { name: '屏 3 公开链接匿名只读', file_path: 'src/flows/flow-7/flow7-leaderboard.tsx', route: '#/reads/:id', state_variants: ['anon(定位全禁用)', 'not-located-tag', 'blocked-count'] },
    ],
    components_used: sparkComponentsOf(FLOW_FILES['flow-7']),
    components_missing: ['无（名次条形复用 div 宽度，与 F2 同一套做法）'],
  },
]

const SHELL_FILES = ['src/App.tsx', 'src/shell/nav.tsx', 'src/shell/app-shell.tsx', 'src/shell/app-context.tsx', 'src/shell/command-menu.tsx', 'src/shell/router.tsx', 'src/shell/dev-dock.tsx', 'src/shell/error-boundary.tsx', 'src/shell/use-doc-title.ts']
const SHARED_FILES = ['src/flows/shared/types.ts', 'src/flows/shared/mock-data.ts', 'src/flows/shared/i18n.ts', 'src/flows/shared/formula.ts', 'src/flows/shared/pagination.ts', 'src/flows/shared/theme.ts', 'src/flows/shared/use-document-theme.ts']

const context = {
  skill: 'flow-web',
  generated_at: new Date().toISOString(),
  project_name: 'wekit-read-insights',
  project_type: 'redesign',
  project_subtype: '双视角全站重设计（终端用户 + 管理员）',
  scenario: 'SaaS Management + Data Analytics/BI（双场景；公开链接页走 Minimal 外壳）',
  component_library: 'Spark Design 0.4.11（npm 整包模式，中途不再切换）',
  tech_stack: {
    runtime: 'React 19 + TypeScript 7.0.2(tsgo) + Vite 8 + Tailwind CSS 4',
    package_manager: 'bun 1.4.2',
    routing: 'react-router-dom 7 HashRouter（与 Worker 上的 SSR 路径并行，不抢 path）',
    charts: 'recharts 3.10（经 Spark ChartContainer）',
    theme: 'ThemeStyleProvider + 自研 useDocumentTheme 补 data-theme，主题=parchment，style=compact',
    i18n: 'zh / en 双语 chrome 词条（57 条）+ 各屏叙述性中文文案',
    mock: '固定种子 LCG 的派生式 mock（单一事实源，KPI/图表/表格/排行榜互相对得上）',
  },
  design_constraints: [
    '只用 Spark design token，不写死 hex / px（原排行榜的 #fbbf24 已换 text-warning）',
    '不使用任何动态代码求值：权益公式预览走自研 tokenizer + 递归下降解析器 + 函数白名单',
    ':focus-visible 焦点环不得移除（仓库既有约定）',
  ],
  flows: FLOWS,
  shell: {
    files: SHELL_FILES,
    ia_levels: '一级=分组(工作区/运营) 二级=侧栏条目(4 可用 + 2 标注待设计) 三级=屏内 Tabs/Drawer/钻取',
    permission_layers: ['RequireSignedIn (401→/login)', 'RequireAdmin (路由级拦截，非置灰)', 'canManage (他人公开消息只读)'],
    settings_placement: '账户设置在头像下拉，不占主导航一级',
    keyboard: '⌘K / Ctrl+K 命令面板；导航项为真实 <a> 可中键开新标签',
  },
  output_files: [...Object.values(FLOW_FILES), ...SHELL_FILES, ...SHARED_FILES, 'scripts/self-check.ts', 'scripts/ui-audit.ts', 'scripts/gen-chain-context.ts'],
  verification: {
    typecheck: 'tsc --noEmit 通过（strict + noUnusedLocals + noUnusedParameters + isolatedModules）',
    build: 'vite build 通过；仅 chunk-size 提示',
    runtime: 'vite preview（production 产物）走查：登录 / 6 条路由 / ⌘K / 钻取 / 匿名公开链接 / 折叠侧栏，控制台 0 error 0 warning',
    bundle: 'main chunk 2693 kB / gzip 713 kB；css 170 kB / gzip 25 kB；88 个 js chunk（大头是 Spark 整包带进来的 mermaid / cytoscape / lottie / katex）',
    not_verified: '无法截图，因此未做像素级视觉还原确认；对比度按 token 语义与实测 computed color 推断',
  },
  known_gaps: [
    'AlertDialog 叠在 Drawer 之上时依赖 portal 的 DOM 顺序而非显式 z-index 层级',
    '叙述性长文案未做全量 i18n（只双语化了跨屏复用的 chrome 词条）',
    'F6 IP 拉黑与 F4 部分操作在原型里是同步的，接真实 API 需补 loading + 提交期禁用输入',
    '公开链接会向匿名访客返回完整 IP / UA，且账户级黑名单对其不生效（服务端既有行为，界面已显式告警，建议产品侧复核）',
  ],
  next_skills_suggested: ['check', 'edge', 'chart', 'flow-mobile'],
}

// ——— 2. 落盘 ———
mkdirSync(CTX, { recursive: true })
writeFileSync(join(CTX, 'flow-web.json'), JSON.stringify(context, null, 2))
console.log(`✅ spark-output/context/flow-web.json — ${FLOWS.length} flows / ${FLOWS.reduce((a, f) => a + f.screens.length, 0)} screens / ${context.output_files.length} files`)

const sessionState = {
  current_skill: 'flow-web',
  workspace_path: ROOT,
  original_workspace_path: join(ROOT, '..'),
  completed_skills: ['flow-web'],
  current_phase: '完成（Phase B 7 个 flow + Phase C App Shell + Phase D 收尾文档）',
  updated_at: new Date().toISOString(),
}
writeFileSync(join(CTX, '_session-state.json'), JSON.stringify(sessionState, null, 2))
console.log('✅ spark-output/context/_session-state.json')

// ——— 3. ready set（chain-protocol §一：s.required ⊆ done）———
const graphCandidates = [
  // 套件安装位置随平台走，用 homedir 拼而不是写死某个盘符
  join(homedir(), '.qoder/plugins/cache/qoder-marketplace/product-design/0.5.10/_shared/skill-graph.json'),
  join(ROOT, '../.qoder/plugins/cache/qoder-marketplace/product-design/0.5.10/_shared/skill-graph.json'),
]
const graphPath = graphCandidates.find((p) => existsSync(p))
const done = new Set(
  readdirSync(CTX)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace('.json', '')),
)
if (!graphPath) {
  console.log('⚠️ 未找到 skill-graph.json，跳过 ready set 计算与面板生成')
  process.exit(0)
}
const graph = JSON.parse(readFileSync(graphPath, 'utf8'))
const current = graph.skills.find((s: { id: string }) => s.id === 'flow-web')
const ready = graph.skills
  .filter((s: { id: string; required?: string[] }) => !done.has(s.id) && (s.required ?? []).every((r) => done.has(r)))
  .map((s: { id: string; phase: number }) => ({ ...s, _phase: s.phase }))

const order = (id: string) => {
  const p = current.next_hint.preferred.indexOf(id)
  if (p >= 0) return -100 + p
  const a = current.next_hint.alternatives.findIndex((x: { id: string }) => x.id === id)
  if (a >= 0) return 0 + a
  return 50 + (ready.find((s: { id: string }) => s.id === id)?._phase ?? 9)
}
const top5 = [...ready].sort((x, y) => order(x.id) - order(y.id)).slice(0, 5).map((s: { id: string }) => s.id)
console.log(`\nready set: ${ready.length} 个 | 前 5 候选: ${top5.join(', ')}`)
console.log(`next_hint: preferred=${current.next_hint.preferred.join(',')} emoji=${current.next_hint.emoji}`)

// ——— 4. dashboard ———
const sharedDir = graphPath.replace(/skill-graph\.json$/, '')
const tpl = readFileSync(join(sharedDir, 'dashboard-template.html'), 'utf8')
const STATE = {
  project: 'wekit-read-insights',
  generated_at: new Date().toISOString(),
  contexts: {
    'flow-web': {
      done: true,
      summary: '7 flows / 24 screens + App Shell（Spark Design, parchment）',
      fields: { scenario: context.scenario, component_library: context.component_library },
    },
  },
}
/**
 * 注入点必须锚到代码本身：模板的用法说明里也出现了
 * `/*__SPARK_STATE_INJECT__*\/` 这个字面量（出现在 3 段注释里），
 * 直接 replace 第一个匹配会替换掉注释，真正的 `const STATE = ...null` 原样留下，
 * 结果面板渲染成「项目名待生成 · 0/28」却看不出任何报错。
 */
const INJECT_ANCHOR = 'const STATE = /*__SPARK_STATE_INJECT__*/null'
const injected = tpl.includes(INJECT_ANCHOR)
  ? tpl.replace(INJECT_ANCHOR, `const STATE = /*__SPARK_STATE_INJECT__*/${JSON.stringify(STATE)}`)
  : tpl.replace(/\/\*__SPARK_STATE_INJECT__\*\/null/, `/*__SPARK_STATE_INJECT__*/${JSON.stringify(STATE)}`)
if (injected === tpl) console.log('⚠️ 模板占位符未命中，面板未注入 STATE')
else {
  writeFileSync(join(OUT, 'dashboard.html'), injected)
  const rendered = injected.includes(JSON.stringify(STATE).slice(1, 60))
  console.log(`✅ spark-output/dashboard.html（进度 ${Object.keys(STATE.contexts).length}/28，STATE 已落到代码行：${rendered}）`)
}
