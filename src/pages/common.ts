export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const ZH = {
  login: "登录",
  register: "注册",
  wxId: "微信 ID",
  password: "密码",
  inviteCode: "邀请码",
  submit: "提交",
  switchToRegister: "没有账号？注册",
  switchToLogin: "已有账号？登录",
  error: "错误",
  dashboard: "仪表盘",
  admin: "管理",
  logout: "退出",
  messages: "消息列表",
  search: "搜索",
  refresh: "刷新",
  deleteAll: "清空全部消息",
  content: "内容",
  time: "时间",
  readCount: "已读",
  leaderboard: "排行榜",
  periodDay: "今日",
  periodTotal: "累计",
  metricReg: "发送消息",
  metricRead: "已读人次",
  metricMsg: "被读消息",
  me: "我",
  changePassword: "修改密码",
  oldPassword: "旧密码",
  newPassword: "新密码",
  users: "用户",
  level: "等级",
  create: "创建",
  setLevel: "设置等级",
  resetPassword: "重置密码",
  delete: "删除",
  confirmDelete: "确认删除",
  ok: "完成",
};

export const EN: Record<keyof typeof ZH, string> = {
  login: "Login",
  register: "Register",
  wxId: "WeChat ID",
  password: "Password",
  inviteCode: "Invite code",
  submit: "Submit",
  switchToRegister: "No account? Register",
  switchToLogin: "Have an account? Login",
  error: "Error",
  dashboard: "Dashboard",
  admin: "Admin",
  logout: "Logout",
  messages: "Messages",
  search: "Search",
  refresh: "Refresh",
  deleteAll: "Delete all messages",
  content: "Content",
  time: "Time",
  readCount: "Read",
  leaderboard: "Leaderboard",
  periodDay: "Today",
  periodTotal: "Total",
  metricReg: "Sent",
  metricRead: "Reads",
  metricMsg: "Read msgs",
  me: "me",
  changePassword: "Change password",
  oldPassword: "Old password",
  newPassword: "New password",
  users: "Users",
  level: "Level",
  create: "Create",
  setLevel: "Set level",
  resetPassword: "Reset password",
  delete: "Delete",
  confirmDelete: "Confirm delete",
  ok: "Done",
};

export const I18N_SCRIPT = `
<script>
const zh = ${JSON.stringify(ZH)};
const en = ${JSON.stringify(EN)};
const T = (navigator.language || "").toLowerCase().startsWith("zh") ? zh : en;
document.querySelectorAll("[data-i18n]").forEach((el) => {
  const key = el.dataset.i18n;
  if (key && T[key]) el.textContent = T[key];
});
</script>`;

export const PAGES_STYLE = `
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #f5f5f7; color: #1d1d1f; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 1.4rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 0.9rem; }
  th { background: #fafafa; }
  input, select, button { padding: 8px 10px; border: 1px solid #d1d1d6; border-radius: 8px; font-size: 0.9rem; }
  button { background: #007aff; color: #fff; border-color: #007aff; cursor: pointer; }
  button.secondary { background: #fff; color: #1d1d1f; }
  button.danger { background: #ff3b30; border-color: #ff3b30; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0; }
  .card { background: #fff; border-radius: 12px; padding: 16px; margin: 16px 0; }
  .muted { color: #86868b; font-size: 0.8rem; }
  .me { font-weight: 600; }
  .err { color: #ff3b30; font-size: 0.85rem; }
</style>`;
