// ============================================================
// FLOW 5 of 7: Entitlement Formulas & Retention（权益公式与僵尸清理）
// Scenario ref: SaaS Management · Flow 4（资源配置）
//   核心约束：每个 Section 独立保存，绝不「全部字段同时编辑 + 统一提交」
//   预览必须真实重算，且不允许用动态求值去算（见 shared/formula.ts）
// Screens: 4 — 公式编辑器 / 校验失败态 / 策略与预演 / 执行与孤儿清理
// ============================================================

import { useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Progress,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Tooltip,
  TypographyMuted,
  toast,
} from 'sparkdesign'
import { Check, Database, Gauge, HardDrive, Hash, Info, Percent, RefreshCw, ShieldAlert, SlidersHorizontal, Timer, Trash, TriangleAlert, WandSparkles } from 'lucide-react'
import { ENTITLEMENT_LABEL } from '../shared/mock-data'
import { ApiError } from '../../data/api'
import { useResource } from '../../data/hooks'
import {
  cleanOrphans,
  fetchOrphans,
  orphanLabel,
  previewRetention,
  runRetention,
  saveLevels,
  saveRetention,
  type LevelsDto,
  type RetentionDto,
  type RetentionPreviewDto,
} from '../../data/admin'
import { computeFormula, sameValues } from '../shared/formula'
import { ResponsiveTable } from '../shared/responsive-table'
import { fmtNum, t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type {
  EntitlementDim,
  EntitlementDimState,
  OrphanTableCount,
  PurgeSample,
  RetentionPolicy,
  RetentionPreview,
} from '../shared/types'

const DIM_ORDER: EntitlementDim[] = ['message', 'geo', 'retentionMonths']
const DIM_ICON: Record<EntitlementDim, typeof Hash> = {
  message: Hash,
  geo: Gauge,
  retentionMonths: Timer,
}
const PREVIEW_LEVELS = 20

const SOURCE_LABEL: Record<EntitlementDimState['source'], { zh: string; en: string; tone: 'slate' | 'info' | 'warning' }> = {
  formula: { zh: '后台公式', en: 'formula', tone: 'info' },
  default: { zh: '内置默认', en: 'default', tone: 'slate' },
  env: { zh: '环境变量覆盖', en: 'env override', tone: 'warning' },
}

// ————————————————— 单个维度的公式面板 —————————————————

function FormulaPanel({
  dim,
  state,
  lang,
  dirtyValue,
  onDirty,
  onSave,
}: {
  dim: EntitlementDim
  state: EntitlementDimState
  lang: Lang
  /** 由上层持有的草稿，保证切 Tab 不丢未保存内容 */
  dirtyValue: string
  onDirty: (v: string) => void
  onSave: (formula: string, values: number[]) => void
}) {
  const meta = ENTITLEMENT_LABEL[dim]
  const Icon = DIM_ICON[dim]
  const result = useMemo(() => computeFormula(dirtyValue, PREVIEW_LEVELS), [dirtyValue])
  const dirty = dirtyValue !== state.formula
  const valid = result.ok
  const src = SOURCE_LABEL[state.source]

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon className="size-4" />
            {meta.title}
          </div>
          <TypographyMuted className="text-xs">{meta.hint}</TypographyMuted>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip
            content={
              lang === 'zh'
                ? '来源为「环境变量覆盖」时，这里的保存会被 env 值盖住，需在部署侧删除对应变量'
                : 'While an env override exists, saving here has no visible effect until the variable is removed'
            }
          >
            <Tag color={src.tone} appearance="outline">
              {lang === 'zh' ? src.zh : src.en}
            </Tag>
          </Tooltip>
          {dirty && valid && (
            <Tag color="warning" appearance="outline">
              {lang === 'zh' ? '未保存' : 'unsaved'}
            </Tag>
          )}
        </div>
      </div>

      {/* STATE: default — 草稿等于已存值，保存禁用 */}
      {/* STATE: filled — 草稿合法且有变化，预览实时重算，保存可用 */}
      {/* STATE: submitting — 不适用，保存是单表单字段的一次写 */}
      {/* STATE: error — 语法非法：行级 inline 报错、保存禁用、预览沿用上一次合法值 */}
      <Field orientation="vertical">
        <FieldLabel htmlFor={`formula-${dim}`}>
          {lang === 'zh' ? '表达式（' : 'Expression ('}
          <code className="font-mono">x</code>
          {lang === 'zh' ? ' = 等级）' : ' = level)'}
        </FieldLabel>
        <Input
          id={`formula-${dim}`}
          value={dirtyValue}
          onChange={(e) => onDirty(e.target.value)}
          className="font-mono"
          spellCheck={false}
        />
        <FieldDescription>
          {lang === 'zh'
            ? '支持 + - * / % ^ 括号，以及 min / max / floor / ceil / round / abs / sqrt / pow；结果向下取整并钳到 0。'
            : 'Supports + - * / % ^, parentheses, and min / max / floor / ceil / round / abs / sqrt / pow; floored and clamped at 0.'}
        </FieldDescription>
        {!valid && <FieldError errors={[{ message: result.error }]} />}
        {valid && dirty && (
          <TypographyMuted className="text-xs text-success">
            <Check className="me-1 inline-block size-3" />
            {lang === 'zh'
              ? `语法有效 · Lv ${PREVIEW_LEVELS} → ${result.values.at(-1)} ${meta.unit}`
              : `Valid · Lv ${PREVIEW_LEVELS} → ${result.values.at(-1)} ${meta.unit}`}
          </TypographyMuted>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="md"
          disabled={!valid || !dirty}
          onClick={() => {
            if (!result.ok) return
            onSave(dirtyValue, result.values)
            /* → 保存立即生效，无需重启；写入审计 admin_set_formula */
          }}
        >
          {lang === 'zh' ? `保存${meta.title}` : `Save ${dim}`}
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={dirtyValue === 'x'}
          onClick={() => onDirty('x')}
        >
          <RefreshCw className="size-4" />
          {lang === 'zh' ? '恢复为 x' : 'Reset to x'}
        </Button>
      </div>
    </section>
  )
}

// ————————————————— 等级 → 额度 预览表 —————————————————

function PreviewTable({
  columns,
  activeDim,
  lang,
}: {
  columns: { dim: EntitlementDim; values: number[]; previewed: boolean }[]
  activeDim: EntitlementDim
  lang: Lang
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{t(lang, 'level')}</TableHead>
            {columns.map((c) => (
              <TableHead key={c.dim} className={c.dim === activeDim ? 'bg-bg-elevated' : undefined}>
                <span className="flex items-center gap-1">
                  {ENTITLEMENT_LABEL[c.dim].title}
                  {c.previewed && (
                    <Tag color="warning" appearance="outline">
                      {lang === 'zh' ? '预览' : 'preview'}
                    </Tag>
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: PREVIEW_LEVELS }, (_, i) => (
            <TableRow key={i}>
              <TableCell className="tabular-nums text-text-secondary">Lv {i + 1}</TableCell>
              {columns.map((c) => (
                <TableCell key={c.dim} className={`tabular-nums ${c.dim === activeDim ? 'bg-bg-elevated' : ''}`}>
                  {c.values[i]}
                  <span className="ms-1 text-xs text-text-tertiary">{ENTITLEMENT_LABEL[c.dim].unit}</span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ================================================
   FLOW: Entitlement Formulas & Retention
   SCREEN 1 of 4: 权益公式编辑器
   ------------------------------------------------
   ENTRY:  Sidebar「运营 › 权益与清理」，落在「权益公式」分区
   EXIT:   单维度保存成功 → 本屏（预览转实值 + Toast + 审计留痕）
   BRANCH: 语法非法 → SCREEN 2
   ================================================ */
export function Screen1_FormulaEditor({
  dims,
  drafts,
  lang,
  activeDim,
  onActive,
  onDraft,
  onSave,
}: {
  dims: EntitlementDimState[]
  drafts: Record<EntitlementDim, string>
  lang: Lang
  activeDim: EntitlementDim
  onActive: (d: EntitlementDim) => void
  onDraft: (d: EntitlementDim, v: string) => void
  onSave: (d: EntitlementDim, formula: string, values: number[]) => void
}) {
  const columns = dims.map((d) => {
    const draft = drafts[d.dim]
    const res = draft === d.formula ? { ok: true as const, values: d.values } : computeFormula(draft, PREVIEW_LEVELS)
    return {
      dim: d.dim,
      values: res.ok ? res.values : d.values,
      previewed: res.ok && !sameValues(res.values, d.values),
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          {lang === 'zh' ? '等级权益公式' : 'Level entitlements'}
        </CardTitle>
        <CardDescription>
          {lang === 'zh'
            ? '三个维度各自独立保存 —— 改动互不牵连，出错时能明确定位是哪一条。'
            : 'Each dimension saves on its own, so a bad expression never blocks the other two.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Tabs value={activeDim} onValueChange={(v) => onActive(v as EntitlementDim)}>
          <TabsList variant="line">
            {DIM_ORDER.map((d) => (
              <TabsTrigger key={d} value={d}>
                {ENTITLEMENT_LABEL[d].title}
                {drafts[d] !== dims.find((x) => x.dim === d)?.formula && (
                  <span className="ms-1.5 size-1.5 rounded-full bg-warning" aria-hidden />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* → 切换维度 → 面板与预览表列高亮同步 */}
          {DIM_ORDER.map((d) => {
            const state = dims.find((x) => x.dim === d)
            if (!state) return null
            return (
              <TabsContent key={d} value={d} className="pt-4">
                <FormulaPanel
                  dim={d}
                  state={state}
                  lang={lang}
                  dirtyValue={drafts[d]}
                  onDirty={(v) => onDraft(d, v)}
                  onSave={(formula, values) => onSave(d, formula, values)}
                />
              </TabsContent>
            )
          })}
        </Tabs>

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{lang === 'zh' ? '生效后的额度对照' : 'Resulting entitlements'}</div>
            <TypographyMuted className="text-xs">
              {lang === 'zh' ? `Lv 1–${PREVIEW_LEVELS}` : `Lv 1–${PREVIEW_LEVELS}`}
            </TypographyMuted>
          </div>
          <PreviewTable columns={columns} activeDim={activeDim} lang={lang} />
        </div>
      </CardContent>
    </Card>
  )
}

/* ================================================
   FLOW: Entitlement Formulas & Retention
   SCREEN 2 of 4: 公式校验失败态
   ------------------------------------------------
   ENTRY:  SCREEN 1 的表达式语法非法时即时进入（不是提交后才报错）
   EXIT:   改回合法表达式 → SCREEN 1
   BRANCH: 此时保存按钮禁用，预览表停留在上一次合法值，线上配置不受影响
   ================================================ */
export function Screen2_FormulaInvalid({
  dims,
  drafts,
  lang,
  activeDim,
  onActive,
  onDraft,
  onSave,
}: {
  dims: EntitlementDimState[]
  drafts: Record<EntitlementDim, string>
  lang: Lang
  activeDim: EntitlementDim
  onActive: (d: EntitlementDim) => void
  onDraft: (d: EntitlementDim, v: string) => void
  onSave: (d: EntitlementDim, formula: string, values: number[]) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-error">
          <TriangleAlert className="size-4" />
          {lang === 'zh' ? '公式语法有误' : 'Formula syntax error'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="warning">
          <AlertTitle>{lang === 'zh' ? '线上配置未被影响' : 'Live configuration untouched'}</AlertTitle>
          <AlertDescription>
            {lang === 'zh'
              ? '非法表达式只会禁用当前这条的保存，预览表继续显示上一次合法值。其余两个维度不受牵连，可以照常保存。'
              : 'An invalid expression only disables this dimension’s Save; the preview keeps the last good values and the other two remain saveable.'}
          </AlertDescription>
        </Alert>
        <Screen1_FormulaEditor
          dims={dims}
          drafts={drafts}
          lang={lang}
          activeDim={activeDim}
          onActive={onActive}
          onDraft={onDraft}
          onSave={onSave}
        />
      </CardContent>
    </Card>
  )
}

// ————————————————— 屏 3：清理策略与预演 —————————————————

const REASON_LABEL: Record<PurgeSample['reason'], { zh: string; en: string; tone: 'warning' | 'error' }> = {
  never: { zh: '从未注册消息', en: 'never registered', tone: 'warning' },
  dormant: { zh: '长期沉寂', en: 'dormant', tone: 'error' },
}

function DaysField({
  id,
  label,
  hint,
  value,
  lang,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number
  lang: Lang
  onChange: (n: number) => void
}) {
  return (
    <Field orientation="vertical">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={String(value)}
          onChange={(e) => onChange(Math.max(0, Math.min(36500, Number(e.target.value.replace(/\D/g, '')) || 0)))}
          inputMode="numeric"
          size="sm"
          className="w-24 text-center tabular-nums"
        />
        <TypographyMuted className="text-xs">{lang === 'zh' ? '天 · 填 0 表示不清理' : 'days · 0 disables'}</TypographyMuted>
      </div>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  )
}

/* ================================================
   FLOW: Entitlement Formulas & Retention
   SCREEN 3 of 4: 清理策略 + 预演结果
   ------------------------------------------------
   ENTRY:  顶层 Tabs 切到「僵尸清理」
   EXIT:   「预演」→ 只统计不删，渲染命中卡与样例表 → 继续 SCREEN 4
   BRANCH: 保存策略与预演是两个独立动作；策略未保存时预演用当前草稿
           预演结果为 0 → 空态说明「没有命中」而不是「暂无数据」
   ================================================ */
export function Screen3_RetentionPreview({
  policy,
  preview,
  busy,
  lang,
  onChange,
  onSave,
  onPreview,
  dirty,
}: {
  policy: RetentionPolicy
  preview: RetentionPreview | null
  busy: boolean
  lang: Lang
  onChange: (next: RetentionPolicy) => void
  onSave: () => void
  onPreview: () => void
  dirty: boolean
}) {
  const [samplePage, setSamplePage] = useState(1)
  const samplePageSize = 5
  const totalSamplePages = Math.max(1, Math.ceil((preview?.samples.length ?? 0) / samplePageSize))
  const samples = preview?.samples.slice((samplePage - 1) * samplePageSize, samplePage * samplePageSize) ?? []

  const sampleColumns = [
    {
      key: 'wxId',
      header: t(lang, 'wxId'),
      cell: (r: PurgeSample) => <span className="font-mono text-sm">{r.wxId}</span>,
    },
    {
      key: 'reason',
      header: lang === 'zh' ? '命中原因' : 'Reason',
      cell: (r: PurgeSample) => (
        <Tag color={REASON_LABEL[r.reason].tone} appearance="outline">
          {lang === 'zh' ? REASON_LABEL[r.reason].zh : REASON_LABEL[r.reason].en}
        </Tag>
      ),
    },
    {
      key: 'createdAt',
      header: t(lang, 'registeredAt'),
      cell: (r: PurgeSample) => <span className="text-sm tabular-nums text-text-secondary">{r.createdAt.slice(0, 10)}</span>,
    },
    {
      key: 'lastRegAt',
      header: lang === 'zh' ? '最后注册消息' : 'Last registered',
      cell: (r: PurgeSample) => (
        <span className="text-sm tabular-nums text-text-secondary">{r.lastRegAt ? r.lastRegAt.slice(0, 10) : '—'}</span>
      ),
    },
    {
      key: 'messageCount',
      header: lang === 'zh' ? '当前消息' : 'Messages',
      cell: (r: PurgeSample) => <span className="text-sm tabular-nums">{r.messageCount}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="size-4" />
            {lang === 'zh' ? '僵尸用户清理策略' : 'Dormant account policy'}
          </CardTitle>
          <CardDescription>
            {lang === 'zh'
              ? '两类规则各自独立：注册后从未发过消息的，与注册过但长期沉寂的。'
              : 'Two independent rules: registered but never posted, and dormant since the last post.'}
          </CardDescription>
          <CardAction>
            {dirty && (
              <Tag color="warning" appearance="outline">
                {lang === 'zh' ? '未保存' : 'unsaved'}
              </Tag>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* STATE: default — 草稿等于已存值 */}
          {/* STATE: filled — 天数改动，保存可用 */}
          {/* STATE: submitting — 预演进行中，按钮 loading + 结果区骨架 */}
          {/* STATE: error — 不适用，0–36500 的输入已被钳位 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DaysField
              id="newUserDays"
              label={lang === 'zh' ? '从未注册消息的宽限天数' : 'Never-registered grace days'}
              hint={lang === 'zh' ? '注册后在该天数内一条消息都没注册过 → 命中' : 'Registered no message within this many days after signup'}
              value={policy.newUserDays}
              lang={lang}
              onChange={(n) => onChange({ ...policy, newUserDays: n })}
            />
            <DaysField
              id="dormantDays"
              label={lang === 'zh' ? '沉寂判定天数' : 'Dormancy threshold'}
              hint={lang === 'zh' ? '距最后一条注册消息超过该天数 → 命中' : 'No registered message for this many days'}
              value={policy.dormantDays}
              lang={lang}
              onChange={(n) => onChange({ ...policy, dormantDays: n })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" disabled={!dirty} onClick={onSave}>
              {lang === 'zh' ? '保存策略' : 'Save policy'}
            </Button>
            <Button variant="outline" size="md" loading={busy} onClick={onPreview}>
              <WandSparkles className="size-4" />
              {lang === 'zh' ? '预演（只统计不删）' : 'Preview (no delete)'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {busy && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {preview && !busy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4" />
              {lang === 'zh' ? '预演结果' : 'Preview result'}
            </CardTitle>
            <CardDescription>
              {lang === 'zh'
                ? `按当前草稿条件统计 · 全库 ${fmtNum(preview.total)} 个账号 · 未做任何删除`
                : `Computed from the draft thresholds · ${fmtNum(preview.total)} accounts scanned · nothing deleted`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: lang === 'zh' ? '命中待清理' : 'Purgeable', value: preview.purgeable, cls: 'text-error' },
                { label: lang === 'zh' ? '从未注册消息' : 'Never', value: preview.never, cls: 'text-warning' },
                { label: lang === 'zh' ? '长期沉寂' : 'Dormant', value: preview.dormant, cls: 'text-warning' },
                { label: lang === 'zh' ? '受豁免' : 'Protected', value: preview.protectedCount, cls: 'text-success' },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <TypographyMuted className="text-xs">{s.label}</TypographyMuted>
                  {/* 类名必须是字面量：拼出来的 text-${tone} 不在 Tailwind 扫描结果里，样式不会生成 */}
                  <span className={`text-xl font-semibold tabular-nums ${s.cls}`}>{fmtNum(s.value)}</span>
                  <Progress value={s.value} max={Math.max(preview.total, 1)} className="h-1" />
                </div>
              ))}
            </div>

            {preview.purgeable === 0 ? (
              <NoMatchesNote lang={lang} />
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <TypographyMuted className="text-xs">
                    {lang === 'zh' ? '命中样例' : 'Sample of hits'}
                    {preview.truncated && (
                      <Tooltip content={lang === 'zh' ? '命中量大，样例已截断，实际数以全量统计为准' : 'Sample truncated for volume; counts are exact'}>
                        <span className="ms-1 text-warning">
                          <Info className="inline-block size-3 align-[-2px]" />
                          {lang === 'zh' ? '样例已截断' : 'truncated'}
                        </span>
                      </Tooltip>
                    )}
                  </TypographyMuted>
                  <TypographyMuted className="text-xs tabular-nums">
                    {samplePage}/{totalSamplePages}
                  </TypographyMuted>
                </div>
                <ResponsiveTable columns={sampleColumns} data={samples} primary="wxId" compactHidden={["createdAt"]} metaKey="lastRegAt" />
                {totalSamplePages > 1 && (
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" disabled={samplePage === 1} onClick={() => setSamplePage((p) => p - 1)}>
                      {lang === 'zh' ? '上一页' : 'Prev'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={samplePage === totalSamplePages}
                      onClick={() => setSamplePage((p) => Math.min(totalSamplePages, p + 1))}
                    >
                      {lang === 'zh' ? '下一页' : 'Next'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** purgeable=0 的专门文案：说明"为什么是空的"，而不是笼统的暂无数据 */
function NoMatchesNote({ lang }: { lang: Lang }) {
  return (
    <Alert variant="success">
      <AlertDescription>
        {lang === 'zh'
          ? '当前条件没有命中任何账号。若预期有结果，多半是天数设得过小（把宽限期调大再试）。'
          : 'Nothing matches the current thresholds. If you expected hits, the day values are probably too small.'}
      </AlertDescription>
    </Alert>
  )
}

// ————————————————— 屏 4：立即执行与孤儿数据 —————————————————

/* ================================================
   FLOW: Entitlement Formulas & Retention
   SCREEN 4 of 4: 立即清理 + 孤儿排行榜
   ------------------------------------------------
   ENTRY:  SCREEN 3 预演完成后点「立即清理」
   EXIT:   执行完成 → 结果内联呈现 + 审计留痕 → 分区可继续操作
   BRANCH: 必须键入 PURGE 才解禁按钮；取消则回到 SCREEN 3 且什么都不删
           孤儿排行榜可单独检测 / 单独清理，与僵尸清理互不影响
   ================================================ */
export function Screen4_PurgeAndOrphans({
  preview,
  purging,
  purgeResult,
  orphans,
  orphanBusy,
  lang,
  onPurge,
  onCheckOrphans,
  onCleanOrphans,
}: {
  preview: RetentionPreview | null
  purging: boolean
  purgeResult: { deleted: number; skipped: number } | null
  orphans: OrphanTableCount[] | null
  orphanBusy: boolean
  lang: Lang
  onPurge: () => void
  onCheckOrphans: () => void
  onCleanOrphans: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const totalOrphan = orphans?.reduce((a, o) => a + o.orphanRows, 0) ?? 0

  const orphanColumns = [
    { key: 'label', header: lang === 'zh' ? '统计表' : 'Rollup table', cell: (r: OrphanTableCount) => <span className="text-sm">{r.label}</span> },
    {
      key: 'table',
      header: lang === 'zh' ? '库内表名' : 'Table',
      cell: (r: OrphanTableCount) => <span className="font-mono text-xs text-text-secondary">{r.table}</span>,
    },
    {
      key: 'orphanRows',
      header: lang === 'zh' ? '父记录已不存在的行' : 'Orphan rows',
      cell: (r: OrphanTableCount) => (
        <span className={`tabular-nums ${r.orphanRows > 0 ? 'text-error' : 'text-text-secondary'}`}>{fmtNum(r.orphanRows)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4" />
            {lang === 'zh' ? '立即执行一次清理' : 'Run cleanup now'}
          </CardTitle>
          <CardDescription>
            {lang === 'zh'
              ? '与每日定时任务走同一套逻辑；执行结果会写进审计日志 admin_run_retention。'
              : 'Same code path as the daily job; the run is audited as admin_run_retention.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!preview && (
            <Alert variant="info">
              <AlertDescription>
                {lang === 'zh' ? '请先在上方「预演」确认影响面，再执行删除。' : 'Run a preview first to see the blast radius.'}
              </AlertDescription>
            </Alert>
          )}

          {purgeResult && (
            <Alert variant="success">
              <AlertTitle>{lang === 'zh' ? '清理已完成' : 'Cleanup finished'}</AlertTitle>
              <AlertDescription>
                {lang === 'zh'
                  ? `已删除 ${fmtNum(purgeResult.deleted)} 个账号，跳过 ${fmtNum(purgeResult.skipped)} 个受豁免账号。审计已留痕。`
                  : `Removed ${fmtNum(purgeResult.deleted)} accounts, skipped ${fmtNum(purgeResult.skipped)} protected.`}
              </AlertDescription>
            </Alert>
          )}

          {preview && !purgeResult && (
            <AlertDialog onOpenChange={(v) => !v && setConfirm('')}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="md" disabled={preview.purgeable === 0}>
                  <Trash className="size-4" />
                  {lang === 'zh' ? `立即清理 ${fmtNum(preview.purgeable)} 个账号` : `Purge ${fmtNum(preview.purgeable)} accounts`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-error" />
                    {lang === 'zh' ? `确认删除 ${fmtNum(preview.purgeable)} 个账号？` : `Delete ${fmtNum(preview.purgeable)} accounts?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {lang === 'zh'
                      ? `其中「从未注册消息」${fmtNum(preview.never)} 个、「长期沉寂」${fmtNum(preview.dormant)} 个；另有 ${fmtNum(preview.protectedCount)} 个受豁免不会被碰。删除后这些账号的消息、已读记录与排行榜数据一并移除，不可恢复。`
                      : `${fmtNum(preview.never)} never-registered and ${fmtNum(preview.dormant)} dormant; ${fmtNum(preview.protectedCount)} protected accounts are skipped. Irreversible.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Field orientation="vertical">
                  <FieldLabel htmlFor="purge-confirm">
                    {lang === 'zh' ? '输入 PURGE 以确认' : 'Type PURGE to confirm'}
                  </FieldLabel>
                  <Input
                    id="purge-confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="PURGE"
                    className="font-mono"
                  />
                </Field>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirm('')}>{t(lang, 'cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={confirm !== 'PURGE'}
                    onClick={() => {
                      onPurge()
                      setConfirm('')
                      /* → 执行 → 结果内联呈现，写入审计 admin_run_retention */
                    }}
                  >
                    {lang === 'zh' ? '确认清理' : 'Purge now'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {purging && <Skeleton className="h-10 w-56" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" />
            {lang === 'zh' ? '孤儿排行榜数据' : 'Orphaned rollup rows'}
          </CardTitle>
          <CardDescription>
            {lang === 'zh'
              ? '历史遗留：外部删除用户时外键未级联，三张日统计表里留下了父账号已不存在的行。它们会虚增榜单计数。'
              : 'Historical artifact: rows in the three rollup tables whose parent user no longer exists, inflating leaderboard counts.'}
          </CardDescription>
          <CardAction>
            {orphans && (
              <Tag color={totalOrphan > 0 ? 'error' : 'success'} appearance="outline">
                {fmtNum(totalOrphan)}
              </Tag>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {orphans ? (
            <DataTable columns={orphanColumns} data={orphans} />
          ) : (
            <TypographyMuted className="text-xs">
              {lang === 'zh' ? '尚未检测。检测只读，不改动任何数据。' : 'Not checked yet. Checking is read-only.'}
            </TypographyMuted>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="md" loading={orphanBusy} onClick={onCheckOrphans}>
              {lang === 'zh' ? '检测孤儿行' : 'Check for orphans'}
            </Button>
            <AlertDialog
              onOpenChange={(v) => {
                if (!v) setConfirm('')
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="md" disabled={!orphans || totalOrphan === 0}>
                  <Trash className="size-4" />
                  {lang === 'zh' ? '清理孤儿行' : 'Clean orphans'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{lang === 'zh' ? `清理 ${fmtNum(totalOrphan)} 行孤儿数据？` : `Delete ${fmtNum(totalOrphan)} orphan rows?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {lang === 'zh'
                      ? '仅删除父账号已不存在的统计行，活数据不受影响。写审计 admin_cleanup_orphans。'
                      : 'Removes only rows whose parent user is gone. Audited as admin_cleanup_orphans.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t(lang, 'cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onCleanOrphans()
                      /* → 清理完成 → 计数归零 + Toast */
                    }}
                  >
                    {lang === 'zh' ? '确认清理' : 'Clean'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ————————————————— Flow 组合器 —————————————————

/** LevelsDto（按维度给 formula/source/values）→ 页面的维度数组。顺序固定，不按服务器返回的键序 */
const DIM_ORDER_LOCAL: EntitlementDim[] = ['message', 'geo', 'retentionMonths']

function toDims(dto: LevelsDto | null): EntitlementDimState[] {
  return DIM_ORDER_LOCAL.map((dim) => ({
    dim,
    formula: dto?.[dim]?.formula ?? '',
    source: (dto?.[dim]?.source ?? 'default') as EntitlementDimState['source'],
    values: dto?.[dim]?.values ?? [],
  }))
}

function toPreview(dto: RetentionPreviewDto | null): RetentionPreview | null {
  if (!dto) return null
  return {
    total: dto.total,
    purgeable: dto.purgeable,
    protectedCount: dto.protectedCount,
    never: dto.never,
    dormant: dto.dormant,
    truncated: dto.truncated,
    page: dto.page,
    pageSize: dto.pageSize,
    samples: dto.samples.map((s) => ({ ...s })),
  }
}

export function Flow5_AdminConfig({ lang = 'zh' }: { lang?: Lang }) {
  const levels = useResource<LevelsDto>('/admin/levels')
  const policyRes = useResource<RetentionDto>('/admin/retention')
  const dims = useMemo(() => toDims(levels.data), [levels.data])

  const [drafts, setDrafts] = useState<Record<EntitlementDim, string>>({ message: '', geo: '', retentionMonths: '' })
  /** 首次拿到配置时才把公式灌进草稿：之后用户的编辑不能被刷新覆盖 */
  const [seeded, setSeeded] = useState(false)
  if (levels.data && !seeded) {
    setSeeded(true)
    setDrafts({
      message: levels.data.message.formula,
      geo: levels.data.geo.formula,
      retentionMonths: levels.data.retentionMonths.formula,
    })
  }

  const [activeDim, setActiveDim] = useState<EntitlementDim>('message')
  const [section, setSection] = useState<'formula' | 'retention'>('formula')

  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [policyDraft, setPolicyDraft] = useState<RetentionPolicy>({ newUserDays: 0, dormantDays: 0 })
  if (policyRes.data && !policy) {
    const p = { newUserDays: policyRes.data.newUserDays, dormantDays: policyRes.data.dormantDays }
    setPolicy(p)
    setPolicyDraft(p)
  }

  const [preview, setPreview] = useState<RetentionPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [purging, setPurging] = useState(false)
  const [purgeResult, setPurgeResult] = useState<{ deleted: number; skipped: number } | null>(null)

  const [orphans, setOrphans] = useState<OrphanTableCount[] | null>(null)
  const [orphanBusy, setOrphanBusy] = useState(false)

  const fail = (e: unknown, prefix: string) => {
    const code = e instanceof ApiError ? e.code : String(e)
    toast.error(`${prefix}${code ? `（${code}）` : ''}`)
  }

  const saveFormula = async (dim: EntitlementDim, formula: string) => {
    try {
      // 服务器只吃公式；values 是它按公式算出来的 1–20 级结果，保存后重取而不是本地塞
      await saveLevels({ [dim]: formula } as Partial<LevelsDto>)
      levels.reload()
      toast.success(lang === 'zh' ? `已保存「${ENTITLEMENT_LABEL[dim].title}」，立即生效` : `Saved ${dim}`)
    } catch (e) {
      // 公式非法服务器回 400 且带中文原因，原样给出，别只说"保存失败"
      fail(e, lang === 'zh' ? '保存失败：' : 'Save failed: ')
    }
  }

  const runPreview = async () => {
    setPreviewing(true)
    setPurgeResult(null)
    try {
      setPreview(toPreview(await previewRetention()))
    } catch (e) {
      fail(e, lang === 'zh' ? '预演失败：' : 'Preview failed: ')
    } finally {
      setPreviewing(false)
    }
  }

  const savePolicy = async () => {
    try {
      const saved = await saveRetention(policyDraft)
      setPolicy({ newUserDays: saved.newUserDays, dormantDays: saved.dormantDays })
      setPreview(null) // 阈值变了，上一次预演的结论就不再对应新策略
      toast.success(lang === 'zh' ? '清理策略已保存并立即生效' : 'Policy saved')
      /* → 写入审计 admin_set_retention */
    } catch (e) {
      fail(e, lang === 'zh' ? '保存失败：' : 'Save failed: ')
    }
  }

  const runPurge = async () => {
    if (!preview) return
    setPurging(true)
    try {
      const r = await runRetention()
      setPurgeResult({ deleted: r.deleted, skipped: r.skipped })
      toast.success(lang === 'zh' ? `已清理 ${r.deleted} 个账号` : `Purged ${r.deleted} accounts`)
      setPreview(null)
      // 清理会删用户，排行榜与统计表随之变化
      levels.reload()
    } catch (e) {
      fail(e, lang === 'zh' ? '清理失败：' : 'Cleanup failed: ')
    } finally {
      setPurging(false)
    }
  }

  const checkOrphans = async () => {
    setOrphanBusy(true)
    try {
      const dto = await fetchOrphans()
      setOrphans(
        Object.entries(dto.orphans).map(([table, orphanRows]) => ({
          table,
          label: orphanLabel(table, lang),
          orphanRows,
        })),
      )
    } catch (e) {
      fail(e, lang === 'zh' ? '检查失败：' : 'Check failed: ')
    } finally {
      setOrphanBusy(false)
    }
  }

  const cleanOrphanRows = async () => {
    try {
      const r = await cleanOrphans()
      setOrphans((list) => (list ?? []).map((o) => ({ ...o, orphanRows: 0 })))
      toast.success(lang === 'zh' ? `已清理 ${fmtNum(r.total)} 行孤儿数据` : `Cleaned ${fmtNum(r.total)} rows`)
    } catch (e) {
      fail(e, lang === 'zh' ? '清理失败：' : 'Cleanup failed: ')
    }
  }

  const policyDirty =
    policy !== null && (policy.newUserDays !== policyDraft.newUserDays || policy.dormantDays !== policyDraft.dormantDays)

  /** 任一维度语法非法就整页切到 SCREEN 2：错误必须显眼，不能只在 Tab 里点个小红点 */
  const anyInvalid = DIM_ORDER.some((d) => !computeFormula(drafts[d], PREVIEW_LEVELS).ok)

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{t(lang, 'navEntitlement')}</h1>
        <TypographyMuted className="text-sm">
          {lang === 'zh' ? '改动即时生效，无需重启服务；每次写入都会留审计。' : 'Changes apply immediately and are audited.'}
        </TypographyMuted>
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as 'formula' | 'retention')}>
        <TabsList variant="line">
          <TabsTrigger value="formula">{lang === 'zh' ? '权益公式' : 'Entitlements'}</TabsTrigger>
          <TabsTrigger value="retention">{lang === 'zh' ? '僵尸清理' : 'Retention'}</TabsTrigger>
        </TabsList>
        {/* → 切换分区 → SCREEN 1/2 ⇄ SCREEN 3/4 */}
        <TabsContent value="formula" className="pt-4">
          {anyInvalid ? (
            <Screen2_FormulaInvalid
              dims={dims}
              drafts={drafts}
              lang={lang}
              activeDim={activeDim}
              onActive={setActiveDim}
              onDraft={(d, v) => setDrafts((prev) => ({ ...prev, [d]: v }))}
              onSave={saveFormula}
            />
          ) : (
            <Screen1_FormulaEditor
              dims={dims}
              drafts={drafts}
              lang={lang}
              activeDim={activeDim}
              onActive={setActiveDim}
              onDraft={(d, v) => setDrafts((prev) => ({ ...prev, [d]: v }))}
              onSave={saveFormula}
            />
          )}
        </TabsContent>
        <TabsContent value="retention" className="pt-4">
          <div className="flex flex-col gap-4">
            <Screen3_RetentionPreview
              policy={policyDraft}
              preview={preview}
              busy={previewing}
              lang={lang}
              dirty={policyDirty}
              onChange={setPolicyDraft}
              onSave={() => void savePolicy()}
              onPreview={() => void runPreview()}
            />
            <Screen4_PurgeAndOrphans
              preview={preview}
              purging={purging}
              purgeResult={purgeResult}
              orphans={orphans}
              orphanBusy={orphanBusy}
              lang={lang}
              onPurge={() => void runPurge()}
              onCheckOrphans={() => void checkOrphans()}
              onCleanOrphans={() => void cleanOrphanRows()}
            />
          </div>
        </TabsContent>
      </Tabs>

      <TypographyMuted className="text-xs">
        <Percent className="me-1 inline-block size-3" />
        {lang === 'zh'
          ? '说明：若部署侧设置了 MESSAGE_QUOTA_FORMULA 等环境变量，后台保存的值会被其覆盖 —— 此时上方来源标记会显示「环境变量覆盖」。'
          : 'Note: an env-level override such as MESSAGE_QUOTA_FORMULA wins over what you save here.'}
      </TypographyMuted>
    </div>
  )
}
