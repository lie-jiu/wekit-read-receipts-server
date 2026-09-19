/**
 * 全站 UI 词条。
 *
 * 只覆盖「跨屏复用的 chrome 文案」（导航、通用按钮、状态名、字段标签、单位），
 * 约 60 条 —— 这是闭集，值得双语化。各屏的叙述性长文案保持中文，
 * 接回真实工程时由 `src/pages/shared.ts` 里既有的 `t()` / `applyI18n()` 承担全量词条。
 */

export type Lang = 'zh' | 'en'

const STRINGS = {
  brand: ['WeKit Read Insights', 'WeKit Read Insights'],
  tagline: ['看清每一条消息的已读轨迹', 'See exactly who read your messages, and when'],

  // ——— 通用动作 ———
  signIn: ['登录', 'Sign in'],
  register: ['注册', 'Create account'],
  signOut: ['退出登录', 'Sign out'],
  cancel: ['取消', 'Cancel'],
  save: ['保存', 'Save'],
  add: ['添加', 'Add'],
  remove: ['移除', 'Remove'],
  copied: ['已复制', 'Copied'],
  retry: ['重试', 'Try again'],
  confirm: ['确认', 'Confirm'],
  close: ['关闭', 'Close'],
  refresh: ['刷新', 'Refresh'],
  locate: ['定位', 'Locate'],

  // ——— 字段 ———
  wxId: ['微信 ID', 'WeChat ID'],
  password: ['密码', 'Password'],
  oldPassword: ['当前密码', 'Current password'],
  newPassword: ['新密码', 'New password'],
  inviteCode: ['邀请码', 'Invite code'],
  ipCase: ['IP 地址', 'IP Address'],
  location: ['地区', 'Location'],
  isp: ['运营商', 'ISP'],
  userAgent: ['客户端', 'Client'],
  readAt: ['已读时间', 'Read At'],
  sentAt: ['发送时间', 'Sent'],
  registeredAt: ['注册时间', 'Registered'],
  lastActive: ['最后活跃', 'Last active'],
  level: ['等级', 'Level'],
  reads: ['已读', 'Reads'],
  message: ['消息', 'Message'],

  // ——— 状态 ———
  statePublic: ['已公开', 'Public'],
  statePrivate: ['未公开', 'Private'],
  stateActive: ['正常', 'Active'],
  stateSuspended: ['已停注册', 'Registration off'],
  stateNotLocated: ['未定位', 'Not located'],
  adminBadge: ['管理员', 'Admin'],

  // ——— 导航 ———
  navOverview: ['总览', 'Overview'],
  navMessages: ['我的消息', 'My Messages'],
  navLeaderboard: ['排行榜', 'Leaderboard'],
  navUsers: ['用户', 'Users'],
  navEntitlement: ['权益与清理', 'Entitlements & Retention'],
  navAudit: ['操作留痕', 'Audit Log'],
  navAccount: ['账户设置', 'Account Settings'],

  // ——— 排行榜 ———
  rank: ['排名', 'Rank'],
  account: ['账号', 'Account'],
  owner: ['归属用户', 'Owner'],
  boardReg: ['注册榜', 'Sign-ups'],
  boardRead: ['已读榜', 'Reads'],
  boardMsg: ['消息榜', 'Messages'],
  scopeDay: ['日榜', 'Daily'],
  scopeTotal: ['总榜', 'Overall'],
  messageCount: ['消息数', 'Messages'],

  // ——— 单位与计量 ———
  unitTimes: ['次', 'reads'],
  unitItems: ['条', 'items'],
  perDay: ['每天', '/day'],
  remainingOf: ['剩余', 'left'],
} as const

export type StringKey = keyof typeof STRINGS

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang === 'zh' ? 0 : 1]
}

/** 数字千分位，中英一致 */
export function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

/** 0.63 → 「63%」 */
export function fmtPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`
}
