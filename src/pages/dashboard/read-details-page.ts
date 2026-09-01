import type { ReadDetailsSession, ReadDetailsMeta } from "../types";
import { safeJson } from "../../utils";
import { frontendHelpers } from "../shared";
import { sharedStyle } from "../shared-style";
export function readDetailsPage(session: ReadDetailsSession, meta: ReadDetailsMeta): string {
  // 管理权限：消息发布者本人或管理员；匿名公开访问时两者均为 false
  const canManage = session.isAdmin === true || meta.isOwner === true;
  const isPublic = meta.isPublic === true;
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <title data-i18n="readDetails">Read Details</title>
    ${sharedStyle()}
    <style>
body {
  font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
  background: var(--bg);
  background-image: radial-gradient(1200px 500px at 80% -10%, rgba(37, 99, 235, 0.18), transparent 60%), radial-gradient(900px 400px at -10% 110%, rgba(59, 130, 246, 0.1), transparent 55%);
  color: var(--text);
  min-height: 100vh;
  min-height: 100dvh;
  padding: 2rem 1rem;
  padding-top: max(2rem, env(safe-area-inset-top));
  padding-bottom: max(2rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.header-left {
  min-width: 0;
}
.header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-strong);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
  transition: color 0.15s;
}
.back-link:hover {
  color: var(--text);
}
.back-link svg {
  width: 14px;
  height: 14px;
}
.header .subtitle {
  font-size: 0.85rem;
  color: var(--faint);
  margin-top: 0.2rem;
}
.msg-preview {
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: #7dd3fc;
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  word-break: break-word;
}
.header .flex {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
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
.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: var(--on-primary);
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
}
.btn-primary:hover {
  background: linear-gradient(135deg, var(--primary-hover), var(--primary));
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
  color: var(--muted);
  flex-wrap: wrap;
}
.stats .count {
  color: #7dd3fc;
  font-weight: 600;
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
}
.card {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1.25rem;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 30px rgba(2, 6, 23, 0.4);
}
.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-strong);
  margin-bottom: 0.35rem;
}
.card-hint {
  font-size: 0.78rem;
  color: var(--faint);
  line-height: 1.5;
  margin-bottom: 0.85rem;
}
.ip-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.85rem;
  max-height: 280px;
  overflow-y: auto;
}
.ip-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--surface);
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
  color: var(--border-strong);
  padding: 0.9rem 0.25rem;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: 8px;
}
.add-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.add-row input {
  flex: 1;
  min-width: 180px;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-size: 0.85rem;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s;
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
}
.add-row input:focus {
  border-color: var(--primary-light);
}
.btn-secondary {
  background: var(--border-strong);
  color: var(--text);
}
.btn-secondary:hover {
  background: var(--faint);
}
.btn-danger {
  background: var(--danger-strong);
  color: var(--on-primary);
}
.btn-danger:hover {
  background: var(--danger-hover);
}
.blocked-info {
  color: #a78bfa;
  font-size: 0.78rem;
  margin-left: 0.5rem;
}
.table-card {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow-x: auto;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 30px rgba(2, 6, 23, 0.4);
}
.ip-col {
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
  font-size: 0.78rem;
  color: #a78bfa;
}
.loc-col {
  color: #7dd3fc;
  font-size: 0.8rem;
}
.loc-text {
  color: #7dd3fc;
  font-size: 0.8rem;
}
.ts-col {
  color: var(--muted);
  white-space: nowrap;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
}
.pagination-info {
  font-size: 0.8rem;
  color: var(--muted);
  padding: 0.35rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  white-space: nowrap;
}
.pagination-info .count {
  color: #7dd3fc;
  font-weight: 600;
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
}
.repo-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 2rem;
  color: var(--border-strong);
  text-decoration: none;
  font-size: 0.75rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--surface);
  border-radius: 999px;
  transition: color 0.15s, background 0.15s;
}
.toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 100;
  max-width: min(92vw, 380px);
}
.toast {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.82rem;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  box-shadow: 0 6px 20px rgba(2, 6, 23, 0.5);
  animation: toast-in 0.2s ease-out;
}
.toast-error {
  border-color: var(--danger);
  color: var(--danger-text);
}
.toast-success {
  border-color: var(--ok);
  color: var(--ok-text);
}
.toast-out {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.3s, transform 0.3s;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: modal-fade-in 0.15s ease-out;
}
@keyframes modal-fade-in {
from {
opacity: 0;
}
to {
opacity: 1;
}
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.modal h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-strong);
  margin-bottom: 0.5rem;
}
.modal p {
  font-size: 0.875rem;
  color: var(--muted);
  margin-bottom: 1.25rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  max-height: 180px;
  overflow-y: auto;
}
.modal .actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.public-on {
  background: var(--ok);
  color: var(--on-primary);
  border: 1px solid var(--ok);
}
.public-on:hover {
  background: #047857;
}
@keyframes toast-in {
from {
opacity: 0;
transform: translateY(6px);
}
to {
opacity: 1;
transform: translateY(0);
}
}
@media (max-width: 768px) {
  .container {
    max-width: 100%;
  }
}
@media (max-width: 640px) {
  .btn {
    min-height: 40px;
  }
  .table-card {
    padding: 0.5rem;
  }
  .ip-col, .ts-col {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .loc-col {
    text-align: right;
  }
  .pagination {
    flex-direction: column;
  }
  .pagination-info {
    text-align: center;
    width: 100%;
  }
  .pagination .btn {
    flex: 1;
  }
  .modal {
    max-width: 94vw;
    width: 94vw;
    padding: 1.25rem;
  }
  .modal .actions {
    flex-direction: column-reverse;
  }
  .modal .actions .btn {
    width: 100%;
    justify-content: center;
    min-height: 44px;
  }
}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="header-left">
          <a class="back-link" href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span data-i18n="backToMessages">Messages</span>
          </a>
          <h1 data-i18n="readDetails">Read Details</h1>
          <div class="msg-preview" id="msgPreview"></div>
        </div>
        <div class="flex">
          ${session.wxId ? '<span class="user-chip" id="userChip"></span>' : ""}
          ${canManage
            ? `<button class="btn ${isPublic ? "public-on" : "btn-outline"} btn-sm" id="publicToggle" onclick="togglePublic()"></button>
          <button class="btn btn-danger btn-sm" id="deleteMsgBtn" onclick="showDeleteConfirm()" data-i18n="deleteMessage">Delete</button>`
            : ""}
          ${session.wxId ? '<a class="btn btn-outline btn-sm" href="/account" data-i18n="accountSettings">Account Settings</a>' : ""}
          <button class="lang-toggle" onclick="toggleLang()">中 / EN</button>
          <button class="theme-toggle" onclick="toggleTheme()"></button>
        </div>
      </div>

      ${canManage
        ? `<div class="card">
        <div class="card-title" data-i18n="msgIpBlacklist">Message IP Blacklist</div>
        <div class="card-hint" data-i18n="msgBlacklistHint">Blacklisted IPs are filtered out by the read details API and never returned (records kept in database).</div>
        <div class="ip-list" id="blockIpList"></div>
        <div class="add-row">
          <input id="blockNewIp" type="text" placeholder="e.g. 203.0.113.7" data-i18n="ipPlaceholder" data-i18n-placeholder />
          <button class="btn btn-primary" onclick="addBlockIp()" data-i18n="addToBlacklist">Add to Blacklist</button>
          <button class="btn btn-secondary" onclick="blockCurrentIp()" data-i18n="blockMyIp">Block My IP</button>
        </div>
      </div>`
        : ""}

      <div class="table-card">
        <div class="stats">
          <span
            ><span class="count" id="readCount">0</span
            ><span data-i18n="totalReads"> reads</span
            ><span class="hidden blocked-info" id="blockedInfo"></span></span
          >
          <span class="pagination-info hidden" id="pageInfo"></span>
        </div>
        <table>
          <thead>
            <tr>
              <th data-i18n="ipAddress">IP Address</th>
              <th data-i18n="location">Location</th>
              <th data-i18n="readAt">Read At</th>
            </tr>
          </thead>
          <tbody id="readTbody"></tbody>
        </table>
      </div>

      <div class="pagination">
        <button class="btn btn-outline btn-sm" id="prevBtn" onclick="goPage(-1)" data-i18n="prevPage">Previous</button>
        <span class="pagination-info" id="pageInfoBottom"></span>
        <button class="btn btn-outline btn-sm" id="nextBtn" onclick="goPage(1)" data-i18n="nextPage">Next</button>
      </div>
    </div>

    ${canManage
      ? `
    <div id="confirmModal" class="modal-overlay hidden">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmDeleteTitle">
        <h3 id="confirmDeleteTitle" data-i18n="confirmDelete">Delete this message?</h3>
        <p id="confirmDeleteBody"></p>
        <div class="actions">
          <button class="btn btn-secondary" onclick="closeDeleteConfirm()" data-i18n="cancel">Cancel</button>
          <button class="btn btn-danger" id="confirmDeleteBtn" onclick="doDeleteMessage()" data-i18n="delete">Delete</button>
        </div>
      </div>
    </div>
    ` : ""}

    <a class="repo-footer" href="https://github.com/lie-jiu/wekit-read-receipts-server" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>lie-jiu · GitHub</span>
    </a>

    <div id="toastContainer" class="toast-container"></div>

    <script>
      ${frontendHelpers()}
      const ME = ${safeJson({
        wxId: session.wxId,
        level: session.level,
        isAdmin: session.isAdmin === true,
        geo: session.geo === true,
        geoQuota: session.geoQuota || 0,
        geoRemaining: session.geoRemaining || 0,
      })};
      const DETAIL = ${safeJson({
        id: meta.id,
        content: meta.content,
        isOwner: meta.isOwner === true,
        isPublic: meta.isPublic === true,
      })};
      // 浏览器端管理权限判定（与服务端 canManage 一致）：消息发布者本人或管理员
      const CAN_MANAGE = ME.isAdmin === true || DETAIL.isOwner === true;
      const readTbody = document.getElementById("readTbody");
      const readCount = document.getElementById("readCount");
      const pageInfoEl = document.getElementById("pageInfo");
      const pageInfoBottom = document.getElementById("pageInfoBottom");
      const prevBtn = document.getElementById("prevBtn");
      const nextBtn = document.getElementById("nextBtn");
      const toastContainer = document.getElementById("toastContainer");
      const PAGE_SIZE = 50;
      let page = 1;
      let total = 0;

      /* ── i18n ── */
      let lang = localStorage.getItem("lang") || "zh-CN";

      const translations = {
        "zh-CN": {
          title: "已读详情",
          readDetails: "已读详情",
          backToMessages: "消息列表",
          ipAddress: "IP 地址",
          location: "地区",
          readAt: "读取时间",
          locate: "定位",
          locating: "定位中…",
          locateFailed: "定位失败",
          noGeo: "无法定位",
          ipv6NoGeo: "IPv6 不支持定位",
          geoQuotaExhausted: "今日定位次数已用完",
          geoRemain: "定位剩余 {0} 次",
          loginRequired: "未登录，请先登录",
          noReads: "暂无读取记录",
          loading: "加载中...",
          networkError: "网络错误",
          prevPage: "上一页",
          nextPage: "下一页",
          themeLight: "浅色",
          themeDark: "深色",
          pageIndicator: "第 {0} / {1} 页",
          totalReads: "条已读记录",
          readsFor: "「{0}」的已读记录",
          accountSettings: "账户设置",
          msgIpBlacklist: "本消息 IP 黑名单",
          msgBlacklistHint: "命中黑名单的 IP 将被该消息的已读详情接口过滤，不再返回其任何数据（数据库记录保留）。",
          ipPlaceholder: "输入 IP，如 203.0.113.7",
          addToBlacklist: "加入黑名单",
          blockMyIp: "一键拉黑我的 IP",
          emptyBlacklist: "黑名单为空",
          remove: "移除",
          invalidIp: "IP 格式无效",
          ipExists: "该 IP 已在黑名单中",
          ipAdded: "已加入黑名单",
          ipRemoved: "已移除",
          addFailed: "添加失败",
          removeFailed: "移除失败",
          loadFailed: "加载失败",
          hiddenCount: "已过滤 {0} 条黑名单 IP（接口不返回）",
          deleteMessage: "删除消息",
          confirmDelete: "删除这条消息？",
          confirmDeleteBody: "将永久删除这条消息及其全部已读记录，此操作不可撤销。",
          cancel: "取消",
          delete: "删除",
          deleteSuccess: "消息已删除",
          deleteFailed: "删除失败",
          makePublicOn: "公开详情：开",
          makePublicOff: "公开详情：关",
          publicHint: "开启后任何人（含未登录用户）都能查看此消息详情",
          publicUpdated: "公开状态已更新",
          publicUpdateFailed: "更新公开状态失败",
        },
        en: {
          title: "Read Details",
          readDetails: "Read Details",
          backToMessages: "Messages",
          ipAddress: "IP Address",
          location: "Location",
          readAt: "Read At",
          locate: "Locate",
          locating: "Locating…",
          locateFailed: "Locate failed",
          noGeo: "Unresolved",
          ipv6NoGeo: "IPv6 not supported",
          geoQuotaExhausted: "Daily locate quota used up",
          geoRemain: "Locate left {0}",
          loginRequired: "Please log in first",
          noReads: "No reads yet",
          loading: "Loading...",
          networkError: "Network error",
          prevPage: "Prev",
          nextPage: "Next",
          themeLight: "Light",
          themeDark: "Dark",
          pageIndicator: "Page {0} / {1}",
          totalReads: "read records",
          readsFor: 'Reads for: "{0}"',
          accountSettings: "Account Settings",
          msgIpBlacklist: "Message IP Blacklist",
          msgBlacklistHint: "Blacklisted IPs are filtered out by the read details API and never returned (records kept in database).",
          ipPlaceholder: "Enter an IP, e.g. 203.0.113.7",
          addToBlacklist: "Add to Blacklist",
          blockMyIp: "Block My IP",
          emptyBlacklist: "Blacklist is empty",
          remove: "Remove",
          invalidIp: "Invalid IP format",
          ipExists: "IP already blacklisted",
          ipAdded: "Added to blacklist",
          ipRemoved: "Removed",
          addFailed: "Failed to add",
          removeFailed: "Failed to remove",
          loadFailed: "Failed to load",
          hiddenCount: "{0} blacklisted IPs filtered (not returned)",
          deleteMessage: "Delete",
          confirmDelete: "Delete this message?",
          confirmDeleteBody:
            "This will permanently delete this message and all of its read records. This action cannot be undone.",
          cancel: "Cancel",
          delete: "Delete",
          deleteSuccess: "Message deleted",
          deleteFailed: "Failed to delete",
          makePublicOn: "Public: On",
          makePublicOff: "Public: Off",
          publicHint: "When enabled, anyone (including guests) can view this message's details",
          publicUpdated: "Public status updated",
          publicUpdateFailed: "Failed to update public status",
        },
      };

                  function toggleLang() {
        lang = lang === "zh-CN" ? "en" : "zh-CN";
        localStorage.setItem("lang", lang);
        applyI18n();
        updatePublicBtn();
        setLabels();
        renderPageInfo();
        if (CAN_MANAGE) loadBlocks();
        loadData();
      }

      /* ── toast ── */
      function toast(message, type = "info") {
        const el = document.createElement("div");
        el.className = \`toast toast-\${type}\`;
        el.textContent = message;
        toastContainer.appendChild(el);
        setTimeout(() => {
          el.classList.add("toast-out");
        }, 2800);
        setTimeout(() => el.remove(), 3100);
      }

      /* ── utils ── */
                  /* 服务端时间戳为 UTC "YYYY-MM-DD HH:MM:SS"；中文界面显示北京时间(+8)，英文界面显示 UTC */
      function fmtTs(s) {
        const m = /^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2})$/.exec(
          String(s || "")
        );
        if (!m) return String(s || "");
        const offset = lang === "zh-CN" ? 8 : 0;
        const d = new Date(
          Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + offset * 3600 * 1000
        );
        const p = (n) => String(n).padStart(2, "0");
        return \`\${d.getUTCFullYear()}-\${p(d.getUTCMonth() + 1)}-\${p(d.getUTCDate())} \${p(
          d.getUTCHours()
        )}:\${p(d.getUTCMinutes())}:\${p(d.getUTCSeconds())}\`;
      }

      /* ── geo / locate ── */
      function locParts(r) {
        const zh = lang === "zh-CN";
        return [
          zh ? r.country : r.countryEn,
          zh ? r.region : r.regionEn,
          zh ? r.city : r.cityEn,
          zh ? r.isp : r.ispEn,
        ].filter(Boolean);
      }

      function updateGeoChip() {
        const el = document.getElementById("userChip");
        if (!el) return;
        el.textContent =
          ME.wxId + " · Lv" + ME.level + (ME.geo ? " · " + t("geoRemain", ME.geoRemaining) : "");
      }

      async function locateRead(btn) {
        if (btn.disabled) return;
        if (!ME.wxId) {
          toast(t("loginRequired"), "error");
          return;
        }
        btn.disabled = true;
        const id = btn.dataset.id;
        const original = btn.textContent;
        btn.textContent = t("locating");
        try {
          const res = await fetch("/reads/" + encodeURIComponent(id) + "/geo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip: btn.dataset.ip }),
          });
          if (res.status === 401) {
            location.href = "/";
            return;
          }
          const data = await res.json();
          if (data.error === "geo_quota_exceeded") {
            ME.geoRemaining = 0;
            updateGeoChip();
            const span = document.createElement("span");
            span.className = "loc-text";
            span.textContent = t("geoQuotaExhausted");
            btn.replaceWith(span);
            toast(t("geoQuotaExhausted"), "error");
            return;
          }
          if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
          if (typeof data.remaining === "number") {
            ME.geoRemaining = data.remaining;
            updateGeoChip();
          }
          const span = document.createElement("span");
          span.className = "loc-text";
          span.textContent = locParts(data).join(" ") || t("noGeo");
          btn.replaceWith(span);
        } catch (e) {
          btn.textContent = t("locateFailed");
          btn.disabled = false;
          setTimeout(() => {
            if (!btn.parentNode) return;
            btn.textContent = original;
          }, 2000);
        }
      }

      /* ── render ── */
      function renderRows(reads) {
        if (!reads || !reads.length) {
          readTbody.innerHTML =
            '<tr class="empty-row"><td colspan="3">' + esc(t("noReads")) + "</td></tr>";
          return;
        }
        readTbody.innerHTML = reads
          .map((r) => {
            const parts = locParts(r);
            const isV6 = r.ip.indexOf(":") !== -1;
            const cell = r.located
              ? '<span class="loc-text">' + esc(parts.join(" ") || t("noGeo")) + "</span>"
              : ME.geo && !isV6 && (!ME.wxId || ME.geoRemaining > 0)
                ? '<button class="btn btn-outline btn-sm" data-id="' +
                  DETAIL.id +
                  '" data-ip="' +
                  escAttr(r.ip) +
                  '" onclick="locateRead(this)">' +
                  esc(t("locate")) +
                  "</button>"
                : '<span class="loc-text">' +
                  esc(
                    t(
                      isV6
                        ? "ipv6NoGeo"
                        : ME.wxId && ME.geoRemaining <= 0
                          ? "geoQuotaExhausted"
                          : "noGeo",
                    ),
                  ) +
                  "</span>";
            return (
              "<tr>" +
              '<td class="ip-col">' +
              esc(r.ip) +
              "</td>" +
              '<td class="loc-col">' +
              cell +
              "</td>" +
              '<td class="ts-col">' +
              esc(fmtTs(r.timestamp)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
        setLabels();
      }

      function setLabels() {
        readTbody.querySelectorAll("tr:not(.empty-row)").forEach((tr) => {
          const labels = [t("ipAddress"), t("location"), t("readAt")];
          Array.from(tr.cells).forEach((td, i) => {
            if (labels[i]) td.setAttribute("data-label", labels[i]);
          });
        });
      }

      function totalPages() {
        return total ? Math.ceil(total / PAGE_SIZE) : 1;
      }

      function renderPageInfo() {
        const tp = totalPages();
        pageInfoEl.textContent = t("pageIndicator", page, tp);
        pageInfoBottom.textContent = t("pageIndicator", page, tp);
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= tp;
      }

      async function goPage(delta) {
        const next = page + delta;
        if (next < 1 || (total && next > totalPages())) return;
        page = next;
        await loadData();
      }

      async function loadData() {
        readTbody.innerHTML =
          '<tr class="empty-row"><td colspan="3">' + esc(t("loading")) + "</td></tr>";
        try {
          const url =
            "/reads/" +
            encodeURIComponent(DETAIL.id) +
            "/data?page=" +
            page +
            "&pageSize=" +
            PAGE_SIZE;
          const res = await fetch(url);
          if (res.status === 401) {
            location.href = "/";
            return;
          }
          if (!res.ok) {
            readTbody.innerHTML =
              '<tr class="empty-row"><td colspan="3">' + esc(t("networkError")) + "</td></tr>";
            return;
          }
          const data = await res.json();
          // readCount 显示真实总数；分页基于后端过滤后的可见行数（黑名单行 API 已不返回）
          readCount.textContent = data.total;
          total = typeof data.visibleTotal === "number" ? data.visibleTotal : data.total;
          if (data.page) page = data.page;
          renderRows(data.reads);
          renderBlockedInfo(data.blockedCount || 0);
          renderPageInfo();
        } catch (e) {
          readTbody.innerHTML =
            '<tr class="empty-row"><td colspan="3">' +
            esc(t("networkError")) +
            "</td></tr>";
          toast(t("networkError") + ": " + e.message, "error");
        }
      }

      /* ── 本消息 IP 黑名单（含一键拉黑当前访问 IP） ── */
      function renderBlockedInfo(n) {
        const el = document.getElementById("blockedInfo");
        if (!el) return;
        el.textContent = n > 0 ? t("hiddenCount", n) : "";
        el.classList.toggle("hidden", n <= 0);
      }

      async function loadBlocks() {
        try {
          const res = await fetch("/reads/" + encodeURIComponent(DETAIL.id) + "/block");
          if (res.status === 401) { location.href = "/"; return; }
          if (!res.ok) { toast(t("loadFailed"), "error"); return; }
          const data = await res.json();
          document.getElementById("blockIpList").innerHTML = data.ips.length
            ? data.ips
                .map(
                  (r) =>
                    '<div class="ip-item"><span class="ip-text">' + esc(r.ip) + '</span>' +
                    '<button class="btn btn-danger btn-sm" data-ip="' + escAttr(r.ip) + '" onclick="removeBlockIp(this.dataset.ip)">' + esc(t("remove")) + "</button></div>",
                )
                .join("")
            : '<div class="ip-empty">' + esc(t("emptyBlacklist")) + "</div>";
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }

      async function postBlock(payload) {
        try {
          const res = await fetch("/reads/" + encodeURIComponent(DETAIL.id) + "/block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast(res.status === 400 ? t("invalidIp") : data.error === "exists" ? t("ipExists") : data.error || t("addFailed"), "error");
            return false;
          }
          toast(t("ipAdded") + ": " + data.ip, "success");
          loadBlocks();
          loadData();
          return true;
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
          return false;
        }
      }

      async function addBlockIp() {
        const input = document.getElementById("blockNewIp");
        const ip = input.value.trim();
        if (await postBlock({ ip })) input.value = "";
      }

      async function blockCurrentIp() {
        await postBlock({ action: "current" });
      }

      async function removeBlockIp(ip) {
        try {
          const res = await fetch("/reads/" + encodeURIComponent(DETAIL.id) + "/block?ip=" + encodeURIComponent(ip), { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { toast(data.error || t("removeFailed"), "error"); return; }
          toast(t("ipRemoved") + ": " + ip, "success");
          loadBlocks();
          loadData();
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }

      /* ── 公开详情开关（owner 或管理员可切换；默认关闭） ── */
      function updatePublicBtn() {
        const btn = document.getElementById("publicToggle");
        if (!btn) return;
        btn.textContent = DETAIL.isPublic ? t("makePublicOn") : t("makePublicOff");
        btn.title = t("publicHint");
        btn.classList.toggle("public-on", DETAIL.isPublic);
        btn.classList.toggle("btn-outline", !DETAIL.isPublic);
      }

      async function togglePublic() {
        const btn = document.getElementById("publicToggle");
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        const next = !DETAIL.isPublic;
        try {
          const res = await fetch("/reads/" + encodeURIComponent(DETAIL.id) + "/public", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public: next }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 401) { location.href = "/"; return; }
          if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
          DETAIL.isPublic = data.public === true;
          updatePublicBtn();
          toast(t("publicUpdated"), "success");
        } catch (e) {
          toast(t("publicUpdateFailed") + ": " + e.message, "error");
        } finally {
          btn.disabled = false;
        }
      }

      /* ── 删除消息（owner 或管理员；确认弹窗防误删） ── */
      let deleteKeyCleanup = null;
      function showDeleteConfirm() {
        document.getElementById("confirmDeleteBody").textContent =
          t("confirmDeleteBody") + "\\n\\n" + DETAIL.content;
        const modal = document.getElementById("confirmModal");
        modal.classList.remove("hidden");
        document.getElementById("confirmDeleteBtn").disabled = false;
        deleteKeyCleanup = bindModalKeys(modal, closeDeleteConfirm);
      }

      function closeDeleteConfirm() {
        const modal = document.getElementById("confirmModal");
        modal.classList.add("hidden");
        document.getElementById("confirmDeleteBtn").disabled = false;
        if (deleteKeyCleanup) { deleteKeyCleanup(); deleteKeyCleanup = null; }
      }

      async function doDeleteMessage() {
        const btn = document.getElementById("confirmDeleteBtn");
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const res = await fetch("/reads/" + encodeURIComponent(DETAIL.id), { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (res.status === 401) { location.href = "/"; return; }
          if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
          toast(t("deleteSuccess"), "success");
          setTimeout(() => { location.href = "/"; }, 600);
        } catch (e) {
          toast(t("deleteFailed") + ": " + e.message, "error");
          btn.disabled = false;
        }
      }

      /* ── init ── */
      document.getElementById("msgPreview").textContent = t("readsFor", DETAIL.content);
      updateGeoChip();
      initTheme();
      applyI18n();
      updatePublicBtn();
      if (CAN_MANAGE) loadBlocks();
      loadData();
    </script>
  </body>
</html>
`;
}
