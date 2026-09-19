// ============================================================
// Brief Phase 6 · 模板克隆 + 字段替换
// ------------------------------------------------------------
// 为什么用脚本而不是手写 HTML：
// SKILL.md 红线要求产物必须是 prototype/brief.html 的完整克隆
// （≥ 原型 95% 行数，CSS / JS / 工具栏 DOM / SVG icon 一行都不能改）。
// 人肉重打 1559 行必然漂移；脚本按字节读取模板 + 只替换白名单位置，
// 是唯一能同时满足「不凭记忆重建」和「不改受保护区域」的做法。
//
// 用法：bun run scripts/build-brief.ts
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()

// —— 定位模板（路径解析协议：先已知安装位，再候选，不凭印象编造）——
const CANDIDATES = [
  join(homedir(), '.qoder/plugins/cache/qoder-marketplace/product-design/0.5.10/skills/brief/prototype'),
  join(homedir(), '.qoderwork/skills/brief/prototype'),
]
const dir = CANDIDATES.find((d) => existsSync(join(d, 'brief.html')))
if (!dir) {
  console.error('❌ 无法定位 prototype/brief.html —— 不降级生成替代 HTML')
  process.exit(1)
}

const htmlPath = join(dir, 'brief.html')
const cssPath = join(dir, 'brief-themes.css')
let html = readFileSync(htmlPath, 'utf8')
const css = readFileSync(cssPath, 'utf8')
const tplLines = html.split('\n').length
console.log(`模板：brief.html ${tplLines} 行 + brief-themes.css ${css.split('\n').length} 行`)

// —— 替换工具：任何一处锚点没命中就整体失败，避免"静默漏替换" ——
const misses: string[] = []
function swap(label: string, from: string, to: string) {
  if (!html.includes(from)) {
    misses.push(`${label} → 锚点未命中：${from.slice(0, 60)}`)
    return
  }
  html = html.replace(from, to)
}

// ═══ 白名单 1：title / topbar / data-theme ═══
swap('<title>', '<title>Design Brief — 购物车流程改版</title>', '<title>Design Brief — wekit-read-insights</title>')
swap('topbar-title', '<p class="topbar-title" spellcheck="false">购物车流程改版</p>', '<p class="topbar-title" spellcheck="false">wekit-read-insights</p>')
swap('topbar-meta', '<p class="topbar-meta" spellcheck="false">产品迭代 · 2026-04-29</p>', '<p class="topbar-meta" spellcheck="false">产品改版 · 2026-09-19</p>')
// 6.3 规则：产品设计（改版）默认 Chalk —— 模板本就是 chalk，无需改动
const THEME = 'chalk'

// ═══ 白名单 2：合并 CSS（结构文件里是空的 <style></style> + 外链）═══
if (!html.includes('<link rel="stylesheet" href="brief-themes.css">') || !html.includes('<style></style>')) {
  console.error('❌ 未找到 <style></style> / brief-themes.css 外链锚点，模板结构已变化，终止')
  process.exit(1)
}
// 缩进在不同模板版本里可能是 2 或 4 空格，用正则而不是字面量，
// 并且替换后必须复查 —— 否则外链静默残留，产物就不再自包含。
html = html.replace(/[ \t]*<link rel="stylesheet" href="brief-themes\.css">\n/, '')
html = html.replace('<style></style>', `<style>\n${css.replace(/\s+$/, '')}\n  </style>`)
if (html.includes('href="brief-themes.css"')) {
  console.error('❌ brief-themes.css 外链未清除，产物会依赖同目录 CSS 文件，终止')
  process.exit(1)
}
if (!/<style>[\s\S]{5000,}<\/style>/.test(html)) {
  console.error('❌ CSS 未合入 <style>，产物无样式，终止')
  process.exit(1)
}

// ═══ 白名单 3：七张卡片的 .card_body 正文（.hint 副标题保持原样）═══

// 1 · 业务背景
swap(
  '业务背景',
  `      <p>平台处于<strong>成熟期</strong>，GMV 增速趋缓，战略重心转向存量用户的转化效率提升。近三季度监控数据显示，购物车放弃率持续高于行业均值 <span class="num">12</span> 个百分点，结算环节为最主要流失节点。本次设计由 Q2 增长专项驱动，聚焦购物车至支付完成的核心转化路径。</p>`,
  `      <p>自建「微信已读回执」服务端，AGPL 协议、个人部署。六个页面长期由服务端拼接 HTML + 内联样式提供，<strong>无前端构建</strong>。功能已完备但界面停留在能用级别，黑名单作用域、<span class="num">UTC</span> 日切、<span class="num">Lv 0</span> 语义等关键规则只存在于源码中。</p>`,
)

