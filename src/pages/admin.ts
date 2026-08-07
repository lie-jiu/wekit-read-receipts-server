import type { SessionUser } from "../auth";
import { escapeHtml, PAGES_STYLE, I18N_SCRIPT, ZH, EN } from "./common";

export function renderAdmin(user: SessionUser): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin</title>
${PAGES_STYLE}
</head>
<body>
<main>
  <div class="row">
    <h1 style="margin:0">Admin</h1>
    <a href="/"><button class="secondary" data-i18n="dashboard">仪表盘</button></a>
    <button class="secondary" id="logoutBtn" data-i18n="logout">退出</button>
  </div>
  <div class="muted">${escapeHtml(user.wxId)}</div>

  <div class="card">
    <div class="row">
      <h2 style="margin:0;font-size:1rem" data-i18n="users">用户</h2>
      <input id="nWxId" placeholder="wxid_xxx" style="flex:1">
      <input id="nPw" type="password" placeholder="password">
      <input id="nLevel" type="number" min="0" max="99" value="1" style="width:70px">
      <button id="createBtn" data-i18n="create">创建</button>
      <button class="secondary" id="usersRefreshBtn" data-i18n="refresh">刷新</button>
    </div>
    <table>
      <thead><tr><th data-i18n="wxId">微信 ID</th><th data-i18n="level">等级</th><th>msgs</th><th>reads</th><th></th></tr></thead>
      <tbody id="users"></tbody>
    </table>
  </div>

  <div class="card">
    <div class="row">
      <h2 style="margin:0;font-size:1rem" data-i18n="messages">消息列表</h2>
      <input id="q" placeholder="搜索…" data-i18n="search" style="flex:1">
      <button id="searchBtn" data-i18n="search">搜索</button>
      <button class="secondary" id="msgsRefreshBtn" data-i18n="refresh">刷新</button>
      <button class="danger" id="deleteAllBtn" data-i18n="deleteAll">清空全部消息</button>
    </div>
    <table>
      <thead><tr><th data-i18n="content">内容</th><th data-i18n="wxId">微信 ID</th><th data-i18n="readCount">已读</th><th data-i18n="time">时间</th><th></th></tr></thead>
      <tbody id="msgs"></tbody>
    </table>
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

async function loadUsers() {
  const j = await api("/admin/users");
  const tbody = document.getElementById("users");
  tbody.innerHTML = j.users.map((u) => \`
    <tr>
      <td>\${esc(u.wx_id)}</td>
      <td>\${u.level}</td>
      <td>\${u.message_count}</td>
      <td>\${u.read_count}</td>
      <td>
        <input class="lvl" data-wxid="\${esc(u.wx_id)}" type="number" min="0" max="99" value="\${u.level}" style="width:60px">
        <button data-act="level" data-wxid="\${esc(u.wx_id)}">\${T.setLevel}</button>
        <button data-act="reset" data-wxid="\${esc(u.wx_id)}">\${T.resetPassword}</button>
        <button class="danger" data-act="deluser" data-wxid="\${esc(u.wx_id)}">\${T.delete}</button>
      </td>
    </tr>\`).join("");
}

async function loadMsgs() {
  const q = document.getElementById("q").value.trim();
  const j = await api("/admin/messages" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const tbody = document.getElementById("msgs");
  tbody.innerHTML = j.messages.map((m) => \`
    <tr>
      <td>\${esc(m.content)}</td>
      <td>\${esc(m.wx_id)}</td>
      <td>\${m.read_count}</td>
      <td class="muted">\${m.timestamp.slice(0, 16)}</td>
      <td><button class="danger" data-act="delmsg" data-id="\${esc(m.id)}">\${T.delete}</button></td>
    </tr>\`).join("") || \`<tr><td colspan="5" class="muted">—</td></tr>\`;
}

async function createUser() {
  const wxId = document.getElementById("nWxId").value.trim();
  const password = document.getElementById("nPw").value;
  const level = Number(document.getElementById("nLevel").value || 1);
  try {
    await api("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wxId, password, level }),
    });
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function setLevel(btn) {
  const row = btn.closest("tr");
  const level = Number(row.querySelector(".lvl").value);
  const wxId = btn.dataset.wxid;
  if (level === 0 && !confirm(T.confirmDelete + "?")) return;
  try {
    await api("/admin/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wxId, level }),
    });
    loadUsers();
    loadMsgs();
  } catch (e) {
    alert(e.message);
  }
}

async function resetPw(wxId) {
  const password = prompt(T.resetPassword + ": " + wxId);
  if (!password) return;
  try {
    await api("/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wxId, password }),
    });
  } catch (e) {
    alert(e.message);
  }
}

async function delUser(wxId) {
  if (!confirm(T.delete + " " + wxId + "?")) return;
  try {
    await api("/admin/users/" + encodeURIComponent(wxId), { method: "DELETE" });
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function delMsg(id) {
  if (!confirm(T.delete + "?")) return;
  try {
    await api("/admin/messages/" + id, { method: "DELETE" });
    loadMsgs();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteAllMsgs() {
  if (!confirm(T.deleteAll + "?")) return;
  try {
    await api("/admin/messages", { method: "DELETE" });
    loadMsgs();
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById("createBtn").onclick = createUser;
document.getElementById("usersRefreshBtn").onclick = loadUsers;
document.getElementById("searchBtn").onclick = loadMsgs;
document.getElementById("msgsRefreshBtn").onclick = loadMsgs;
document.getElementById("deleteAllBtn").onclick = deleteAllMsgs;
document.getElementById("logoutBtn").onclick = () => {
  fetch("/auth/logout", { method: "POST" }).then(() => (location.href = "/login"));
};

document.querySelector("#users").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "level") await setLevel(btn);
  else if (act === "reset") await resetPw(btn.dataset.wxid);
  else if (act === "deluser") await delUser(btn.dataset.wxid);
});

document.querySelector("#msgs").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act=delmsg]");
  if (!btn) return;
  await delMsg(btn.dataset.id);
});

loadUsers();
loadMsgs();
</script>
</body>
</html>`;
}
