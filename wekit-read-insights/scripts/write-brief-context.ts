// ============================================================
// Brief Phase 7 · 双通道输出 + 链路面板聚合
// ------------------------------------------------------------
// 1) 写 spark-output/context/brief.json（主持久化通道）
// 2) 通用化重生成 spark-output/dashboard.html：
//    扫描 context/ 下**全部** *.json 聚合 STATE，
//    而不是硬编码某一个 Skill —— 否则每跑一个 Skill 都要改脚本。
//
// 用法：bun run scripts/write-brief-context.ts
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const CTX = join(ROOT, 'spark-output/context')
mkdirSync(CTX, { recursive: true })

/**
 * chain-protocol §2.1.2：中文弯引号会被存成 ASCII 双引号从而打断 JSON 结构，
 * 统一替换为「」。
 */
const safe = (s: string) => s.replace(/[‘’“”]/g, (c) => ({ '‘': '「', '’': '」', '“': '「', '”': '」' }[c] as string))
const safeAll = (arr: string[]) => arr.map(safe)

const brief = {
  skill: 'brief',
  generated_at: new Date().toISOString(),
  project_name: 'wekit-read-insights',
  project_type: '产品设计',
  project_subtype: '产品改版',
  business_context: safe(
    '自建「微信已读回执」服务端，AGPL 协议、个人部署。六个页面长期由服务端拼接 HTML + 内联样式提供，无前端构建。功能已完备但界面停留在能用级别，黑名单作用域、UTC 日切、Lv 0 语义等关键规则只存在于源码中。',
  ),
  business_goal: safeAll([
    '公开链接访客读完率 ≥70%（建议基线，待签认）',
    '新部署者 5 分钟内发出首条打点',
    'GitHub star 季度环比 +30%（建议基线，待签认）',
    '管理员周活跃留存 ≥60%（建议基线，待签认）',
  ]),
  user: safeAll([
    '自建者本人：单机部署，日常查已读',
    '群成员：点开公开链接的匿名访客',
    '实例管理员：管用户、等级与清理',
    '潜在开源使用者：部署前先评估界面',
  ]),
  strategy_dimensions: [
    {
      dimension: '信息架构 IA',
      thesis: safe('运营区整组按 isAdmin 摘除，而非置灰。'),
      tactics: safeAll(['三级 IA 收进侧栏', 'Settings 下沉头像下拉', '未设计项显式禁用']),
      rationale: safe('对应 G4；普通用户不该看到无效入口'),
    },
    {
      dimension: '交互设计',
      thesis: safe('钻取与不可逆操作各自成套。'),
      tactics: safeAll(['聚合→明细页内 Tabs', '危险操作逐字确认', '错误 inline 不用 Toast']),
      rationale: safe('对应 G1 G4；原版删除无确认'),
    },
    {
      dimension: '视觉设计',
      thesis: safe('全量走 design token 不留硬编码。'),
      tactics: safeAll(['parchment 主题', '语义色替换硬编码金', 'compact 密度']),
      rationale: safe('对应 G3；硬编码色暗色下对比不足'),
    },
    {
      dimension: '数据可视化',
      thesis: safe('时间全局统一，排名给相对量。'),
      tactics: safeAll(['顶部范围驱动三层', '条形编码与榜首比值', '空态按成因分支']),
      rationale: safe('对应 G4；纯数字列需心算'),
    },
    {
      dimension: '内容设计',
      thesis: safe('界面说清后端真实语义。'),
      tactics: safeAll(['写明 UTC 日切', 'Lv 0 改述已停注册', '三级黑名单作用域对照']),
      rationale: safe('对应 G2 G4；规则原先只在代码'),
    },
    {
      dimension: '无障碍设计',
      thesis: safe('状态不只靠颜色传达。'),
      tactics: safeAll(['保留 focus-visible 环', '图标按钮 aria-label', '禁用态附说明']),
      rationale: safe('仓库既有约定；原版靠底色区分'),
    },
    {
      dimension: '多端适配',
      thesis: safe('窄屏不裁切，侧栏可让位。'),
      tactics: safeAll(['侧栏 off-canvas', '表格统一横向滚动包', '折叠图标栏配 tooltip']),
      rationale: safe('对应 G1；原版表格靠溢出撑'),
    },
  ],
  design_criteria: {
    quantitative: safeAll(['表格滚动包裹 7/7 flow', '图标按钮 aria-label 13/13']),
    qualitative: safeAll(['权限与状态不靠颜色单独传达', '后端规则界面自解释']),
  },
  constraints: safeAll([
    '后端接口路径与字段名一律不改',
    'Bun + Workers 双运行时同一代码库',
    'SSR 页面须与新 SPA 并行可用',
    '禁止动态代码求值（公式走解析器）',
    'Spark 整包体积本轮不重构',
  ]),
  out_of_scope: safeAll([
    '不改任何 API 与打点路径',
    '全局黑名单页、操作留痕页不设计',
    '不做全量 i18n，仅双语化复用词条',
    '不含移动端原生（RN）flow；Web 端自身的移动端适配已做',
    '不接真实鉴权与会话',
  ]),
  style: 'Chalk',
  ratio: '16-9',
  scale: 'md',

  // —— 产品改版专属字段（SKILL.md「字段结构」要求，schema 未列，作为扩展键）——
  context_inputs: safeAll(['wekit-read-receipts-server README', 'Phase A 已确认的 7 flow IA 骨架', 'routes/*.ts 与 pages/*.ts 源码走读']),
  revision_scope: safe('六个服务端渲染页面 → 7 flow / 24 屏 React SPA 原型 + App Shell'),
  retained_elements: safeAll([
    '后端接口路径与响应字段名',
    'maskWxId / maskContent 原脱敏实现',
    '日榜 UTC 日切口径',
    '黑名单在服务端过滤、只回隐藏条数的语义',
    ':focus-visible 焦点环仓库约定',
  ]),
  business_metrics: safe('同 business_goal（增长导向：访客读完率 / 首条打点耗时 / star 环比 / 管理员留存）'),
  tech_stack: safe('React 19 + TS 7 + Vite 8 + Tailwind 4 + Spark Design 0.4.11 + recharts 3.10 + react-router 7，bun 1.4 管理'),
  output_html: 'spark-output/brief/wekit-read-insights.html',

  // ⚠️ 显式假设标记：Phase 5 要求把未验证的东西标出来，不能让下游当成事实
  assumptions: safeAll([
    '三个增长目标数字（≥70% / +30% / ≥60%）是 AI 建议基线，未经数据或用户确认',
    '「公开链接是产品落地页、可归因到增长」这条因果链未经证实',
    '增长指标无法与设计改动做严格归因，/check 的策略一致性走查需按此打折',
  ]),
}

