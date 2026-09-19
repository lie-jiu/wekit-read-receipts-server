// ============================================================
// FLOW 1 of 7: Sign in & Enter（登录与进入）
// Scenario ref: SaaS Management · Minimal 外壳（无 Sidebar）
// Screens: 3 — Sign in / Create account / First-run 接入引导
// ============================================================

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperSeparator,
  StepperTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  TypographyMuted,
  TypographyP,
  toast,
} from 'sparkdesign'
import type { Appearance } from 'sparkdesign'
import { Check, Clock3, Eye, EyeOff, MapPin, Moon, Sun, UserRound } from 'lucide-react'
import { t } from '../shared/i18n'
import type { Lang } from '../shared/i18n'
import type { AsyncState, AuthError, AuthStatus, Screen, Session } from '../shared/types'
import { fetchAuthStatus, fetchMe, registerAccount, toAuthError, verifyCredentials } from '../../data/session'

// ————————————————— 真实校验规则（照搬 src/routes/auth.ts）—————————————————

/** wxId：1–64 个可打印 ASCII */
const WXID_RE = /^[\x20-\x7E]{1,64}$/
/**
 * 接入示例里要写的服务器地址。以前是硬编码的占位域名，接了真接口后必须取当前来源：
 * 用户把这段贴进配置时，抄到的就是他正在用的这台服务器。
 */
function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function validateWxId(v: string): string | undefined {
  if (!v) return '请填写微信 ID'
  if (!WXID_RE.test(v)) return '1–64 个可打印字符，不能包含空白或控制字符'
  return undefined
}

function validatePassword(v: string): string | undefined {
  if (!v) return '请填写密码'
  if (v.length < 8) return '密码至少 8 位'
  if (v.length > 128) return '密码最多 128 位'
  return undefined
}

/** 服务端错误 → 文案。限流单独渲染，因为要显示倒计时 */
function authErrorCopy(e: AuthError): { title: string; body: string } | null {
  switch (e.kind) {
    case 'invalid_credentials':
      return { title: '登录失败', body: '微信 ID 或密码不正确。连续失败时服务端会故意延迟 250–750ms 以抵御爆破。' }
    case 'invite_required':
      return { title: '需要邀请码', body: '本站已开启注册邀请码，请填写管理员发给你的邀请码。' }
    case 'wxid_taken':
      return { title: '该微信 ID 已注册', body: '请直接登录，或换一个 ID。' }
    case 'network':
      return { title: '无法连接服务器', body: '请检查网络或本站是否在运行，然后重试。' }
    case 'unknown':
      // 不翻译、不猜：把服务器给的状态码和原始文案摊开，用户截图来问就能一眼对上
      return { title: `服务器返回了未预期的响应（${e.status}）`, body: e.code || '请稍后重试。' }
    case 'rate_limited':
      return null
  }
}

// ————————————————— 受控 / 非受控混合的外观与语言 —————————————————

export interface ChromeProps {
  /** 省略时组件自持状态，便于在屏选择器里单屏预览 */
  lang?: Lang
  appearance?: Appearance
  onLangChange?: (lang: Lang) => void
  onAppearanceChange?: (appearance: Appearance) => void
}

function useChrome(props: ChromeProps) {
  const [innerLang, setInnerLang] = useState<Lang>('zh')
  const [innerAppearance, setInnerAppearance] = useState<Appearance>('light')
  const lang = props.lang ?? innerLang
  const appearance = props.appearance ?? innerAppearance
  // 显式包一层，避免 props 回调与 setState 组成联合函数类型后无法直接调用
  const setLang = (next: Lang) => (props.onLangChange ? props.onLangChange(next) : setInnerLang(next))
  const setAppearance = (next: Appearance) =>
    props.onAppearanceChange ? props.onAppearanceChange(next) : setInnerAppearance(next)
  return { lang, appearance, setLang, setAppearance }
}

