import type { DashboardSession } from "../types";
import { safeJson } from "../../utils";
import { frontendHelpers } from "../shared";
export function htmlPage(session: DashboardSession): string { return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title data-i18n="title">Read Receipts</title>
    <style>
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        background: #0f172a;
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
        max-width: 960px;
        margin: 0 auto;
      }

      /* header */
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
        color: #f1f5f9;
      }
      .header .subtitle {
        font-size: 0.85rem;
        color: #64748b;
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

      /* controls bar */
      .controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 0.75rem 1rem;
      }
      .controls input {
        padding: 0.45rem 0.7rem;
        border: 1px solid #475569;
        border-radius: 6px;
        font-size: 0.85rem;
        background: #0f172a;
        color: #e2e8f0;
        outline: none;
        transition: border-color 0.15s;
        min-width: 220px;
      }
      .controls input:focus {
        border-color: #3b82f6;
      }
      .controls input::placeholder {
        color: #475569;
      }

      /* buttons */
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
        transition:
          background 0.15s,
          box-shadow 0.15s;
      }
      .btn:active {
        transform: scale(0.97);
      }
      .btn-primary {
        background: #2563eb;
        color: #fff;
      }
      .btn-primary:hover {
        background: #1d4ed8;
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
        transition:
          color 0.15s,
          border-color 0.15s;
        letter-spacing: 0.03em;
      }
      .lang-toggle:hover {
        color: #e2e8f0;
        border-color: #94a3b8;
      }

      /* table card */
      .table-wrapper {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        overflow: hidden;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: left;
        padding: 0.65rem 1rem;
        font-size: 0.825rem;
      }
      th {
        background: #0f172a;
        font-weight: 600;
        color: #94a3b8;
        border-bottom: 1px solid #334155;
      }
      td {
        border-bottom: 1px solid #1e293b;
        color: #cbd5e1;
      }
      tr:last-child td {
        border-bottom: none;
      }
      tr:hover td {
        background: #0f172a80;
      }

      .msg-col {
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ts-col {
        color: #94a3b8;
        white-space: nowrap;
      }

      .empty-row td {
        text-align: center;
        padding: 2.5rem 1rem;
        color: #475569;
        font-size: 0.85rem;
      }

      /* clickable rows */
      .clickable-row {
        cursor: pointer;
      }

      /* leaderboard */
      .leaderboard {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 1rem;
      }
      .leaderboard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.65rem 1rem;
        background: #0f172a;
        border-bottom: 1px solid #334155;
      }
      .leaderboard-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: #94a3b8;
      }
      .scope-btn {
        background: transparent;
        color: #94a3b8;
        border: 1px solid #475569;
      }
      .scope-btn:hover {
        background: #1e293b;
        color: #e2e8f0;
      }
      .scope-btn.scope-active {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
      }
      .rank-col {
        font-weight: 600;
        color: #94a3b8;
        width: 3.5rem;
      }
      .rank-col.rank-1 {
        color: #fbbf24;
      }
      .rank-col.rank-2 {
        color: #cbd5e1;
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

      /* stats bar */
      .stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 1rem;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        font-size: 0.78rem;
        color: #64748b;
      }
      .stats .count {
        color: #94a3b8;
        font-weight: 600;
      }

      /* toast */
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
        background: #065f46;
        color: #a7f3d0;
        border: 1px solid #059669;
      }
      .toast-error {
        background: #7f1d1d;
        color: #fecaca;
        border: 1px solid #dc2626;
      }
      .toast-info {
        background: #1e3a5f;
        color: #bfdbfe;
        border: 1px solid #2563eb;
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

      /* modal overlay */
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

      /* utility */
      .hidden {
        display: none !important;
      }
      .flex {
        display: flex;
        gap: 0.5rem;
      }

      /* repo footer */
      .repo-footer {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        font-size: 0.78rem;
        color: #64748b;
        text-decoration: none;
        margin-top: 2rem;
        padding: 0.5rem 0.8rem;
        border-radius: 8px;
        transition:
          color 0.15s,
          background 0.15s;
      }
      .repo-footer:hover {
        color: #e2e8f0;
        background: #1e293b;
      }
      .repo-footer svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      /* ── responsive ── */
      @media (max-width: 768px) {
        .container {
          max-width: 100%;
        }
      }

      @media (max-width: 640px) {
        body {
          padding: 1rem 0.75rem;
        }
        .header {
          flex-direction: column;
          align-items: stretch;
        }
        .header .flex {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .header .user-chip {
          grid-column: 1 / -1;
          justify-content: center;
        }
        .header .btn,
        .header .lang-toggle {
          width: 100%;
          justify-content: center;
          min-height: 40px;
        }
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

        /* tables as stacked cards */
        .table-wrapper,
        .leaderboard {
          padding: 0.5rem;
        }
        table {
          display: block;
        }
        thead {
          display: none;
        }
        tbody {
          display: block;
        }
        tbody tr {
          display: block;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 10px;
          padding: 0.25rem 0;
          margin-bottom: 0.6rem;
        }
        tbody tr:hover td,
        tbody tr:last-child td {
          background: transparent;
        }
        tbody tr td {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          border-bottom: 1px solid #1e293b;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
        }
        tbody tr td:last-child {
          border-bottom: none;
        }
        tbody tr td::before {
          content: attr(data-label);
          color: #64748b;
          font-weight: 600;
          font-size: 0.72rem;
          flex-shrink: 0;
        }
        .msg-col,
        .lb-msg-col {
          max-width: none;
          white-space: normal;
          text-align: right;
          overflow-wrap: anywhere;
        }
        .ts-col,
        .wxid-col,
        .lb-count-col,
        .reads-col {
          white-space: normal;
          overflow-wrap: anywhere;
          text-align: right;
        }
        .rank-col {
          width: auto;
        }
        .empty-row {
          border: 1px dashed #334155;
          background: transparent !important;
        }
        .empty-row td {
          justify-content: center;
          text-align: center;
          color: #64748b;
        }
        .empty-row td::before {
          display: none;
        }
        .row-me td {
          background: transparent !important;
        }
        .row-me {
          border-color: #2563eb;
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
        .toast-container {
          left: 1rem;
          align-items: stretch;
        }
        .toast {
          max-width: 100%;
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
      async function loadAll() {
        const q = document.getElementById("msgFilter").value.trim();
        currentFilterUrl = "/messages" + (q ? "?q=" + encodeURIComponent(q) : "");
        await fetchData(currentFilterUrl);
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
            toast(\`HTTP \${res.status}: \${detail}\`, "error");
            return;
          }
          const data = await res.json();
          recordCount.textContent = data.length;
          if (!data.length) {
            tbody.innerHTML =
              '<tr class="empty-row"><td colspan="3">' +
              esc(t("noRecords")) +
              "</td></tr>";
            return;
          }

          tbody.innerHTML = data
            .map(
              (r) => \`<tr class="clickable-row" onclick="location.href='/reads/' + encodeURIComponent('\${escAttr(r.id)}')">
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

      /* ── init ── */
      function updateGeoChip() {
        document.getElementById("userChip").textContent =
          ME.wxId + " · Lv" + ME.level + (ME.geo ? " · " + t("geoRemain", ME.geoRemaining) : "");
      }
      updateGeoChip();
      applyI18n();
      loadAll();
    </script>
  </body>
</html>
`; }

