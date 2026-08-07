import { INVITE_CODE } from "../config";
import { PAGES_STYLE, I18N_SCRIPT, ZH, EN } from "./common";

export function renderLogin(): string {
  const inviteField = INVITE_CODE
    ? `
  <div class="row">
    <input id="invite" placeholder="邀请码" data-i18n="inviteCode" autocomplete="off">
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Read Receipts</title>
${PAGES_STYLE}
</head>
<body>
<main>
  <h1 data-i18n="login">登录</h1>
  <div class="card">
    <form id="form">
      <div class="row">
        <input id="wxId" placeholder="wxid_xxx" autocomplete="username" required>
      </div>
      <div class="row">
        <input id="password" type="password" data-i18n="password" placeholder="密码" autocomplete="current-password" required>
      </div>
      ${inviteField}
      <div class="row">
        <button type="submit" id="submit" data-i18n="submit">提交</button>
        <button type="button" class="secondary" id="toggle"></button>
      </div>
      <div class="err" id="err"></div>
    </form>
  </div>
</main>
<script>
const zh = ${JSON.stringify(ZH)};
const en = ${JSON.stringify(EN)};
const T = (navigator.language || "").toLowerCase().startsWith("zh") ? zh : en;
const inviteRequired = ${JSON.stringify(!!INVITE_CODE)};
const form = document.getElementById("form");
const err = document.getElementById("err");
const submitBtn = document.getElementById("submit");
const toggleBtn = document.getElementById("toggle");
let mode = "login";
const labels = { login: T.login, register: T.register };
function refresh() {
  submitBtn.textContent = labels[mode];
  toggleBtn.textContent = mode === "login" ? T.switchToRegister : T.switchToLogin;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.dataset.i18n;
    if (k && T[k] && el.id !== "submit") el.textContent = T[k];
  });
}
toggleBtn.onclick = () => {
  mode = mode === "login" ? "register" : "login";
  err.textContent = "";
  refresh();
};
form.onsubmit = async (e) => {
  e.preventDefault();
  err.textContent = "";
  const wxId = document.getElementById("wxId").value.trim();
  const password = document.getElementById("password").value;
  const invite = document.getElementById("invite")?.value.trim() || "";
  const body = mode === "login" ? { wxId, password } : { wxId, password, inviteCode: invite };
  const res = await fetch("/auth/" + (mode === "login" ? "verify" : "register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    location.href = "/";
  } else {
    const j = await res.json().catch(() => ({}));
    err.textContent = (j.error || res.status) + "";
  }
};
refresh();
</script>
</body>
</html>`;
}