// ————————————————— Minimal 外壳：左品牌区 + 右表单区 —————————————————

function AuthShell({
  children,
  chrome,
  caption,
}: {
  children: ReactNode;
  chrome: ReturnType<typeof useChrome>
  /** 左栏底部那行小字：接真接口后必须是"未登录也能确知的事实"，不能再放演示数据 */
  caption?: string
}) {
  const { lang, appearance, setLang, setAppearance } = chrome
  const dark = appearance === 'dark'

  return (
    <div className="min-h-screen bg-bg-base text-text">
      {/* 响应式：>lg 三栏（品牌 2 + 表单 1）；sm–lg 单栏大留白；<sm 单栏紧凑、品牌降为顶部条 */}
      <div className="lg:grid lg:grid-cols-3 lg:min-h-screen">
        <aside className="hidden lg:flex lg:col-span-2 lg:flex-col lg:justify-between gap-10 p-10 xl:p-14 bg-bg-layout border-r border-border-tertiary">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md bg-primary text-text-on-primary font-semibold">
                R
              </span>
              <span className="text-lg font-semibold">{t(lang, 'brand')}</span>
            </div>
            <TypographyP className="text-text-secondary max-w-md">{t(lang, 'tagline')}</TypographyP>
          </div>

          <div className="flex flex-col gap-1 max-w-md">
            <Item>
              <ItemMedia variant="icon">
                <UserRound className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>谁读了</ItemTitle>
                <ItemDescription>按独立 IP 去重计数，黑名单命中的访问不计入也不返回</ItemDescription>
              </ItemContent>
            </Item>
            <Item>
              <ItemMedia variant="icon">
                <MapPin className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>在什么网络读的</ItemTitle>
                <ItemDescription>中英双语 IP 归属地，多源并发、逐级降级</ItemDescription>
              </ItemContent>
            </Item>
            <Item>
              <ItemMedia variant="icon">
                <Clock3 className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>隔多久读的</ItemTitle>
                <ItemDescription>每条消息的首次被读耗时与 24 小时到达分布</ItemDescription>
              </ItemContent>
            </Item>
          </div>

          {caption && <TypographyMuted className="text-sm">{caption}</TypographyMuted>}
        </aside>

        <main className="flex flex-col p-5 sm:p-10">
          <header className="flex items-center justify-end gap-2 pb-6 sm:pb-10">
            <ToggleGroup
              type="single"
              value={lang}
              onValueChange={(v) => v && setLang(v as Lang)}
              spacing="none"
              aria-label="界面语言"
            >
              <ToggleGroupItem value="zh">中</ToggleGroupItem>
              <ToggleGroupItem value="en">EN</ToggleGroupItem>
            </ToggleGroup>
            <IconButton
              icon={dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              variant="ghost"
              size="sm"
              aria-label={dark ? '切换到浅色' : '切换到深色'}
              onClick={() => setAppearance(dark ? 'light' : 'dark')}
            />
          </header>

          {/* 移动端品牌条（lg 以下替代 aside） */}
          <div className="flex flex-col gap-1 pb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-primary text-text-on-primary text-sm font-semibold">
                R
              </span>
              <span className="font-semibold">{t(lang, 'brand')}</span>
            </div>
            <TypographyMuted className="text-sm">{t(lang, 'tagline')}</TypographyMuted>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-sm">{children}</div>
          </div>

          <footer className="pt-8">
            <TypographyMuted className="text-xs">
              会话有效期 30 天 · 密码以 PBKDF2-HMAC-SHA256 加盐存储 · 本站开源（AGPL-3.0），可自托管
            </TypographyMuted>
          </footer>
        </main>
      </div>
    </div>
  )
}

// ————————————————— 共享的认证表单字段 —————————————————

function CredentialFields({
  lang,
  wxId,
  password,
  wxIdError,
  passwordError,
  disabled,
  showPassword,
  onTogglePassword,
  onWxIdChange,
  onPasswordChange,
}: {
  lang: Lang
  wxId: string
  password: string
  wxIdError?: string
  passwordError?: string
  disabled: boolean
  showPassword: boolean
  onTogglePassword: () => void
  onWxIdChange: (v: string) => void
  onPasswordChange: (v: string) => void
}) {
  return (
    <>
      <Field orientation="vertical">
        <FieldLabel htmlFor="wxId">{t(lang, 'wxId')}</FieldLabel>
        <Input
          id="wxId"
          value={wxId}
          onChange={(e) => onWxIdChange(e.target.value)}
          placeholder="wxid_xxxxxxxx"
          autoComplete="username"
          disabled={disabled}
          size="lg"
        />
        <FieldError errors={wxIdError ? [{ message: wxIdError }] : undefined} />
      </Field>

      <Field orientation="vertical">
        <FieldLabel htmlFor="password">{t(lang, 'password')}</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={lang === 'zh' ? '至少 8 位' : 'At least 8 characters'}
            autoComplete="current-password"
            disabled={disabled}
          />
          <InputGroupAddon align="inline-end">
            <IconButton
              icon={showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              variant="ghost"
              size="sm"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              onClick={onTogglePassword}
            />
          </InputGroupAddon>
        </InputGroup>
        <FieldError errors={passwordError ? [{ message: passwordError }] : undefined} />
      </Field>
    </>
  )
}

function AuthAlert({ error, cooldown }: { error: AuthError | null; cooldown: number }) {
  if (!error) return null

  if (error.kind === 'rate_limited') {
    return (
      <Alert variant="warning">
        <AlertTitle>尝试过于频繁</AlertTitle>
        <AlertDescription>
          认证端点限流 5 次/分 · IP。请在 {cooldown} 秒后重试，或稍后再来。
        </AlertDescription>
      </Alert>
    )
  }

  const copy = authErrorCopy(error)
  if (!copy) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.body}</AlertDescription>
    </Alert>
  )
}

