export const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title data-i18n="title">Login — Read Receipts</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='14' font-size='14'%3E%E2%9C%89%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;padding:1rem;padding-top:max(1rem,env(safe-area-inset-top));padding-bottom:max(1rem,env(safe-area-inset-bottom));padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;max-width:min(380px,100%);width:100%;box-shadow:0 8px 32px rgba(0,0,0,.5)}
h1{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}
p{font-size:.85rem;color:#94a3b8;margin-bottom:1.25rem}
.tabs{display:flex;gap:.4rem;margin-bottom:1.25rem}
.tab{flex:1;padding:.5rem;border:1px solid #475569;border-radius:6px;background:transparent;color:#94a3b8;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.tab.active{background:#2563eb;border-color:#2563eb;color:#fff}
input{width:100%;padding:.6rem .8rem;border:1px solid #475569;border-radius:6px;font-size:.9rem;background:#0f172a;color:#e2e8f0;outline:none;margin-bottom:.6rem;transition:border-color .15s}
input:focus{border-color:#3b82f6}
button[type=submit]{width:100%;margin-top:.4rem;padding:.6rem;border:none;border-radius:6px;font-size:.9rem;font-weight:600;cursor:pointer;background:#2563eb;color:#fff;transition:background .15s}
button[type=submit]:hover{background:#1d4ed8}
button[type=submit]:disabled{opacity:.6;cursor:not-allowed}
.msg{margin-top:.9rem;font-size:.8rem;color:#fca5a5;min-height:1.2em;text-align:center}
.hint{font-size:.72rem;color:#64748b;margin:-.2rem 0 .6rem}
.hidden{display:none}
.lang-toggle{position:fixed;top:max(1rem,env(safe-area-inset-top));right:max(1rem,env(safe-area-inset-right));font-size:.7rem;font-weight:600;padding:.25rem .5rem;border-radius:4px;background:transparent;color:#64748b;border:1px solid #475569;cursor:pointer;letter-spacing:.03em}
.lang-toggle:hover{color:#e2e8f0;border-color:#94a3b8}
.repo-footer{display:flex;align-items:center;gap:.4rem;font-size:.78rem;color:#64748b;text-decoration:none;padding:.4rem .7rem;border-radius:8px;transition:color .15s,background .15s}
.repo-footer:hover{color:#e2e8f0;background:#1e293b}
.repo-footer svg{width:16px;height:16px;flex-shrink:0}
@media (max-width:480px){.card{padding:1.5rem 1.25rem}.tab,button[type=submit],input{min-height:44px}.lang-toggle{padding:.5rem .6rem}.repo-footer{min-height:44px;padding:.5rem .8rem}}
</style>
</head>
<body>
<button type="button" class="lang-toggle" onclick="toggleLang()">中 / EN</button>
<div class="card">
<h1 data-i18n="title">&#128274; Read Receipts</h1>
<p data-i18n="subtitle">Log in with your wxId account, or register a new one.</p>
<div class="tabs">
  <button type="button" id="tabLogin" class="tab active" onclick="switchTab('login')" data-i18n="tabLogin">Login</button>
  <button type="button" id="tabRegister" class="tab" onclick="switchTab('register')" data-i18n="tabRegister">Register</button>
</div>
<form id="loginForm" autocomplete="on">
  <input id="loginWxid" placeholder="wxId" autocomplete="username" data-i18n="phWxid" data-i18n-placeholder/>
  <input id="loginPass" type="password" placeholder="Password" autocomplete="current-password" data-i18n="phPassword" data-i18n-placeholder/>
  <button type="submit" id="loginBtn" data-i18n="unlock">Unlock</button>
</form>
<form id="registerForm" class="hidden" autocomplete="on">
  <input id="regWxid" placeholder="wxId (wxid_ + 14 lowercase letters/digits)" autocomplete="username" data-i18n="phRegWxid" data-i18n-placeholder/>
  <input id="regPass" type="password" placeholder="Password (min 8 chars)" autocomplete="new-password" data-i18n="phRegPass" data-i18n-placeholder/>
  <input id="regPass2" type="password" placeholder="Confirm password" autocomplete="new-password" data-i18n="phRegPass2" data-i18n-placeholder/>
  <div id="inviteWrap" class="hidden"><input id="regInvite" placeholder="Invite code" data-i18n="phInvite" data-i18n-placeholder/></div>
  <p class="hint" data-i18n="levelHint">Level 1 accounts keep 1 message for 1 month. Registering more auto-removes the oldest.</p>
  <button type="submit" id="regBtn" data-i18n="createAccount">Create account</button>
</form>
<div id="msg" class="msg"></div>
</div>
<a class="repo-footer" href="https://github.com/lie-jiu/wekit-read-receipts-server" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
<span>lie-jiu · GitHub</span>
</a>
<script>
const $ = (id) => document.getElementById(id);
let lang = localStorage.getItem("lang") || "zh-CN";
const translations = {
  "zh-CN": {
    title: "已读追踪",
    subtitle: "使用 wxId 账号登录，或注册新账号。",
    tabLogin: "登录",
    tabRegister: "注册",
    phWxid: "wxId",
    phPassword: "密码",
    unlock: "解锁",
    phRegWxid: "wxId（wxid_ + 14 位小写字母/数字）",
    phRegPass: "密码（至少 8 位）",
    phRegPass2: "确认密码",
    phInvite: "邀请码",
    levelHint: "等级 1 账号保留 1 条消息 1 个月。继续注册会自动删除最早的。",
    createAccount: "创建账号",
    loginFailed: "登录失败",
    regFailed: "注册失败",
    passMismatch: "两次输入的密码不一致",
    networkError: "网络错误",
  },
  en: {
    title: "Read Receipts",
    subtitle: "Log in with your wxId account, or register a new one.",
    tabLogin: "Login",
    tabRegister: "Register",
    phWxid: "wxId",
    phPassword: "Password",
    unlock: "Unlock",
    phRegWxid: "wxId (wxid_ + 14 lowercase letters/digits)",
    phRegPass: "Password (min 8 chars)",
    phRegPass2: "Confirm password",
    phInvite: "Invite code",
    levelHint: "Level 1 accounts keep 1 message for 1 month. Registering more auto-removes the oldest.",
    createAccount: "Create account",
    loginFailed: "Login failed",
    regFailed: "Registration failed",
    passMismatch: "Passwords do not match",
    networkError: "Network error",
  },
};
function t(key){ return translations[lang][key] || key; }
function applyI18n(){
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (el.tagName === "TITLE") document.title = t(key);
    else if ("i18nPlaceholder" in el.dataset) el.placeholder = t(key);
    else el.textContent = t(key);
  });
}
function toggleLang(){
  lang = lang === "zh-CN" ? "en" : "zh-CN";
  localStorage.setItem("lang", lang);
  applyI18n();
}
applyI18n();
function switchTab(name){
  $("tabLogin").classList.toggle("active", name === "login");
  $("tabRegister").classList.toggle("active", name === "register");
  $("loginForm").classList.toggle("hidden", name !== "login");
  $("registerForm").classList.toggle("hidden", name !== "register");
  $("msg").textContent = "";
}
function showMsg(s){ $("msg").textContent = s; }
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("loginBtn"); btn.disabled = true;
  try {
    const res = await fetch("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ wxId: $("loginWxid").value.trim(), password: $("loginPass").value })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { location.href = data.redirect || "/"; return; }
    showMsg(data.error || t("loginFailed"));
  } catch { showMsg(t("networkError")); }
  btn.disabled = false;
});
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("regBtn"); btn.disabled = true;
  const p1 = $("regPass").value, p2 = $("regPass2").value;
  if (p1 !== p2) { showMsg(t("passMismatch")); btn.disabled = false; return; }
  try {
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ wxId: $("regWxid").value.trim(), password: p1, password2: p2, invite: $("regInvite").value.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { location.href = data.redirect || "/"; return; }
    showMsg(data.error || t("regFailed"));
  } catch { showMsg(t("networkError")); }
  btn.disabled = false;
});
fetch("/auth/status").then(r => r.json()).then(s => { if (s.invite_required) $("inviteWrap").classList.remove("hidden"); }).catch(() => {});
</script>
</body>
</html>`;
