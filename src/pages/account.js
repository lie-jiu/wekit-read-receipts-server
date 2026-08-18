import { safeJson } from "../utils";

/** 独立用户设置页 /account：账户 IP 黑名单 + 修改密码 / 退出登录 / 清除我的（自首页迁移） */
export function accountPage(session) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title data-i18n="title">Account Settings</title>
    <style>
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
        background: #0f172a;
        background-image:
          radial-gradient(1200px 500px at 80% -10%, rgba(37, 99, 235, 0.18), transparent 60%),
          radial-gradient(900px 400px at -10% 110%, rgba(59, 130, 246, 0.1), transparent 55%);
        background-attachment: fixed;
        color: #e2e8f0;
        min-height: 100vh;
        min-height: 100dvh;
        padding: 2rem 1rem;
        padding-top: max(2rem, env(safe-area-inset-top));
        padding-bottom: max(2rem, env(safe-area-inset-bottom));
        padding-left: max(1rem, env(safe-area-inset-left));
        padding-right: max(1rem, env(safe-area-inset-right));
      }
      .container {
        max-width: 720px;
        margin: 0 auto;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .header h1 {
        font-size: 1.4rem;
        font-weight: 700;
        color: #f1f5f9;
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        color: #94a3b8;
        text-decoration: none;
        font-size: 0.8rem;
        font-weight: 500;
        margin-bottom: 0.35rem;
        transition: color 0.15s;
      }
      .back-link:hover {
        color: #e2e8f0;
      }
      .back-link svg {
        width: 14px;
        height: 14px;
      }
      .header .flex {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .user-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
        color: #94a3b8;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 999px;
        padding: 0.25rem 0.7rem;
      }
      .card {
        background: rgba(30, 41, 59, 0.9);
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 1.1rem 1.25rem;
        margin-bottom: 1.25rem;
        backdrop-filter: blur(6px);
        box-shadow: 0 8px 30px rgba(2, 6, 23, 0.4);
      }
      .card-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: #f1f5f9;
        margin-bottom: 0.35rem;
      }
      .card-hint {
        font-size: 0.78rem;
        color: #64748b;
        line-height: 1.5;
        margin-bottom: 0.85rem;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.45rem 0.85rem;
        border: none;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        text-decoration: none;
        transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
      }
      .btn:active {
        transform: scale(0.97);
      }
      .btn-primary {
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        color: #fff;
        box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
      }
      .btn-primary:hover {
        background: linear-gradient(135deg, #1d4ed8, #2563eb);
      }
      .btn-secondary {
        background: #475569;
        color: #e2e8f0;
      }
      .btn-secondary:hover {
        background: #64748b;
      }
      .btn-danger {
        background: #b91c1c;
        color: #fff;
      }
      .btn-danger:hover {
        background: #991b1b;
      }
      .btn-outline {
        background: transparent;
        color: #94a3b8;
        border: 1px solid #475569;
      }
      .btn-outline:hover {
        background: #1e293b;
        color: #e2e8f0;
      }
      .btn-sm {
        padding: 0.3rem 0.6rem;
        font-size: 0.75rem;
      }
      .lang-toggle {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.2rem 0.45rem;
        border-radius: 4px;
        background: transparent;
        color: #64748b;
        border: 1px solid #475569;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
        letter-spacing: 0.03em;
      }
      .lang-toggle:hover {
        color: #e2e8f0;
        border-color: #94a3b8;
      }
      .ip-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 0.85rem;
      }
      .ip-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 8px;
      }
      .ip-text {
        font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
        font-size: 0.8rem;
        color: #a78bfa;
        overflow-wrap: anywhere;
      }
      .ip-empty {
        font-size: 0.82rem;
        color: #475569;
        padding: 0.9rem 0.25rem;
        text-align: center;
        border: 1px dashed #334155;
        border-radius: 8px;
      }
      .add-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .add-row input {
        flex: 1;
        min-width: 200px;
        padding: 0.45rem 0.7rem;
        border: 1px solid #475569;
        border-radius: 6px;
        font-size: 0.85rem;
        background: #0f172a;
        color: #e2e8f0;
        outline: none;
        transition: border-color 0.15s;
        font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
      }
      .add-row input:focus {
        border-color: #3b82f6;
      }
      .actions-row {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 999;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fade-in 0.15s ease-out;
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .modal {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      }
      .modal h3 {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
      }
      .modal p {
        font-size: 0.875rem;
        color: #94a3b8;
        margin-bottom: 1.25rem;
        line-height: 1.5;
      }
      .modal .actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
      }
      .modal-form input {
        width: 100%;
        padding: 0.55rem 0.7rem;
        border: 1px solid #475569;
        border-radius: 6px;
        font-size: 0.9rem;
        background: #0f172a;
        color: #e2e8f0;
        outline: none;
        margin-bottom: 0.6rem;
        transition: border-color 0.15s;
      }
      .modal-form input:focus {
        border-color: #3b82f6;
      }
      .hidden {
        display: none !important;
      }
      .toast-container {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        z-index: 1000;
        max-width: min(92vw, 380px);
      }
      .toast {
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.82rem;
        background: #1e293b;
        border: 1px solid #334155;
        color: #e2e8f0;
        box-shadow: 0 6px 20px rgba(2, 6, 23, 0.5);
        animation: toast-in 0.2s ease-out;
      }
      .toast-error { border-color: #dc2626; color: #fecaca; }
      .toast-success { border-color: #059669; color: #a7f3d0; }
      .toast-info { border-color: #2563eb; color: #bfdbfe; }
      .toast-out {
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.3s, transform 0.3s;
      }
      @keyframes toast-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 640px) {
        body { padding: 1rem 0.75rem; }
        .header { flex-direction: column; align-items: stretch; }
        .header .flex { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .header .user-chip { grid-column: 1 / -1; justify-content: center; }
        .header .btn, .header .lang-toggle { width: 100%; justify-content: center; min-height: 40px; }
        .btn { min-height: 40px; }
        .add-row input { min-width: 0; width: 100%; min-height: 44px; }
        .add-row .btn { flex: 1; }
        .actions-row .btn { flex: 1; justify-content: center; }
        .ip-item { flex-wrap: wrap; }
        .modal { max-width: 94vw; width: 94vw; padding: 1.25rem; }
        .modal .actions { flex-direction: column-reverse; }
        .modal .actions .btn { width: 100%; justify-content: center; min-height: 44px; }
        .modal-form input { min-height: 44px; }
        .toast-container { left: 1rem; align-items: stretch; }
        .toast { max-width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <a class="back-link" href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span data-i18n="backToDashboard">Dashboard</span>
          </a>
          <h1 data-i18n="title">Account Settings</h1>
        </div>
        <div class="flex">
          <span class="user-chip" id="userChip"></span>
          <button class="lang-toggle" onclick="toggleLang()">中 / EN</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title" data-i18n="myIpBlacklist">My IP Blacklist</div>
        <div class="card-hint" data-i18n="accountBlacklistHint">IPs in this list are hidden from read details of all your messages. Records are kept, only hidden.</div>
        <div class="ip-list" id="ipList"></div>
        <div class="add-row">
          <input id="newIp" type="text" placeholder="e.g. 203.0.113.7" data-i18n="ipPlaceholder" data-i18n-placeholder />
          <button class="btn btn-primary" onclick="addIp()" data-i18n="addToBlacklist">Add to Blacklist</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title" data-i18n="accountActions">Account</div>
        <div class="actions-row">
          <button class="btn btn-primary" onclick="openPasswordModal()" data-i18n="changePassword">Change Password</button>
          <button class="btn btn-outline" onclick="logout()" data-i18n="logout">Logout</button>
          <button class="btn btn-danger" onclick="showClearAllModal()" data-i18n="clearAll">Clear Mine</button>
        </div>
      </div>
    </div>

    <div id="toastContainer" class="toast-container"></div>
    <div id="modalOverlay" class="modal-overlay hidden">
      <div class="modal">
        <h3 id="modalTitle" data-i18n="confirm">Confirm</h3>
        <p id="modalBody"></p>
        <div class="actions">
          <button class="btn btn-secondary" id="modalCancel" data-i18n="cancel">Cancel</button>
          <button class="btn btn-danger" id="modalConfirm" data-i18n="delete">Delete</button>
        </div>
      </div>
    </div>
    <div id="passOverlay" class="modal-overlay hidden">
      <div class="modal">
        <h3 data-i18n="changePassword">Change Password</h3>
        <div class="modal-form">
          <input id="oldPass" type="password" data-i18n-placeholder data-i18n="currentPassword" placeholder="Current password" />
          <input id="newPass" type="password" data-i18n-placeholder data-i18n="newPassword" placeholder="New password" />
          <input id="newPass2" type="password" data-i18n-placeholder data-i18n="confirmPassword" placeholder="Confirm new password" />
        </div>
        <div class="actions">
          <button class="btn btn-secondary" id="passCancel" data-i18n="cancel">Cancel</button>
          <button class="btn btn-primary" id="passSave" data-i18n="save">Save</button>
        </div>
      </div>
    </div>

    <script>
      const ME = \${safeJson({ wxId: session.wxId, level: session.level })};
      const $ = (id) => document.getElementById(id);
      let lang = localStorage.getItem("lang") || "zh-CN";
      const translations = {
        "zh-CN": {
          title: "账户设置",
          backToDashboard: "返回仪表盘",
          myIpBlacklist: "我的 IP 黑名单",
          accountBlacklistHint: "命中黑名单的 IP 将在你所有消息的已读详情中隐藏（记录保留，仅前端不展示）。仅支持手动添加指定 IP。",
          ipPlaceholder: "输入 IP，如 203.0.113.7",
          addToBlacklist: "加入黑名单",
          emptyBlacklist: "黑名单为空",
          remove: "移除",
          accountActions: "账户操作",
          changePassword: "修改密码",
          logout: "退出登录",
          clearAll: "清除我的",
          currentPassword: "当前密码",
          newPassword: "新密码（至少 8 位）",
          confirmPassword: "确认新密码",
          passTooShort: "密码至少 8 位",
          passMismatch: "两次输入的新密码不一致",
          passChanged: "密码已修改，请重新登录",
          passFailed: "修改密码失败",
          clearAllTitle: "清除我的所有记录？",
          clearAllBody: "这将永久删除你账号下的所有消息及其读取记录。",
          clearingAll: "正在清除我的记录…",
          clearedAll: "已清除我的所有记录",
          failedClear: "清除记录失败",
          confirm: "确认",
          cancel: "取消",
          delete: "删除",
          save: "保存",
          invalidIp: "IP 格式无效",
          ipExists: "该 IP 已在黑名单中",
          ipAdded: "已加入黑名单",
          ipRemoved: "已移除",
          addFailed: "添加失败",
          removeFailed: "移除失败",
          loadFailed: "加载失败",
          networkError: "网络错误",
        },
        en: {
          title: "Account Settings",
          backToDashboard: "Dashboard",
          myIpBlacklist: "My IP Blacklist",
          accountBlacklistHint: "Blacklisted IPs are hidden from read details of all your messages. Records are kept, only hidden. Manual IP entry only.",
          ipPlaceholder: "Enter an IP, e.g. 203.0.113.7",
          addToBlacklist: "Add to Blacklist",
          emptyBlacklist: "Blacklist is empty",
          remove: "Remove",
          accountActions: "Account",
          changePassword: "Change Password",
          logout: "Logout",
          clearAll: "Clear Mine",
          currentPassword: "Current password",
          newPassword: "New password (min 8 chars)",
          confirmPassword: "Confirm new password",
          passTooShort: "Password must be at least 8 characters",
          passMismatch: "New passwords do not match",
          passChanged: "Password updated, please log in again",
          passFailed: "Failed to update password",
          clearAllTitle: "Clear all my records?",
          clearAllBody: "This will permanently delete all your messages and their reads.",
          clearingAll: "Clearing my records…",
          clearedAll: "All my records cleared",
          failedClear: "Failed to clear records",
          confirm: "Confirm",
          cancel: "Cancel",
          delete: "Delete",
          save: "Save",
          invalidIp: "Invalid IP format",
          ipExists: "IP already blacklisted",
          ipAdded: "Added to blacklist",
          ipRemoved: "Removed",
          addFailed: "Failed to add",
          removeFailed: "Failed to remove",
          loadFailed: "Failed to load",
          networkError: "Network error",
        },
      };
      function t(key, ...args) {
        let s = (translations[lang] && translations[lang][key]) || key;
        args.forEach((a, i) => { s = s.split("{" + i + "}").join(a); });
        return s;
      }
      function applyI18n() {
        document.querySelectorAll("[data-i18n]").forEach((el) => {
          const key = el.dataset.i18n;
          if (el.tagName === "TITLE") document.title = t(key);
          else if ("i18nPlaceholder" in el.dataset) el.placeholder = t(key);
          else el.textContent = t(key);
        });
      }
      function toggleLang() {
        lang = lang === "zh-CN" ? "en" : "zh-CN";
        localStorage.setItem("lang", lang);
        applyI18n();
        loadIps();
      }

      function esc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      function escAttr(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }
      function toast(message, type = "info") {
        const el = document.createElement("div");
        el.className = "toast toast-" + type;
        el.textContent = message;
        $("toastContainer").appendChild(el);
        setTimeout(() => el.classList.add("toast-out"), 2800);
        setTimeout(() => el.remove(), 3100);
      }

      /* ── 账户 IP 黑名单（仅手动添加，无一键拉黑） ── */
      async function loadIps() {
        try {
          const res = await fetch("/account/ip-block");
          if (res.status === 401) { location.href = "/"; return; }
          if (!res.ok) { toast(t("loadFailed"), "error"); return; }
          const data = await res.json();
          const list = $("ipList");
          list.innerHTML = data.ips.length
            ? data.ips
                .map(
                  (r) =>
                    '<div class="ip-item"><span class="ip-text">' + esc(r.ip) + '</span>' +
                    '<button class="btn btn-danger btn-sm" data-ip="' + escAttr(r.ip) + '" onclick="removeIp(this.dataset.ip)">' + esc(t("remove")) + "</button></div>",
                )
                .join("")
            : '<div class="ip-empty">' + esc(t("emptyBlacklist")) + "</div>";
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }
      async function addIp() {
        const input = $("newIp");
        const ip = input.value.trim();
        try {
          const res = await fetch("/account/ip-block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast(res.status === 400 ? t("invalidIp") : data.error === "exists" ? t("ipExists") : data.error || t("addFailed"), "error");
            return;
          }
          toast(t("ipAdded") + ": " + ip, "success");
          input.value = "";
          loadIps();
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }
      async function removeIp(ip) {
        try {
          const res = await fetch("/account/ip-block?ip=" + encodeURIComponent(ip), { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { toast(data.error || t("removeFailed"), "error"); return; }
          toast(t("ipRemoved") + ": " + ip, "success");
          loadIps();
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }

      /* ── 修改密码（POST /auth/password） ── */
      const passOverlay = $("passOverlay"), oldPass = $("oldPass"), newPass = $("newPass"), newPass2 = $("newPass2");
      function openPasswordModal() {
        oldPass.value = ""; newPass.value = ""; newPass2.value = "";
        passOverlay.classList.remove("hidden");
        oldPass.focus();
      }
      function closePasswordModal() { passOverlay.classList.add("hidden"); }
      $("passCancel").onclick = closePasswordModal;
      passOverlay.onclick = (e) => { if (e.target === passOverlay) closePasswordModal(); };
      async function savePassword() {
        const n1 = newPass.value, n2 = newPass2.value;
        if (n1.length < 8) { toast(t("passTooShort"), "error"); return; }
        if (n1 !== n2) { toast(t("passMismatch"), "error"); return; }
        try {
          const res = await fetch("/auth/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPassword: oldPass.value, newPassword: n1 }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { toast(data.error || t("passFailed"), "error"); return; }
          toast(t("passChanged"), "success");
          setTimeout(() => { location.href = "/login"; }, 1200);
        } catch (e) {
          toast(t("networkError"), "error");
        }
      }
      $("passSave").onclick = savePassword;
      [oldPass, newPass, newPass2].forEach((el) => {
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") savePassword(); });
      });

      /* ── 退出登录 / 清除我的 ── */
      async function logout() {
        try { await fetch("/auth/logout", { method: "POST" }); } catch {}
        location.href = "/";
      }
      const modalOverlay = $("modalOverlay"), modalTitle = $("modalTitle"), modalBody = $("modalBody"), modalCancel = $("modalCancel"), modalConfirm = $("modalConfirm");
      function showModal(title, body, onConfirm) {
        modalTitle.textContent = title;
        modalBody.textContent = body;
        modalOverlay.classList.remove("hidden");
        const cleanup = () => { modalOverlay.classList.add("hidden"); modalConfirm.onclick = null; };
        modalCancel.onclick = cleanup;
        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) cleanup(); };
        modalConfirm.onclick = () => { cleanup(); onConfirm(); };
      }
      function showClearAllModal() {
        showModal(t("clearAllTitle"), t("clearAllBody"), deleteAll);
      }
      async function deleteAll() {
        toast(t("clearingAll"), "info");
        try {
          const res = await fetch("/messages", { method: "DELETE" });
          if (!res.ok) { toast(t("failedClear"), "error"); return; }
          toast(t("clearedAll"), "success");
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }

      /* ── init ── */
      $("userChip").textContent = ME.wxId + " · Lv" + ME.level;
      applyI18n();
      loadIps();
    </script>
  </body>
</html>`;
}