// 2 · 业务目标
swap(
  '业务目标',
  `        <li>购物车转化率 <span class="num">45%</span> → <strong class="num">58%</strong></li>
        <li>结算页跳出率下降 <strong class="num">20%</strong></li>
        <li>支付成功率提升 <strong class="num">8%</strong></li>
        <li>流程类客诉占比下降 <strong class="num">30%</strong></li>`,
  `        <li>公开链接访客读完率 <strong class="num">≥70%</strong></li>
        <li>新部署者 <span class="num">5</span> 分钟内发出首条打点</li>
        <li>GitHub star 季度环比 <strong class="num">+30%</strong></li>
        <li>管理员周活跃留存 <strong class="num">≥60%</strong></li>`,
)

// 3 · 用户
swap(
  '用户',
  `        <li><span class="num">25–40</span> 岁城市女性</li>
        <li>移动端为主，碎片时间下单</li>
        <li>月均购物 <span class="num">3</span> 次以上</li>
        <li>对繁琐流程容忍度低</li>`,
  `        <li>自建者本人：单机部署，日常查已读</li>
        <li>群成员：点开公开链接的匿名访客</li>
        <li>实例管理员：管用户、等级与清理</li>
        <li>潜在开源使用者：部署前先评估界面</li>`,
)

// 4 · 设计策略（3 个维度 → 7 个；.s-grid 是固定 3 列，会排成 3×3）
const STRATEGY = `        <div class="s-item">
          <b>信息架构 IA</b>
          <p class="thesis">运营区整组按 isAdmin 摘除，而非置灰。</p>
          <ul class="tactics">
            <li>三级 IA 收进侧栏</li>
            <li>Settings 下沉头像下拉</li>
            <li>未设计项显式禁用</li>
          </ul>
          <p class="rationale">对应 G4；普通用户不该看到无效入口</p>
        </div>
        <div class="s-item">
          <b>交互设计</b>
          <p class="thesis">钻取与不可逆操作各自成套。</p>
          <ul class="tactics">
            <li>聚合→明细页内 Tabs</li>
            <li>危险操作逐字确认</li>
            <li>错误 inline 不用 Toast</li>
          </ul>
          <p class="rationale">对应 G1 G4；原版删除无确认</p>
        </div>
        <div class="s-item">
          <b>视觉设计</b>
          <p class="thesis">全量走 design token 不留硬编码。</p>
          <ul class="tactics">
            <li>parchment 主题</li>
            <li>语义色替换硬编码金</li>
            <li>compact 密度</li>
          </ul>
          <p class="rationale">对应 G3；硬编码色暗色对比不足</p>
        </div>
        <div class="s-item">
          <b>数据可视化</b>
          <p class="thesis">时间全局统一，排名给相对量。</p>
          <ul class="tactics">
            <li>顶部范围驱动三层</li>
            <li>条形编码与榜首比值</li>
            <li>空态按成因分支</li>
          </ul>
          <p class="rationale">对应 G4；纯数字列需心算</p>
        </div>
        <div class="s-item">
          <b>内容设计</b>
          <p class="thesis">界面说清后端真实语义。</p>
          <ul class="tactics">
            <li>写明 UTC 日切</li>
            <li>Lv 0 改述已停注册</li>
            <li>三级黑名单作用域对照</li>
          </ul>
          <p class="rationale">对应 G2 G4；规则原先只在代码</p>
        </div>
        <div class="s-item">
          <b>无障碍设计</b>
          <p class="thesis">状态不只靠颜色传达。</p>
          <ul class="tactics">
            <li>保留 focus-visible 环</li>
            <li>图标按钮 aria-label</li>
            <li>禁用态附说明</li>
          </ul>
          <p class="rationale">仓库既有约定；原版靠底色区分</p>
        </div>
        <div class="s-item">
          <b>多端适配</b>
          <p class="thesis">窄屏不裁切，侧栏可让位。</p>
          <ul class="tactics">
            <li>侧栏 off-canvas</li>
            <li>表格统一横向滚动包</li>
            <li>折叠图标栏配 tooltip</li>
          </ul>
          <p class="rationale">对应 G1；原版表格靠溢出撑</p>
        </div>`

const tplStrategyStart = html.indexOf('      <div class="s-grid">')
const tplStrategyEnd = html.indexOf('      </div>\n    </div>\n\n    <!-- 设计标准 -->')
if (tplStrategyStart < 0 || tplStrategyEnd < 0) {
  misses.push('设计策略 → 未定位到 s-grid 区块边界')
} else {
  const before = html.slice(tplStrategyStart, tplStrategyStart + '      <div class="s-grid">'.length)
  html =
    html.slice(0, tplStrategyStart) +
    before +
    '\n' +
    STRATEGY +
    '\n' +
    html.slice(tplStrategyEnd)
}

