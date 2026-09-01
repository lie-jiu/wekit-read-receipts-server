import type { DashboardSession } from "../types";
import { safeJson } from "../../utils";
import { frontendHelpers } from "../shared";
import { sharedStyle } from "../shared-style";
export function htmlPage(session: DashboardSession): string { return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <title data-i18n="title">Read Receipts</title>
    ${sharedStyle()}
    <style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
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
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-strong);
}
.header .subtitle {
  font-size: 0.85rem;
  color: var(--faint);
}
.controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem 1rem;
}
.controls input {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-size: 0.85rem;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s;
  min-width: 220px;
}
.controls input:focus {
  border-color: var(--primary-light);
}
.controls input::placeholder {
  color: var(--border-strong);
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
  transition: background 0.15s, box-shadow 0.15s;
}
.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
}
.btn-primary:hover {
  background: var(--primary-hover);
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
.table-wrapper {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
}
.msg-col {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-col {
  color: var(--muted);
  white-space: nowrap;
}
.clickable-row {
  cursor: pointer;
}
/* 行是整行宽，焦点环用内缩画法，否则会被表格容器的 overflow 裁掉 */
.clickable-row:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}
.leaderboard {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
  margin-bottom: 1rem;
}
.leaderboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.leaderboard-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.scope-btn {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border-strong);
}
.scope-btn:hover {
  background: var(--surface);
  color: var(--text);
}
.scope-btn.scope-active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}
.rank-col {
  font-weight: 600;
  color: var(--muted);
  width: 3.5rem;
}
.rank-col.rank-1 {
  color: #fbbf24;
}
.rank-col.rank-2 {
  color: var(--text-soft);
}
.rank-col.rank-3 {
  color: #d97706;
}
.wxid-col {
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
  font-size: 0.78rem;
}
.lb-msg-col {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lb-count-col {
  color: #60a5fa;
  font-weight: 600;
}
.row-me td {
  background: #16324f !important;
  color: #93c5fd;
}
.stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--faint);
}
.stats .count {
  color: var(--muted);
  font-weight: 600;
}
.pager {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.page-info {
  font-size: 0.78rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pager .btn[disabled] {
  opacity: 0.45;
  cursor: default;
  transform: none;
}
.toast-container {
  position: fixed;
  top: max(1rem, env(safe-area-inset-top));
  right: max(1rem, env(safe-area-inset-right));
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  animation: toast-in 0.25s ease-out;
  max-width: 360px;
}
.toast-success {
  background: var(--ok-bg);
  color: var(--ok-text);
  border: 1px solid var(--ok);
}
.toast-error {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger);
}
.toast-info {
  background: var(--info-bg);
  color: var(--info-text);
  border: 1px solid var(--primary);
}
@keyframes toast-in {
from {
opacity: 0;
translate: 0 -0.5rem;
}
to {
opacity: 1;
translate: 0;
}
}
.toast-out {
  animation: toast-out 0.2s ease-in forwards;
}
@keyframes toast-out {
to {
opacity: 0;
translate: 0 -0.5rem;
}
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
  margin-bottom: 0.5rem;
}
.modal p {
  font-size: 0.875rem;
  color: var(--muted);
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
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-size: 0.9rem;
  background: var(--bg);
  color: var(--text);
  outline: none;
  margin-bottom: 0.6rem;
  transition: border-color 0.15s;
}
.modal-form input:focus {
  border-color: var(--primary-light);
}
.flex {
  display: flex;
  gap: 0.5rem;
}
.repo-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--faint);
  text-decoration: none;
  margin-top: 2rem;
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}
@media (max-width: 768px) {
  .container {
    max-width: 100%;
  }
}
@media (max-width: 640px) {
  .controls {
    flex-direction: column;
    align-items: stretch;
  }
  .controls input {
    min-width: 0;
    width: 100%;
    min-height: 44px;
  }
  .leaderboard-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .leaderboard-header .flex {
    display: grid;
    width: 100%;
  }
  .leaderboard-header .flex:first-child {
    grid-template-columns: repeat(3, 1fr);
  }
  .leaderboard-header .flex:last-child {
    grid-template-columns: repeat(2, 1fr);
  }
  .scope-btn {
    min-height: 38px;
  }
  .stats {
    flex-direction: column;
    gap: 0.3rem;
    text-align: center;
  }
  .btn {
    min-height: 40px;
  }
  .table-wrapper, .leaderboard {
    padding: 0.5rem;
  }
  .msg-col, .lb-msg-col {
    max-width: none;
    white-space: normal;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .ts-col, .wxid-col, .lb-count-col, .reads-col {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .rank-col {
    width: auto;
  }
  .row-me td {
    background: transparent !important;
  }
  .row-me {
    border-color: var(--primary);
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
  .modal-form input {
    min-height: 44px;
  }
}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <h1 data-i18n="title">Read Receipts</h1>
          <div class="subtitle" data-i18n="subtitle">Tracking pixel hits</div>
        </div>
        <div class="flex">
          <span class="user-chip" id="userChip"></span>
          <a class="btn btn-primary btn-sm" href="/rank" data-i18n="leaderboard">
            Leaderboard
          </a>
          <a class="btn btn-outline btn-sm" href="/account" data-i18n="accountSettings">
            Account Settings
          </a>
          <button class="lang-toggle" onclick="toggleLang()">中 / EN</button>
          <button class="theme-toggle" onclick="toggleTheme()"></button>
          <button
            class="btn btn-outline btn-sm"
            onclick="loadAll()"
            data-i18n="refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      <div class="controls">
      <input
        id="msgFilter"
        type="text"
        data-i18n="filterMsg"
        data-i18n-placeholder
        placeholder="Filter by message text..."
      />
      </div>

      <div class="table-wrapper">
        <div class="stats">
          <span
            ><span class="count" id="recordCount">0</span
            ><span data-i18n="records"> records</span></span
          >
          <span class="pager">
            <button class="btn btn-outline btn-sm" id="prevPageBtn" onclick="goPage(-1)" data-i18n="prevPage">Prev</button>
            <span id="pageInfo" class="page-info" role="status"></span>
            <button class="btn btn-outline btn-sm" id="nextPageBtn" onclick="goPage(1)" data-i18n="nextPage">Next</button>
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th data-i18n="message">Message</th>
              <th data-i18n="reads">Reads</th>
              <th data-i18n="timestamp">Timestamp</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>

    </div>

    <a class="repo-footer" href="https://github.com/lie-jiu/wekit-read-receipts-server" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>lie-jiu · GitHub</span>
    </a>

    <div id="toastContainer" class="toast-container"></div>

    <script>
      ${frontendHelpers()}
      const ME = ${safeJson({ wxId: session.wxId, level: session.level, geo: session.geo === true, geoQuota: session.geoQuota || 0, geoRemaining: session.geoRemaining || 0, messageQuota: session.messageQuota || 0, retentionMonths: session.retentionMonths || 0 })};
      const tbody = document.getElementById("tbody");
      const recordCount = document.getElementById("recordCount");
      const prevPageBtn = document.getElementById("prevPageBtn");
      const nextPageBtn = document.getElementById("nextPageBtn");
      const pageInfo = document.getElementById("pageInfo");
      const toastContainer = document.getElementById("toastContainer");

      /* ── i18n ── */
      let lang = localStorage.getItem("lang") || "zh-CN";

      const translations = {
        "zh-CN": {
          title: "已读追踪",
          subtitle: "已发送消息的已读人数",
          refresh: "刷新",
          accountSettings: "账户设置",
          clearAll: "清除我的",
          changePassword: "修改密码",
          logout: "退出登录",
          filterMsg: "按消息内容过滤...",
          message: "消息",
          reads: "已读人数",
          timestamp: "时间",
          records: " 条消息",
          pageIndicator: "第 {0} / {1} 页",
          prevPage: "上一页",
          nextPage: "下一页",
          themeLight: "浅色",
          themeDark: "深色",
          confirm: "确认",
          cancel: "取消",
          delete: "删除",
          save: "保存",
          currentPassword: "当前密码",
          newPassword: "新密码（至少 8 位）",
          confirmPassword: "确认新密码",
          passTooShort: "密码至少 8 位",
          passMismatch: "两次输入的新密码不一致",
          passChanged: "密码已修改",
          passFailed: "修改密码失败",
          clearAllTitle: "清除我的所有记录？",
          clearAllBody: "这将永久删除你账号下的所有消息及其读取记录。",
          loading: "加载中...",
          noRecords: "暂无消息",
          leaderboard: "排行榜",
          regBoard: "注册榜",
          readBoard: "已读榜",
          msgBoard: "消息榜",
          owner: "归属用户",
          daily: "日榜",
          total: "总榜",
          rank: "排名",
          account: "账号",
          messageCount: "消息数",
          leaderboardEmpty: "暂无数据",
          networkError: "网络错误",
          clearingAll: "正在清除我的记录…",
          clearedAll: "已清除我的所有记录",
          failedClear: "清除记录失败",
          readDetails: "已读详情",
          ipAddress: "IP 地址",
          location: "地区",
          readAt: "读取时间",
          locate: "定位",
          locating: "定位中…",
          locateFailed: "定位失败",
          noGeo: "无法定位",
          ipv6NoGeo: "IPv6 不支持定位",
          geoQuotaExhausted: "定位次数已用尽",
          geoRemain: "定位剩余 {0} 次",
          noReads: "暂无读取记录",
          close: "关闭",
          readsFor: "「{0}」的已读记录",
          quotaHint: "等级 {0}：最多保留 {1} 条消息，可追溯 {2} 个月。超出将自动删除最早的消息。",
          unlimited: "不限",
        },
        en: {
          title: "Read Receipts",
          subtitle: "Read counts of sent messages",
          refresh: "Refresh",
          accountSettings: "Account Settings",
          clearAll: "Clear Mine",
          changePassword: "Change Password",
          logout: "Logout",
          filterMsg: "Filter by message text...",
          message: "Message",
          reads: "Reads",
          timestamp: "Timestamp",
          records: " messages",
          pageIndicator: "Page {0} / {1}",
          prevPage: "Prev",
          nextPage: "Next",
          themeLight: "Light",
          themeDark: "Dark",
          confirm: "Confirm",
          cancel: "Cancel",
          delete: "Delete",
          save: "Save",
          currentPassword: "Current password",
          newPassword: "New password (min 8 chars)",
          confirmPassword: "Confirm new password",
          passTooShort: "Password must be at least 8 characters",
          passMismatch: "New passwords do not match",
          passChanged: "Password updated",
          passFailed: "Failed to update password",
          clearAllTitle: "Clear all my records?",
          clearAllBody:
            "This will permanently delete all your messages and their reads.",
          loading: "Loading...",
          noRecords: "No messages found",
          leaderboard: "Leaderboard",
          regBoard: "Reg",
          readBoard: "Reads",
          msgBoard: "Messages",
          owner: "Owner",
          daily: "Daily",
          total: "Overall",
          rank: "Rank",
          account: "Account",
          messageCount: "Messages",
          leaderboardEmpty: "No data yet",
          networkError: "Network error",
          clearingAll: "Clearing my records…",
          clearedAll: "All my records cleared",
          failedClear: "Failed to clear records",
          readDetails: "Read Details",
          ipAddress: "IP Address",
          location: "Location",
          readAt: "Read At",
          locate: "Locate",
          locating: "Locating…",
          locateFailed: "Locate failed",
          noGeo: "Unresolved",
          ipv6NoGeo: "IPv6 not supported",
          geoQuotaExhausted: "Locate quota exhausted",
          geoRemain: "Locate left {0}",
          noReads: "No reads yet",
          close: "Close",
          readsFor: 'Reads for: "{0}"',
          quotaHint:
            "Level {0}: keep up to {1} messages for {2} months. Registering more auto-removes the oldest.",
          unlimited: "Unlimited",
        },
      };

                  function toggleLang() {
        lang = lang === "zh-CN" ? "en" : "zh-CN";
        localStorage.setItem("lang", lang);
        applyI18n();
        setLabels();
        loadAll();
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

      /* ── fetch helpers ── */
      /* 分页：每页 10 条。总数来自 X-Total-Count 响应头，避免再发一次聚合请求。
         搜索/刷新重置到第一页，翻页只改 offset 不改过滤条件。 */
      const PAGE_SIZE = 10;
      let pageOffset = 0;
      let totalCount = 0;

      function pageUrl() {
        const u = new URL(currentFilterUrl, location.origin);
        u.searchParams.set("limit", String(PAGE_SIZE));
        u.searchParams.set("offset", String(pageOffset));
        return u.pathname + u.search;
      }

      async function loadAll() {
        const q = document.getElementById("msgFilter").value.trim();
        currentFilterUrl = "/messages" + (q ? "?q=" + encodeURIComponent(q) : "");
        pageOffset = 0;
        await fetchData(pageUrl());
      }

      function goPage(delta) {
        const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        const next = Math.min(Math.max(pageOffset / PAGE_SIZE + delta, 0), pages - 1);
        if (next * PAGE_SIZE === pageOffset) return;
        pageOffset = next * PAGE_SIZE;
        fetchData(pageUrl());
      }

      function updatePager() {
        const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        const cur = Math.floor(pageOffset / PAGE_SIZE) + 1;
        pageInfo.textContent = t("pageIndicator", cur, pages);
        prevPageBtn.disabled = cur <= 1;
        nextPageBtn.disabled = cur >= pages;
      }

      /* 移动端卡片布局的列标签（跟随当前语言） */
      function setLabels() {
        const apply = (tbodyEl, labels) => {
          tbodyEl.querySelectorAll("tr:not(.empty-row)").forEach((tr) => {
            Array.from(tr.cells).forEach((td, i) => {
              if (labels[i]) td.setAttribute("data-label", labels[i]);
            });
          });
        };
        apply(tbody, [t("message"), t("reads"), t("timestamp")]);
      }

      async function fetchData(url) {
        tbody.innerHTML =
          '<tr class="empty-row"><td colspan="3">' +
          esc(t("loading")) +
          "</td></tr>";
        recordCount.textContent = "…";
        try {
          const res = await fetch(url);
          if (res.status === 401) {
            location.href = "/";
            return;
          }
          if (!res.ok) {
            let detail = "";
            try {
              const err = await res.json();
              detail = err.error || JSON.stringify(err);
            } catch {
              detail = await res.text();
            }
            if (detail.length > 300) detail = detail.slice(0, 300) + "…";
            tbody.innerHTML = \`<tr class="empty-row"><td colspan="3">HTTP \${res.status}: \${esc(detail)}</td></tr>\`;
            recordCount.textContent = "0";
            totalCount = 0;
            updatePager();
            toast(\`HTTP \${res.status}: \${detail}\`, "error");
            return;
          }
          const data = await res.json();
          const rawTotal = res.headers.get("X-Total-Count");
          totalCount = rawTotal !== null ? Number(rawTotal) : pageOffset + data.length;
          recordCount.textContent = totalCount;
          updatePager();
          if (!data.length) {
            tbody.innerHTML =
              '<tr class="empty-row"><td colspan="3">' +
              esc(t("noRecords")) +
              "</td></tr>";
            return;
          }

          tbody.innerHTML = data
            .map(
              (r) => \`<tr class="clickable-row" role="link" tabindex="0" data-href="/reads/\${escAttr(encodeURIComponent(r.id))}">
      <td class="msg-col">\${esc(r.content)}</td>
      <td class="reads-col">\${esc(r.reads)}</td>
      <td class="ts-col">\${esc(fmtTs(r.timestamp))}</td>
    </tr>\`,
            )
            .join("");
        } catch (e) {
          tbody.innerHTML =
            '<tr class="empty-row"><td colspan="3">' +
            esc(t("networkError")) +
            "</td></tr>";
          toast(t("networkError") + ": " + e.message, "error");
        }
        setLabels();
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

      /* ── keyboard ── */
      let filterTimer = null;
      document.getElementById("msgFilter").addEventListener("input", () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(loadAll, 300);
      });

      /* 表格行既能点也能用键盘打开：tr 不是原生可聚焦元素，
         靠 role="link" + tabindex="0" + 这里的 Enter/Space 委托补齐 */
      tbody.addEventListener("click", (e) => {
        const row = e.target.closest("tr[data-href]");
        if (row) location.href = row.dataset.href;
      });
      tbody.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const row = e.target.closest("tr[data-href]");
        if (!row || e.target !== row) return;
        e.preventDefault();
        location.href = row.dataset.href;
      });

      /* ── init ── */
      function updateGeoChip() {
        document.getElementById("userChip").textContent =
          ME.wxId + " · Lv" + ME.level + (ME.geo ? " · " + t("geoRemain", ME.geoRemaining) : "");
      }
      updateGeoChip();
      initTheme();
      applyI18n();
      loadAll();
    </script>
  </body>
</html>
`; }

