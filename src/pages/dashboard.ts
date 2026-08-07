import type { SessionUser } from "../auth";
import { escapeHtml, PAGES_STYLE, I18N_SCRIPT, ZH, EN } from "./common";

export function renderDashboard(user: SessionUser): string {
  const adminLink = user.isAdmin
    ? `<a href="/admin"><button class="secondary" data-i18n="admin">管理</button></a>`
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
  <div class="row">
    <h1 style="margin:0" data-i18n="dashboard">仪表盘</h1>
    ${adminLink}
    <button class="secondary" id="logoutBtn" data-i18n="logout">退出</button>
  </div>
  <div class="muted">${escapeHtml(user.wxId)}</div>

  <div class="card">
    <div class="row">
      <input id="q" placeholder="搜索…" data-i18n="search" style="flex:1">
      <button id="searchBtn" data-i18n="search">搜索</button>
      <button class="secondary" id="refreshBtn" data-i18n="refresh">刷新</button>
      <button class="danger" id="deleteAllBtn" data-i18n="deleteAll">清空全部消息</button>
    </div>
    <table>
      <thead><tr><th data-i18n="content">内容</th><th data-i18n="readCount">已读</th><th data-i18n="time">时间</th></tr></thead>
      <tbody id="msgs"></tbody>
    </table>
  </div>

  <div class="card">
    <div class="row">
      <h2 style="margin:0;font-size:1rem" data-i18n="leaderboard">排行榜</h2>
      <select id="period">
        <option value="day" data-i18n="periodDay">今日</option>
        <option value="total" data-i18n="periodTotal">累计</option>
      </select>
      <select id="metric">
        <option value="read" data-i18n="metricRead">已读人次</option>
        <option value="msg" data-i18n="metricMsg">被读消息</option>
        <option value="reg" data-i18n="metricReg">发送消息</option>
      </select>
      <button class="secondary" id="boardBtn" data-i18n="refresh">刷新</button>
    </div>
    <table>
      <thead><tr><th>#</th><th data-i18n="wxId">微信 ID</th><th data-i18n="readCount">已读</th></tr></thead>
      <tbody id="board"></tbody>
    </table>
  </div>

  <div class="card">
    <h2 style="margin:0 0 12px;font-size:1rem" data-i18n="changePassword">修改密码</h2>
    <div class="row">
      <input id="oldPw" type="password" data-i18n="oldPassword" placeholder="旧密码">
      <input id="newPw" type="password" data-i18n="newPassword" placeholder="新密码">
      <button id="pwBtn" data-i18n="submit">提交</button>
    </div>
    <div class="err" id="pwErr"></div>
  </div>
</main>
${I18N_SCRIPT}
<script>
const T = (navigator.language || "").toLowerCase().startsWith("zh") ? ${JSON.stringify(ZH)} : ${JSON.stringify(EN)};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function api(path, opts) {
  const res = await fetch(path, opts);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.status);
  return j;
}

async function loadMessages() {
  const q = document.getElementById("q").value.trim();
  const j = await api("/messages" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const tbody = document.getElementById("msgs");
  tbody.innerHTML = j.messages.map((m) => \`
    <tr>
      <td>\${esc(m.content)}</td>
      <td>\${m.read_count}</td>
      <td class="muted">\${m.timestamp.slice(0, 16)}</td>
    </tr>\`).join("") || \`<tr><td colspan="3" class="muted">—</td></tr>\`;
}

async function loadBoard() {
  const period = document.getElementById("period").value;
  const metric = document.getElementById("metric").value;
  const j = await api("/leaderboard?period=" + period + "&metric=" + metric);
  const tbody = document.getElementById("board");
  tbody.innerHTML = j.entries.map((e, i) => \`
    <tr class="\${e.me ? "me" : ""}">
      <td>\${i + 1}</td>
      <td>\${esc(e.wxId)}\${e.me ? " (" + T.me + ")" : ""}</td>
      <td>\${e.count}</td>
    </tr>\`).join("") || \`<tr><td colspan="3" class="muted">—</td></tr>\`;
}

async function deleteAll() {
  if (!confirm(T.deleteAll + "?")) return;
  await api("/messages", { method: "DELETE" });
  loadMessages();
}

async function changePw() {
  const errEl = document.getElementById("pwErr");
  errEl.textContent = "";
  try {
    await api("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldPassword: document.getElementById("oldPw").value,
        newPassword: document.getElementById("newPw").value,
      }),
    });
    errEl.textContent = T.ok;
  } catch (e) {
    errEl.textContent = e.message;
  }
}

document.getElementById("searchBtn").onclick = loadMessages;
document.getElementById("refreshBtn").onclick = loadMessages;
document.getElementById("deleteAllBtn").onclick = deleteAll;
document.getElementById("boardBtn").onclick = loadBoard;
document.getElementById("pwBtn").onclick = changePw;
document.getElementById("q").addEventListener("keydown", (e) => { if (e.key === "Enter") loadMessages(); });
document.getElementById("logoutBtn").onclick = () => {
  fetch("/auth/logout", { method: "POST" }).then(() => (location.href = "/login"));
};

loadMessages();
loadBoard();
</script>
</body>
</html>`;
}