const briefPath = join(CTX, 'brief.json')
writeFileSync(briefPath, JSON.stringify(brief, null, 2))
// 写盘后立即回读解析，验证 JSON 未被引号打断
JSON.parse(readFileSync(briefPath, 'utf8'))
console.log(`✅ spark-output/context/brief.json（${brief.strategy_dimensions.length} 维度 / ${brief.design_criteria.quantitative.length + brief.design_criteria.qualitative.length} 条标准 / 回读解析通过）`)

// ═══ 链路面板：聚合 context/ 下所有 *.json ═══
const SHARED = [
  join(homedir(), '.qoder/plugins/cache/qoder-marketplace/product-design/0.5.10/_shared'),
].find((d) => existsSync(join(d, 'dashboard-template.html')))
if (!SHARED) {
  console.log('⚠️ 链路面板模板未找到（套件安装可能不完整）。本 Skill 已正常完成，下游链路不受影响。')
  process.exit(0)
}

const summaries: Record<string, string> = {
  brief: '目标 / 7 维策略 / 4 条设计标准已锚定',
  'flow-web': '7 flows / 24 屏 + App Shell（Spark, parchment）',
}
const contexts: Record<string, { done: boolean; summary: string; fields: Record<string, unknown> }> = {}
for (const f of readdirSync(CTX).filter((n) => n.endsWith('.json') && !n.startsWith('_'))) {
  const id = f.replace('.json', '')
  const data = JSON.parse(readFileSync(join(CTX, f), 'utf8'))
  contexts[id] = {
    done: true,
    summary: summaries[id] ?? `${id} 已完成`,
    fields:
      id === 'brief'
        ? { project_type: `${data.project_type}/${data.project_subtype}`, style: data.style }
        : { scenario: data.scenario, component_library: data.component_library },
  }
}
const STATE = {
  project: brief.project_name,
  generated_at: new Date().toISOString(),
  contexts,
}

const tpl = readFileSync(join(SHARED, 'dashboard-template.html'), 'utf8')
// 锚到代码行本身：模板的用法说明注释里也出现了这个占位符字面量，
// 非锚定的 replace 会命中注释而让真正的 const STATE 留在 null（面板显示 0/28 且不报错）。
const ANCHOR = 'const STATE = /*__SPARK_STATE_INJECT__*/null'
const injected = tpl.includes(ANCHOR)
  ? tpl.replace(ANCHOR, `const STATE = /*__SPARK_STATE_INJECT__*/${JSON.stringify(STATE)}`)
  : tpl.replace(/\/\*__SPARK_STATE_INJECT__\*\/null/, `/*__SPARK_STATE_INJECT__*/${JSON.stringify(STATE)}`)
if (injected === tpl) console.log('⚠️ 模板占位符未命中，面板未更新')
else {
  writeFileSync(join(ROOT, 'spark-output/dashboard.html'), injected)
  console.log(`✅ spark-output/dashboard.html · 进度 ${Object.keys(contexts).length}/28（${Object.keys(contexts).join(' + ')}）`)
}