/* ================================================
   FLOW: Sign in & Enter
   SCREEN 1 of 3: Sign in
   ------------------------------------------------
   ENTRY:  未认证访问任一受保护页 → 重定向到 /login
   EXIT:   "登录" 校验通过 → 写入 30 天会话 → 进入 App Shell（退出 flow）
   BRANCH: "注册" Tab → SCREEN 2
           凭证错 / 网络错 / 429 → 本屏 SCREEN 1（inline Alert，保留已填内容）
   ================================================ */
export function Screen1_SignIn({
  lang = 'zh',
  state = 'idle',
  error = null,
  cooldown = 0,
  onSubmit,
}: {
  lang?: Lang
  state?: AsyncState
  error?: AuthError | null
  cooldown?: number
  onSubmit?: (values: { wxId: string; password: string }) => void
}) {
  const [wxId, setWxId] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const wxIdError = touched ? validateWxId(wxId) : undefined
  const passwordError = touched ? validatePassword(password) : undefined
  const busy = state === 'submitting'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(lang, 'signIn')}</CardTitle>
        <CardDescription>使用注册时的微信 ID 与密码登录</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* STATE: default — 两字段为空，提交仍可点但会触发校验 */}
        {/* STATE: submitting — 按钮 loading，字段 disabled */}
        {/* STATE: error — 字段级 inline 错误 + 顶部 Alert，已填内容不清空 */}
        <AuthAlert error={error} cooldown={cooldown} />
        <CredentialFields
          lang={lang}
          wxId={wxId}
          password={password}
          wxIdError={wxIdError}
          passwordError={passwordError}
          disabled={busy}
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
          onWxIdChange={setWxId}
          onPasswordChange={setPassword}
        />
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          onClick={() => {
            setTouched(true)
            if (validateWxId(wxId) || validatePassword(password)) return
            onSubmit?.({ wxId, password })
            /* → 校验通过 → 写入会话 → 进入 App Shell「总览」（退出 flow） */
          }}
        >
          {t(lang, 'signIn')}
        </Button>
        <TypographyMuted className="text-center text-xs">
          {lang === 'zh' ? '还没有账号？切到上方「注册」标签' : 'No account yet? Use the tab above.'}
          {/* → 点击 Tabs 上的「注册」→ SCREEN 2: Create account */}
        </TypographyMuted>
      </CardFooter>
    </Card>
  )
}