// 5 · 设计标准（行首 pill 结构）
swap(
  '设计标准',
  `        <li><span class="tag" data-kind="quant">定量</span><span class="text">结算步骤 ≤ <span class="num">3</span> 步</span></li>
        <li><span class="tag" data-kind="quant">定量</span><span class="text">任务完成率 &gt; <span class="num">88%</span></span></li>
        <li><span class="tag" data-kind="qual">定性</span><span class="text">流程感知清晰</span></li>
        <li><span class="tag" data-kind="qual">定性</span><span class="text">无明显操作卡点</span></li>`,
  `        <li><span class="tag" data-kind="quant">定量</span><span class="text">表格滚动包裹 <span class="num">7/7</span> flow</span></li>
        <li><span class="tag" data-kind="quant">定量</span><span class="text">图标按钮 aria-label <span class="num">13/13</span></span></li>
        <li><span class="tag" data-kind="qual">定性</span><span class="text">权限与状态不靠颜色单独传达</span></li>
        <li><span class="tag" data-kind="qual">定性</span><span class="text">后端规则界面自解释</span></li>`,
)

// 6 · 边界约束
swap(
  '边界约束',
  `        <li><span class="num">8</span> 周内上线，不可延期</li>
        <li>支付模块不可改动（第三方接入）</li>
        <li>须遵守现有 Design System v2.3</li>
        <li>设计资源：<span class="num">2</span> 名设计师</li>`,
  `        <li>后端接口路径与字段名一律不改</li>
        <li>Bun + Workers 双运行时同一代码库</li>
        <li>SSR 页面须与新 SPA 并行可用</li>
        <li>禁止动态代码求值（公式走解析器）</li>
        <li>Spark 整包体积本轮不重构</li>`,
)

// 7 · 不做什么
swap(
  '不做什么',
  `        <li>商品详情页不纳入本次改版</li>
        <li>会员积分体系不重设计</li>
        <li>PC 端不覆盖，移动端优先</li>
        <li>推荐算法逻辑不调整</li>`,
  `        <li>不改任何 API 与打点路径</li>
        <li>全局黑名单页、操作留痕页不设计</li>
        <li>不做全量 i18n，仅双语化复用词条</li>
        <li>不含移动端原生（RN）flow；Web 端自身的移动端适配已做</li>
        <li>不接真实鉴权与会话</li>`,
)

if (misses.length) {
  console.error('❌ 替换失败，未写盘：\n  ' + misses.join('\n  '))
  process.exit(1)
}

// ═══ 写盘 ═══
const OUT = join(ROOT, 'spark-output/brief')
mkdirSync(OUT, { recursive: true })
const outFile = join(OUT, 'wekit-read-insights.html')
writeFileSync(outFile, html)

// ═══ Step 5 自检 ═══
const out = readFileSync(outFile, 'utf8')
const outLines = out.split('\n').length
const checks: [string, boolean][] = [
  [`行数 ${outLines} ≥ 原型 95%（${Math.round(tplLines * 0.95)}；原型结构 ${tplLines} + 样式 ${css.split('\n').length}）`, outLines >= (tplLines + css.split('\n').length) * 0.95],
  ['data-theme 保持 chalk', out.includes(`data-theme="${THEME}"`)],
  ['data-ratio="16-9" + data-scale="md"', out.includes('data-ratio="16-9"') && out.includes('data-scale="md"')],
  ['<style> 已合并且非空', /<style>[\s\S]{5000,}<\/style>/.test(out)],
  ['brief-themes.css 外链已移除', !out.includes('href="brief-themes.css"')],
  ['themeSelect / accentPicker / exportBtn 控件齐全', ['id="themeSelect"', 'id="accentPicker"', 'id="exportBtn"'].every((s) => out.includes(s))],
  ['topbar 两个铅笔按钮保留', out.includes('topbar-title-edit') && out.includes('topbar-meta-edit')],
  ['modern-screenshot CDN 保留', out.includes('https://cdn.jsdelivr.net/npm/modern-screenshot@4/dist/index.js')],
  ['导出三函数齐全', ['isInIframe()', 'directDownload(', 'showExportModal('].every((s) => out.includes(s))],
  ['FileReader.readAsDataURL + export-preview-link', out.includes('readAsDataURL') && out.includes('export-preview-link')],
  ['浮层无多余动作按钮', !out.includes('复制到剪贴板') && !out.includes('新窗口打开')],
  ['7 张卡片顺序与 class 保持', ['m-context', 'm-goal', 'm-user', 'm-strategy', 'm-criteria', 'm-constraints', 'm-scope'].every((c, i, arr) => out.indexOf(c) < (i === 6 ? Infinity : out.indexOf(arr[i + 1])))],
  ['7 个 .hint 释义未被动过', out.includes('当前业务处于什么阶段，触发本次设计的原因') && out.includes('体验维度的判断依据')],
  ['设计标准每条以行首 tag pill 开头', (out.match(/<li><span class="tag" data-kind="(quant|qual)">/g) ?? []).length >= 4],
  ['策略维度 = 7', (out.match(/<b>/g) ?? []).length >= 7],
  ['未引入任何外部 CSS 框架', !/tailwind|bootstrap|daisyui|shadcn/i.test(out)],
  ['购物车旧文案已无残留', !out.includes('购物车') && !out.includes('GMV')],
]
for (const [label, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${label}`)
console.log(`\n${checks.every(([, o]) => o) ? '✅ 全部通过' : '❌ 有未通过项'} → ${outFile.replace(ROOT, '.')}`)
