// ============================================================
// 数据层 · 认证与会话
// ------------------------------------------------------------
// 对应 src/routes/auth.ts + src/routes/session.ts。
// 服务器返回的是 { error: 'invalid credentials' } 这类英文码，
// 这里统一翻译成视图层的 AuthError 判别联合，页面只管拿它选文案。
// ============================================================

import type { AuthError, AuthStatus, Session } from '../flows/shared/types'
import { ApiError, api } from './api'

export type Credentials = { wxId: string; password: string }

export const fetchAuthStatus = (signal?: AbortSignal): Promise<AuthStatus> =>
  api.get<AuthStatus>('/auth/status', signal)

export const fetchMe = (signal?: AbortSignal): Promise<Session> => api.get<Session>('/me', signal)

/** POST /auth/verify：成功即种下 HttpOnly 会话 cookie，后续请求由浏览器自动带上 */
export const verifyCredentials = (body: Credentials, signal?: AbortSignal): Promise<{ ok: true }> =>
  api.post<{ ok: true }>('/auth/verify', body, signal)

/** POST /auth/register：同样直接建立会话，所以注册成功后不必再登录一次 */
export const registerAccount = (
  body: Credentials & { inviteCode?: string },
  signal?: AbortSignal,
): Promise<{ ok: true }> => api.post<{ ok: true }>('/auth/register', body, signal)

export const signOutRequest = (): Promise<{ ok: true }> => api.post<{ ok: true }>('/auth/logout')

/**
 * POST /auth/password。注意服务器的副作用：改密会删除该用户全部会话（含当前这条），
 * 所以调用方拿到 ok 之后必须把本地登录态清掉并回登录页，
 * 否则下一个请求就是 401。
 */
export const changePassword = (body: {
  oldPassword: string
  newPassword: string
}): Promise<{ ok: true }> => api.post<{ ok: true }>('/auth/password', body)

/** 状态码 → 判别联合。服务器没有 Retry-After 头，倒计时用 /auth/status 给的窗口长度 */
export function toAuthError(e: unknown, retryAfterSeconds: number): AuthError {
  if (!(e instanceof ApiError)) return { kind: 'network' }
  // status 0 = 根本没连上（fetch 抛错），不能算成"密码错误"
  if (e.status === 0) return { kind: 'network' }
  if (e.rateLimited) return { kind: 'rate_limited', retryAfterSeconds }
  if (e.status === 401) return { kind: 'invalid_credentials' }
  if (e.status === 403 && e.code.includes('invite')) return { kind: 'invite_required' }
  if (e.status === 409) return { kind: 'wxid_taken' }
  return { kind: 'unknown', status: e.status, code: e.code }
}