// → 用户把 wxId 填成 locked_demo → SCREEN 1 的 rate_limited 分支（倒计时）

/* ================================================
   FLOW: Sign in & Enter
   SCREEN 2 of 3: Create account
   ------------------------------------------------
   ENTRY:  SCREEN 1 的 Tabs 上点击「注册」
   EXIT:   "注册" 成功 → 新用户 level 1 + 立即建立会话 → SCREEN 3
   BRANCH: invite_required 且未填邀请码 → 本屏（invite_required 错误）
           wxId 已存在 → 本屏（wxid_taken，字段级错误）
   ================================================ */
export function Screen2_Register({
  lang = 'zh',
  inviteRequired = true,
  state = 'idle',
  error = null,
  cooldown = 0,
  onSubmit,
}: {
  lang?: Lang
  inviteRequired?: boolean
  state?: AsyncState
  error?: AuthError | null
  cooldown?: number
  onSubmit?: (values: { wxId: string; password: string; invite: string }) => void
}) {
  const [wxId, setWxId] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [touched, setTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const wxIdError = touched ? validateWxId(wxId) : undefined
  const passwordError = touched ? validatePassword(password) : undefined
  const inviteError = touched && inviteRequired && !invite ? '本站注册需要邀请码' : undefined
  const busy = state === 'submitting'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(lang, 'register')}</CardTitle>
        <CardDescription>注册后初始等级为 Lv 1，可注册消息额度随之生效</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* STATE: default — 三字段为空 */}
        {/* STATE: filled — 校验通过，提交可用 */}
        {/* STATE: submitting — 按钮 loading */}
        {/* STATE: error — 邀请码缺失 / ID 重复时字段级提示 */}
        <AuthAlert error={error} cooldown={cooldown} />
        <CredentialFields
          lang={lang}
          wxId={wxId}
          password={password}
          wxIdError={wxIdError}
          passwordError={passwordError}
          disabled={busy}
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
          onWxIdChange={setWxId}
          onPasswordChange={setPassword}
        />
        {inviteRequired && (
          <Field orientation="vertical">
            <FieldLabel htmlFor="invite">{t(lang, 'inviteCode')}</FieldLabel>
            <Input
              id="invite"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="管理员发放"
              disabled={busy}
            />
            <FieldDescription>仅在部署方设置了 INVITE_CODE 时出现</FieldDescription>
            <FieldError errors={inviteError ? [{ message: inviteError }] : undefined} />
          </Field>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch">
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          onClick={() => {
            setTouched(true)
            if (validateWxId(wxId) || validatePassword(password)) return
            if (inviteRequired && !invite) return
            onSubmit?.({ wxId, password, invite })
            /* → 注册成功（自动建立会话）→ SCREEN 3: First-run 接入引导 */
          }}
        >
          {t(lang, 'register')}
        </Button>
      </CardFooter>
    </Card>
  )
}

// → 注册成功 → SCREEN 3: First-run 接入引导

/* ================================================
   FLOW: Sign in & Enter
   SCREEN 3 of 3: First-run 接入引导
   ------------------------------------------------
   ENTRY:  SCREEN 2 注册成功（新用户，消息表为空）
   EXIT:   "进入控制台" → App Shell「总览」（退出 flow）
   BRANCH: 已有消息的老用户跳过本屏
   ================================================ */
