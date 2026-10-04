// ============================================================
// IP 输入校验
// ------------------------------------------------------------
// 必须与服务器 src/rate-limit.ts 的 isValidIp 同口径：IPv4 与 IPv6 都收。
// 只认 IPv4 会让移动端访客的 IPv6 地址永远拉黑不了——而客户端报错的时机是
// 提交前，用户连"服务器其实接受这个地址"都看不到。
// ============================================================

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_GROUP_RE = /^[0-9a-fA-F]{1,4}$/

export function validIp(v: string): boolean {
  const s = v.trim()
  if (!s) return false
  if (s.includes('.')) {
    if (!IPV4_RE.test(s)) return false
    return s.split('.').every((n) => Number(n) <= 255)
  }
  if (s.includes(':')) {
    // 服务器按冒号分段、丢掉空段（::1 会切成 ['1']），这里保持一致
    const segs = s.split(':').filter(Boolean)
    return segs.length > 0 && segs.every((x) => IPV6_GROUP_RE.test(x))
  }
  return false
}
