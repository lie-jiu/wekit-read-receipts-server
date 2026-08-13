export function htmlPage(session) { return `<!doctype html>
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

      .ip-col {
        font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
        font-size: 0.78rem;
        color: #a78bfa;
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
      .loc-col {
        color: #7dd3fc;
        font-size: 0.8rem;
      }
      .loc-text {
        color: #7dd3fc;
        font-size: 0.8rem;
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
      .row-selected td {
        background: #1a3050 !important;
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

      /* detail panel */
      .detail-panel {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        overflow: hidden;
        margin-top: 1rem;
      }
      .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.65rem 1rem;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        gap: 0.75rem;
      }
      .detail-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: #94a3b8;
      }
      .detail-subtitle {
        font-size: 0.78rem;
        color: #60a5fa;
        margin-left: 0.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 500px;
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

      /* ── responsive ── */
      @media (max-width: 768px) {
        .container {
          max-width: 100%;
        }
        .detail-subtitle {
          max-width: 100%;
          white-space: normal;
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
        .ip-col,
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
        .row-selected td,
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
          <button
            class="btn btn-outline btn-sm"
            onclick="openPasswordModal()"
            data-i18n="changePassword"
          >
            Change Password
          </button>
          <button class="btn btn-outline btn-sm" onclick="logout()" data-i18n="logout">
            Logout
          </button>
          <button class="lang-toggle" onclick="toggleLang()">中 / EN</button>
          <button
            class="btn btn-outline btn-sm"
            onclick="loadAll()"
            data-i18n="refresh"
          >
            Refresh
          </button>
          <button
            class="btn btn-danger btn-sm"
            onclick="showClearAllModal()"
            data-i18n="clearAll"
          >
            Clear All
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

      <div class="leaderboard">
        <div class="leaderboard-header">
          <div class="flex">
            <button class="btn btn-sm scope-btn scope-active" id="metricReg" onclick="setMetric('reg')" data-i18n="regBoard">Reg</button>
            <button class="btn btn-sm scope-btn" id="metricRead" onclick="setMetric('read')" data-i18n="readBoard">Reads</button>
            <button class="btn btn-sm scope-btn" id="metricMsg" onclick="setMetric('msg')" data-i18n="msgBoard">Messages</button>
          </div>
          <div class="flex">
            <button class="btn btn-sm scope-btn" id="scopeDay" onclick="setScope('day')" data-i18n="daily">Daily</button>
            <button class="btn btn-sm scope-btn scope-active" id="scopeTotal" onclick="setScope('total')" data-i18n="total">Total</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th data-i18n="rank">Rank</th>
              <th id="lbCol2">Account</th>
              <th id="lbCol3">Messages</th>
              <th id="lbCol4" class="hidden">Reads</th>
            </tr>
          </thead>
          <tbody id="lbTbody"></tbody>
        </table>
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

      <div id="detailPanel" class="detail-panel hidden">
        <div class="detail-header">
          <div>
            <span class="detail-title" data-i18n="readDetails">Read Details</span>
            <span class="detail-subtitle" id="detailFor"></span>
          </div>
          <button class="btn btn-outline btn-sm" onclick="closeDetail()" data-i18n="close">Close</button>
        </div>
        <table>
          <thead>
            <tr>
              <th data-i18n="ipAddress">IP Address</th>
              <th data-i18n="location">Location</th>
              <th data-i18n="readAt">Read At</th>
            </tr>
          </thead>
          <tbody id="detailTbody"></tbody>
        </table>
      </div>
    </div>

    <div id="toastContainer" class="toast-container"></div>
    <div id="modalOverlay" class="modal-overlay hidden">
      <div class="modal">
        <h3 id="modalTitle" data-i18n="confirm">Confirm</h3>
        <p id="modalBody"></p>
        <div class="actions">
          <button class="btn btn-secondary" id="modalCancel" data-i18n="cancel">
            Cancel
          </button>
          <button class="btn btn-danger" id="modalConfirm" data-i18n="delete">
            Delete
          </button>
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
      const ME = ${JSON.stringify({ wxId: session.wxId, level: session.level, geo: session.geo === true, geoQuota: session.geoQuota || 0, geoRemaining: session.geoRemaining || 0 })};
      const tbody = document.getElementById("tbody");
      const recordCount = document.getElementById("recordCount");
      const toastContainer = document.getElementById("toastContainer");
      const modalOverlay = document.getElementById("modalOverlay");
      const modalTitle = document.getElementById("modalTitle");
      const modalBody = document.getElementById("modalBody");
      const modalCancel = document.getElementById("modalCancel");
      const modalConfirm = document.getElementById("modalConfirm");
      const passOverlay = document.getElementById("passOverlay");
      const oldPass = document.getElementById("oldPass");
      const newPass = document.getElementById("newPass");
      const newPass2 = document.getElementById("newPass2");
      const detailPanel = document.getElementById("detailPanel");
      const detailFor = document.getElementById("detailFor");
      const detailTbody = document.getElementById("detailTbody");
      let detailForId = null;
      let detailReads = null;

      /* ── i18n ── */
      let lang = localStorage.getItem("lang") || "zh-CN";

      const translations = {
        "zh-CN": {
          title: "已读追踪",
          subtitle: "已发送消息的已读人数",
          refresh: "刷新",
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
          leaderboard: "注册消息排行榜",
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
          quotaHint: "等级 {0}：最多保留 {0} 条消息，可追溯 {0} 个月。超出将自动删除最早的消息。",
        },
        en: {
          title: "Read Receipts",
          subtitle: "Read counts of sent messages",
          refresh: "Refresh",
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
          leaderboard: "Messages Leaderboard",
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
            "Level {0}: keep up to {0} messages for {0} months. Registering more auto-removes the oldest.",
        },
      };

      function t(key, ...args) {
        let s = translations[lang][key];
        if (!s) return key;
        args.forEach((a, i) => {
          s = s.split("{" + i + "}").join(a);
        });
        return s;
      }

      function applyI18n() {
        document.querySelectorAll("[data-i18n]").forEach((el) => {
          const key = el.dataset.i18n;
          if (el.tagName === "TITLE") {
            document.title = t(key);
          } else if ("i18nPlaceholder" in el.dataset) {
            el.placeholder = t(key);
          } else {
            el.textContent = t(key);
          }
        });
        const chip = document.getElementById("userChip");
        if (chip) chip.title = t("quotaHint", ME.level);
      }

      function toggleLang() {
        lang = lang === "zh-CN" ? "en" : "zh-CN";
        localStorage.setItem("lang", lang);
        applyI18n();
        updateLbHeaders();
        setLabels();
        if (detailReads) renderDetail();
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

      /* ── modal ── */
      function showModal(title, body, onConfirm) {
        modalTitle.textContent = title;
        modalBody.textContent = body;
        modalOverlay.classList.remove("hidden");

        const cleanup = () => {
          modalOverlay.classList.add("hidden");
          modalConfirm.onclick = null;
        };
        modalCancel.onclick = cleanup;
        modalOverlay.onclick = (e) => {
          if (e.target === modalOverlay) cleanup();
        };
        modalConfirm.onclick = () => {
          cleanup();
          onConfirm();
        };
      }

      function showClearAllModal() {
        showModal(t("clearAllTitle"), t("clearAllBody"), () => {
          deleteAll();
        });
      }

      /* ── password ── */
      function openPasswordModal() {
        oldPass.value = "";
        newPass.value = "";
        newPass2.value = "";
        passOverlay.classList.remove("hidden");
        oldPass.focus();
      }
      function closePasswordModal() {
        passOverlay.classList.add("hidden");
      }
      document.getElementById("passCancel").onclick = closePasswordModal;
      passOverlay.onclick = (e) => {
        if (e.target === passOverlay) closePasswordModal();
      };
      async function savePassword() {
        const n1 = newPass.value;
        const n2 = newPass2.value;
        if (n1.length < 8) {
          toast(t("passTooShort"), "error");
          return;
        }
        if (n1 !== n2) {
          toast(t("passMismatch"), "error");
          return;
        }
        try {
          const res = await fetch("/auth/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPassword: oldPass.value, newPassword: n1 }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            toast(err.error || t("passFailed"), "error");
            return;
          }
          toast(t("passChanged"), "success");
          closePasswordModal();
        } catch (e) {
          toast(t("networkError"), "error");
        }
      }
      document.getElementById("passSave").onclick = savePassword;
      [oldPass, newPass, newPass2].forEach((el) => {
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") savePassword();
        });
      });

      /* ── logout ── */
      async function logout() {
        try {
          await fetch("/auth/logout", { method: "POST" });
        } catch {}
        location.href = "/";
      }

      /* ── fetch helpers ── */
      async function loadAll() {
        const q = document.getElementById("msgFilter").value.trim();
        currentFilterUrl = "/messages" + (q ? "?q=" + encodeURIComponent(q) : "");
        await fetchData(currentFilterUrl);
        loadLeaderboard();
      }

      /* ── leaderboard ── */
      let lbScope = "total";
      let lbMetric = "reg";
      const lbTbody = document.getElementById("lbTbody");
      const lbCol2 = document.getElementById("lbCol2");
      const lbCol3 = document.getElementById("lbCol3");
      const lbCol4 = document.getElementById("lbCol4");

      function lbSpan() {
        return lbMetric === "msg" ? 4 : 3;
      }

      function updateLbHeaders() {
        if (lbMetric === "msg") {
          lbCol2.textContent = t("message");
          lbCol3.textContent = t("owner");
          lbCol4.textContent = t("reads");
          lbCol4.classList.remove("hidden");
        } else {
          lbCol2.textContent = t("account");
          lbCol3.textContent = lbMetric === "read" ? t("reads") : t("messageCount");
          lbCol4.classList.add("hidden");
        }
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
        apply(lbTbody, [
          t("rank"),
          lbMetric === "msg" ? t("message") : t("account"),
          lbMetric === "msg"
            ? t("owner")
            : lbMetric === "read"
              ? t("reads")
              : t("messageCount"),
          t("reads"),
        ]);
        apply(detailTbody, [t("ipAddress"), t("location"), t("readAt")]);
      }

      async function loadLeaderboard() {
        lbTbody.innerHTML =
          '<tr class="empty-row"><td colspan="' +
          lbSpan() +
          '">' +
          esc(t("loading")) +
          "</td></tr>";
        try {
          const res = await fetch("/leaderboard?scope=" + lbScope + "&metric=" + lbMetric);
          if (res.status === 401) {
            location.href = "/";
            return;
          }
          if (!res.ok) {
            lbTbody.innerHTML =
              '<tr class="empty-row"><td colspan="' +
              lbSpan() +
              '">' +
              esc(t("leaderboardEmpty")) +
              "</td></tr>";
            return;
          }
          const data = await res.json();
          if (!data.length) {
            lbTbody.innerHTML =
              '<tr class="empty-row"><td colspan="' +
              lbSpan() +
              '">' +
              esc(t("leaderboardEmpty")) +
              "</td></tr>";
            return;
          }
          const rankCell = (i) => \`<td class="rank-col rank-\${i < 3 ? i + 1 : "x"}">\${i + 1}</td>\`;
          lbTbody.innerHTML = data
            .map((r, i) => {
              if (lbMetric === "msg") {
                return \`<tr class="\${r.me ? "row-me" : ""}">
      \${rankCell(i)}
      <td class="lb-msg-col">\${esc(r.content)}</td>
      <td class="wxid-col">\${esc(r.wxId)}</td>
      <td class="lb-count-col">\${esc(r.count)}</td>
    </tr>\`;
              }
              return \`<tr class="\${r.me ? "row-me" : ""}">
      \${rankCell(i)}
      <td class="wxid-col">\${esc(r.wxId)}</td>
      <td class="lb-count-col">\${esc(r.count)}</td>
    </tr>\`;
            })
            .join("");
        } catch (e) {
          lbTbody.innerHTML =
            '<tr class="empty-row"><td colspan="' +
            lbSpan() +
            '">' +
            esc(t("networkError")) +
            "</td></tr>";
        }
        setLabels();
      }

      function syncLbButtons() {
        document.getElementById("metricReg").classList.toggle("scope-active", lbMetric === "reg");
        document.getElementById("metricRead").classList.toggle("scope-active", lbMetric === "read");
        document.getElementById("metricMsg").classList.toggle("scope-active", lbMetric === "msg");
        document.getElementById("scopeDay").classList.toggle("scope-active", lbScope === "day");
        document.getElementById("scopeTotal").classList.toggle("scope-active", lbScope === "total");
      }

      function setMetric(m) {
        if (lbMetric === m) return;
        lbMetric = m;
        syncLbButtons();
        updateLbHeaders();
        loadLeaderboard();
      }

      function setScope(s) {
        if (lbScope === s) return;
        lbScope = s;
        syncLbButtons();
        loadLeaderboard();
      }

      async function fetchData(url) {
        closeDetail();
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
              (r) => \`<tr class="clickable-row" data-id="\${escAttr(r.id)}" data-content="\${escAttr(r.content)}" onclick="toggleDetail(this)">
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

      /* ── delete ── */
      async function deleteAll() {
        toast(t("clearingAll"), "info");
        try {
          const res = await fetch("/messages", { method: "DELETE" });
          if (!res.ok) {
            toast(t("failedClear"), "error");
            return;
          }
          toast(t("clearedAll"), "success");
          await loadAll();
        } catch (e) {
          toast(t("networkError") + ": " + e.message, "error");
        }
      }

      /* ── utils ── */
      function esc(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      function escAttr(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      /* 服务端时间戳为 UTC "YYYY-MM-DD HH:MM:SS"，统一转换为中国时区（UTC+8）显示 */
      function fmtTs(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
          String(s || "")
        );
        if (!m) return String(s || "");
        const d = new Date(
          Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + 8 * 3600 * 1000
        );
        const p = (n) => String(n).padStart(2, "0");
        return \`\${d.getUTCFullYear()}-\${p(d.getUTCMonth() + 1)}-\${p(d.getUTCDate())} \${p(
          d.getUTCHours()
        )}:\${p(d.getUTCMinutes())}:\${p(d.getUTCSeconds())}\`;
      }

      /* ── detail panel ── */
      let selectedRow = null;

      function toggleDetail(row) {
        if (selectedRow === row) {
          closeDetail();
          return;
        }
        if (selectedRow) selectedRow.classList.remove("row-selected");
        selectedRow = row;
        row.classList.add("row-selected");
        openDetail(row.dataset.id, row.dataset.content);
      }

      function closeDetail() {
        detailPanel.classList.add("hidden");
        detailForId = null;
        detailReads = null;
        if (selectedRow) {
          selectedRow.classList.remove("row-selected");
          selectedRow = null;
        }
      }

      async function openDetail(id, content) {
        detailFor.textContent = t("readsFor", content);
        detailForId = id;
        detailReads = null;
        detailTbody.innerHTML =
          '<tr class="empty-row"><td colspan="3">' + esc(t("loading")) + "</td></tr>";
        detailPanel.classList.remove("hidden");
        try {
          const res = await fetch("/reads/" + encodeURIComponent(id));
          if (res.status === 401) {
            location.href = "/";
            return;
          }
          if (!res.ok) {
            detailTbody.innerHTML = \`<tr class="empty-row"><td colspan="3">HTTP \${res.status}</td></tr>\`;
            return;
          }
          const reads = await res.json();
          if (!reads.length) {
            detailTbody.innerHTML =
              '<tr class="empty-row"><td colspan="3">' + esc(t("noReads")) + "</td></tr>";
            return;
          }
          detailReads = reads;
          renderDetail();
        } catch (e) {
          detailTbody.innerHTML =
            '<tr class="empty-row"><td colspan="3">' + esc(t("networkError")) + "</td></tr>";
        }
        setLabels();
      }

      /** 按当前语言取定位字段（en 缺失时回退 zh） */
      function locParts(r) {
        const zh = lang === "zh-CN";
        return [
          zh ? r.country : r.countryEn,
          zh ? r.region : r.regionEn,
          zh ? r.city : r.cityEn,
          zh ? r.isp : r.ispEn,
        ].filter(Boolean);
      }

      /** 重渲染已加载的明细行（语言切换时复用） */
      function renderDetail() {
        if (!detailReads) return;
        detailTbody.innerHTML = detailReads
          .map((r) => {
            const parts = locParts(r);
            const isV6 = r.ip.indexOf(":") !== -1;
            const cell = r.located
              ? '<span class="loc-text">' + esc(parts.join(" ") || t("noGeo")) + "</span>"
              : ME.geo && !isV6 && ME.geoRemaining > 0
                ? '<button class="btn btn-outline btn-sm" data-id="' +
                  detailForId +
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
                        : ME.geo && ME.geoRemaining <= 0
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
      }

      async function locateRead(btn) {
        if (btn.disabled) return;
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
      updateLbHeaders();
      syncLbButtons();
      loadAll();
    </script>
  </body>
</html>
`; }