export function Screen3_FirstRun({
  onEnter,
}: {
  onEnter?: () => void
}) {
  const pixelUrl = `${origin()}/pixel?id=${'0'.repeat(64)}&wxId=wxid_xxxxxxxx`
  const registerCurl = `curl -X POST ${origin()}/register -H 'content-type: application/json' -d '{"wxId":"wxid_xxxxxxxx","content":"…","createTime":"2026-09-18 20:00:00"}'`

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    toast.success('已复制到剪贴板')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>账号已就绪 · 还差一步</CardTitle>
        <CardDescription>
          现在消息列表是空的，因为还没有消息被注册。打点由客户端自动完成，你不需要手写请求。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* STATE: default — 三步引导 */}
        {/* STATE: 已完成 — 用户已有消息，本屏不再出现 */}
        <Stepper orientation="vertical">
          <StepperItem status="complete">
            <StepperIndicator>
              <Check className="size-3.5" />
            </StepperIndicator>
            <StepperContent>
              <StepperTitle>注册账号</StepperTitle>
              <StepperDescription>初始 Lv 1 · 会话已建立，30 天内免登录</StepperDescription>
            </StepperContent>
          </StepperItem>
          <StepperSeparator />
          <StepperItem status="current">
            <StepperIndicator>2</StepperIndicator>
            <StepperContent>
              <StepperTitle>把客户端指向本站</StepperTitle>
              <StepperDescription>
                在 WeKit ReadReceipts 里填入服务器地址，之后每条发出的消息会由客户端自动注册并内嵌打点图。
              </StepperDescription>
            </StepperContent>
          </StepperItem>
          <StepperSeparator />
          <StepperItem status="upcoming">
            <StepperIndicator>3</StepperIndicator>
            <StepperContent>
              <StepperTitle>正常发消息，回到这里看</StepperTitle>
              <StepperDescription>对方一打开会话，打点即命中，明细会出现在总览。</StepperDescription>
            </StepperContent>
          </StepperItem>
        </Stepper>

        <div className="flex flex-col gap-3">
          <Field orientation="vertical">
            <FieldLabel htmlFor="register-endpoint">消息注册接口（客户端调用）</FieldLabel>
            <InputGroup>
              <InputGroupInput id="register-endpoint" value="POST /register" readOnly />
              <InputGroupAddon align="inline-end">
                <IconButton icon={<CopyIcon />} variant="ghost" size="sm" aria-label="复制注册接口" onClick={() => copy(registerCurl)} />
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>入参 wxId / content / createTime，返回 64 位消息 ID</FieldDescription>
          </Field>

          <Field orientation="vertical">
            <FieldLabel htmlFor="pixel-endpoint">打点图（内嵌在消息里）</FieldLabel>
            <InputGroup>
              <InputGroupInput id="pixel-endpoint" value={pixelUrl} readOnly />
              <InputGroupAddon align="inline-end">
                <IconButton icon={<CopyIcon />} variant="ghost" size="sm" aria-label="复制打点地址" onClick={() => copy(pixelUrl)} />
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>1×1 透明 PNG，打点路径本身不发任何外部请求</FieldDescription>
          </Field>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button variant="primary" size="lg" onClick={onEnter}>
          进入控制台
          {/* → 点击「进入控制台」→ App Shell「总览」（退出 flow） */}
        </Button>
        <TypographyMuted className="text-center text-xs">
          这一步只在账号下一条消息都没有时出现
        </TypographyMuted>
      </CardFooter>
    </Card>
  )
}

/** Copy 图标名在 lucide v1 与 Spark 的 InputGroupButton 之间有重名风险，独立包一层 */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// ————————————————— Flow 组合器 —————————————————

type FlowStage = Screen | 'firstrun'

export function Flow1_Auth({
  onAuthenticated,
  initialScreen = 'login',
  ...chromeProps
}: ChromeProps & {
  /** 登录成功（或注册后走完引导）时交出 /me 的结果；null = 本屏没有会话可交 */
  onAuthenticated?: (session: Session | null) => void
  initialScreen?: FlowStage
}) {
  const chrome = useChrome(chromeProps)
  const [stage, setStage] = useState<FlowStage>(initialScreen)
  const [state, setState] = useState<AsyncState>('idle')
  const [error, setError] = useState<AuthError | null>(null)
  const [cooldown, setCooldown] = useState(0)
  // 对应 GET /auth/status：邀请码要不要填、被限流后倒数几秒，都由服务器说
  const [status, setStatus] = useState<AuthStatus | null>(null)
  /** 注册成功后先攒着：本屏还要停在「还差一步」，会话要等用户点进入才交出去 */
  const [authed, setAuthed] = useState<Session | null>(null)
  const retryAfterSeconds = status?.retry_after_seconds ?? 60
  const inviteRequired = status?.invite_required ?? false

  useEffect(() => {
    const controller = new AbortController()
    fetchAuthStatus(controller.signal).then(setStatus, () => {
      // 状态拿不到就按"不要求邀请码"渲染：宁可让服务器在提交时说清楚，
      // 也不要在登录页凭空长出一个必填框
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  /** 提交 → 真请求 → 失败映射成 AuthError；成功后再问一次 /me 拿会话 */
  const submit = async (call: () => Promise<unknown>, after: (session: Session) => void) => {
    setState('submitting')
    setError(null)
    try {
      await call()
      const session = await fetchMe()
      setState('idle')
      after(session)
    } catch (e) {
      const mapped = toAuthError(e, retryAfterSeconds)
      setState('error')
      setError(mapped)
      if (mapped.kind === 'rate_limited') setCooldown(mapped.retryAfterSeconds)
    }
  }

  const body =
    stage === 'firstrun' ? (
      // 直接访问 /onboarding（没走过注册）时 authed 为 null：外壳会去问一次 /me，
      // 仍然没登录就被守卫送回登录页 —— 按钮不会"看起来没反应"
      <Screen3_FirstRun onEnter={() => onAuthenticated?.(authed)} />
    ) : (
      <Tabs
        value={stage}
        onValueChange={(v) => {
          setStage(v as Screen)
          setError(null)
          setState('idle')
        }}
      >
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="login" className="flex-1">
            {t(chrome.lang, 'signIn')}
          </TabsTrigger>
          <TabsTrigger value="register" className="flex-1">
            {t(chrome.lang, 'register')}
          </TabsTrigger>
        </TabsList>
        {/* → 切换 Tabs → SCREEN 1 ⇄ SCREEN 2 */}
        <TabsContent value="login" className="pt-4">
          <Screen1_SignIn
            lang={chrome.lang}
            state={state}
            error={error}
            cooldown={cooldown}
            onSubmit={({ wxId, password }) =>
              submit(() => verifyCredentials({ wxId, password }), (session) => onAuthenticated?.(session))
            }
          />
        </TabsContent>
        <TabsContent value="register" className="pt-4">
          <Screen2_Register
            lang={chrome.lang}
            // 服务器说要么要求，要么已经因为缺码被拒 —— 两种都要把输入框亮出来，
            // 否则用户拿到"需要邀请码"却没有地方填
            inviteRequired={inviteRequired || error?.kind === 'invite_required'}
            state={state}
            error={error}
            cooldown={cooldown}
            onSubmit={({ wxId, password, invite }) =>
              submit(
                () => registerAccount({ wxId, password, ...(invite ? { inviteCode: invite } : {}) }),
                (session) => {
                  setAuthed(session)
                  setStage('firstrun')
                },
              )
            }
          />
        </TabsContent>
      </Tabs>
    )

  return (
    <AuthShell
      chrome={chrome}
      caption={
        status === null
          ? undefined
          : chrome.lang === 'zh'
            ? `${status.invite_required ? '注册需邀请码' : '开放注册'} · 密码 8–128 位`
            : `${status.invite_required ? 'Invite code required' : 'Open registration'} · password 8–128 chars`
      }
    >
      {body}
    </AuthShell>
  )
}
