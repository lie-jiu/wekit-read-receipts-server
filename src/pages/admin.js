import { safeJson } from "../utils";

export function adminPage(session) { return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title data-i18n="title">Admin — Read Receipts</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;min-height:100dvh;padding:2rem 1rem;padding-top:max(2rem,env(safe-area-inset-top));padding-bottom:max(2rem,env(safe-area-inset-bottom));padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}
.container{max-width:1000px;margin:0 auto}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:.75rem}
.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9}
.header .subtitle{font-size:.85rem;color:#64748b}
.flex{display:flex;gap:.5rem;align-items:center}
.btn{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .85rem;border:none;border-radius:6px;font-size:.8rem;font-weight:500;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .15s}
.btn:active{transform:scale(.97)}
.btn-primary{background:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}
.btn-secondary{background:#475569;color:#e2e8f0}.btn-secondary:hover{background:#64748b}
.btn-danger{background:#b91c1c;color:#fff}.btn-danger:hover{background:#991b1b}
.btn-outline{background:transparent;color:#94a3b8;border:1px solid #475569}
.btn-outline:hover{background:#1e293b;color:#e2e8f0}
.btn-sm{padding:.3rem .6rem;font-size:.75rem}
.lang-toggle{font-size:.7rem;font-weight:600;padding:.25rem .5rem;border-radius:4px;background:transparent;color:#64748b;border:1px solid #475569;cursor:pointer;letter-spacing:.03em}
.lang-toggle:hover{color:#e2e8f0;border-color:#94a3b8}
.tabs{display:flex;gap:.4rem;margin-bottom:1rem}
.tab{padding:.5rem 1rem;border:1px solid #475569;border-radius:6px;background:transparent;color:#94a3b8;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.tab.active{background:#2563eb;border-color:#2563eb;color:#fff}
.controls{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:.75rem 1rem}
.controls input{padding:.45rem .7rem;border:1px solid #475569;border-radius:6px;font-size:.85rem;background:#0f172a;color:#e2e8f0;outline:none;transition:border-color .15s;min-width:180px}
.controls input:focus{border-color:#3b82f6}
.controls .sep{color:#475569;font-size:.8rem;padding:0 .15rem}
.table-wrapper{background:#1e293b;border:1px solid #334155;border-radius:10px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.65rem 1rem;font-size:.825rem}
th{background:#0f172a;font-weight:600;color:#94a3b8;border-bottom:1px solid #334155}
td{border-bottom:1px solid #1e293b;color:#cbd5e1}
tr:last-child td{border-bottom:none}
tr:hover td{background:#0f172a80}
.uuid-col{font-family:ui-monospace,"Cascadia Code","JetBrains Mono",monospace;font-size:.78rem;color:#60a5fa}
.msg-col{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-col{color:#94a3b8;white-space:nowrap}
.empty-row td{text-align:center;padding:2.5rem 1rem;color:#475569;font-size:.85rem}
.pagination{display:flex;align-items:center;justify-content:center;gap:.35rem;flex-wrap:wrap;padding:.65rem 1rem;border-top:1px solid #334155;background:#0f172a}
.pagination:empty{display:none}
.page-btn{min-width:2rem;height:2rem;padding:0 .5rem;border:1px solid #475569;border-radius:6px;background:transparent;color:#94a3b8;font-size:.8rem;cursor:pointer;transition:background .15s,color .15s}
.page-btn:hover:not(:disabled){background:#1e293b;color:#e2e8f0}
.page-btn:disabled{opacity:.4;cursor:not-allowed}
.page-btn.page-active{background:#2563eb;border-color:#2563eb;color:#fff}
.page-btn.page-ellipsis{border:none;background:transparent;cursor:default}
.page-size-select{margin-left:.5rem;padding:.25rem .4rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:.8rem;outline:none}
.page-size-select:focus{border-color:#3b82f6}
.page-info{color:#64748b;font-size:.78rem;margin-left:.5rem}
.stats{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1rem;background:#0f172a;border-bottom:1px solid #334155;font-size:.78rem;color:#64748b}
.stats .count{color:#94a3b8;font-weight:600}
.level-editor{display:inline-flex;align-items:center;gap:.25rem}
.level-editor .btn{padding:.2rem .55rem;line-height:1;font-size:.85rem}
.level-input{width:3.2rem;text-align:center;padding:.25rem .3rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:.8rem;outline:none;-moz-appearance:textfield}
.level-input::-webkit-outer-spin-button,.level-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.level-input:focus{border-color:#3b82f6}
.toast-container{position:fixed;top:max(1rem,env(safe-area-inset-top));right:max(1rem,env(safe-area-inset-right));z-index:1000;display:flex;flex-direction:column;gap:.5rem}
.levels-hint{font-size:.78rem;color:#64748b;line-height:1.5}
.levels-hint b{color:#94a3b8}
.level-formula{width:100%;min-width:220px;padding:.45rem .7rem;border:1px solid #475569;border-radius:6px;font-size:.85rem;background:#0f172a;color:#e2e8f0;outline:none}
.level-formula:focus{border-color:#3b82f6}
.lv-preview-col{text-align:right;font-variant-numeric:tabular-nums}
.toast{display:flex;align-items:center;gap:.5rem;padding:.65rem 1rem;border-radius:8px;font-size:.85rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.4);animation:toast-in .25s ease-out;max-width:360px}
.toast-success{background:#065f46;color:#a7f3d0;border:1px solid #059669}
.toast-error{background:#7f1d1d;color:#fecaca;border:1px solid #dc2626}
.toast-info{background:#1e3a5f;color:#bfdbfe;border:1px solid #2563eb}
@keyframes toast-in{from{opacity:0;translate:0 -.5rem}to{opacity:1;translate:0}}
.toast-out{animation:toast-out .2s ease-in forwards}
@keyframes toast-out{to{opacity:0;translate:0 -.5rem}}
.modal-overlay{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;animation:fade-in .15s ease-out}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
.modal{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.5rem;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.modal h3{font-size:1.1rem;font-weight:600;margin-bottom:.5rem}
.modal p{font-size:.875rem;color:#94a3b8;margin-bottom:1.25rem;line-height:1.5}
.modal .actions{display:flex;gap:.5rem;justify-content:flex-end}
.modal-form input{width:100%;padding:.55rem .7rem;border:1px solid #475569;border-radius:6px;font-size:.9rem;background:#0f172a;color:#e2e8f0;outline:none;margin-bottom:.6rem;transition:border-color .15s}
.modal-form input:focus{border-color:#3b82f6}
.detail-row td{border-bottom:1px solid #334155;background:#0b1220;padding:.4rem 1rem}
.detail-row td:last-child{border-bottom:1px solid #334155}
.detail-card{margin:.5rem 0 .5rem 1.5rem;border:1px solid #334155;border-radius:10px;background:#111c33;padding:.85rem 1rem;animation:fade-in .15s ease-out}
.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem 1.5rem}
.detail-item{display:flex;flex-direction:column;gap:.15rem}
.detail-label{font-size:.72rem;color:#64748b;font-weight:600;letter-spacing:.02em}
.detail-value{font-size:.9rem;color:#e2e8f0;font-variant-numeric:tabular-nums;word-break:break-word}
.detail-value .uuid-col{font-size:.82rem}
.detail-actions{margin-top:.75rem;display:flex;gap:.5rem}
.expand-btn{display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border:none;border-radius:6px;background:transparent;color:#94a3b8;cursor:pointer;font-size:.8rem;transition:background .15s,color .15s,transform .15s;flex-shrink:0}
.expand-btn:hover{background:#1e293b;color:#e2e8f0}
.expand-btn:active{transform:scale(.92)}
.expand-icon{display:inline-block;transition:transform .2s ease}
tr.expanded .expand-icon{transform:rotate(90deg)}
.msg-list{margin-top:.75rem;border-top:1px solid #1e293b;padding-top:.6rem;display:flex;flex-direction:column;gap:.4rem}
.msg-list-item{display:flex;flex-direction:column;gap:.15rem;padding:.5rem .65rem;background:#0f172a;border:1px solid #1e293b;border-radius:8px}
.msg-list-content{font-size:.85rem;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msg-list-meta{display:flex;gap:.75rem;font-size:.72rem;color:#64748b}
.msg-list-meta .reads{color:#059669;font-weight:600}
.msg-list-empty{font-size:.82rem;color:#64748b;padding:.25rem 0}
.hidden{display:none !important}
.repo-footer{display:flex;align-items:center;justify-content:center;gap:.4rem;font-size:.78rem;color:#64748b;text-decoration:none;margin-top:2rem;padding:.5rem .8rem;border-radius:8px;transition:color .15s,background .15s}
.repo-footer:hover{color:#e2e8f0;background:#1e293b}
.repo-footer svg{width:16px;height:16px;flex-shrink:0}
@media (max-width:640px){body{padding:1rem .75rem}.header{flex-direction:column;align-items:stretch}.header .flex{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr))}.header .btn,.header .lang-toggle{width:100%;justify-content:center;min-height:40px}.tabs{display:grid;grid-template-columns:1fr 1fr}.tab{min-height:42px}.controls{flex-direction:column;align-items:stretch}.controls input{min-width:0;width:100%;min-height:44px}.btn{min-height:40px}.table-wrapper{padding:.5rem}table{display:block}thead{display:none}tbody{display:block}tbody tr{display:block;background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.25rem 0;margin-bottom:.6rem}tbody tr:hover td,tbody tr:last-child td{background:transparent}tbody tr td{display:flex;align-items:center;justify-content:space-between;gap:.75rem;border-bottom:1px solid #1e293b;padding:.5rem .75rem;font-size:.8rem}tbody tr td:last-child{border-bottom:none}tbody tr td::before{content:attr(data-label);color:#64748b;font-weight:600;font-size:.72rem;flex-shrink:0}tbody tr td .flex{flex-wrap:nowrap}.uuid-col,.ts-col{white-space:normal;overflow-wrap:anywhere;text-align:right}.msg-col{max-width:none;white-space:normal;text-align:right;overflow-wrap:anywhere}.empty-row{border:1px dashed #334155;background:transparent !important}.empty-row td{justify-content:center;text-align:center;color:#64748b}.empty-row td::before{display:none}.level-input{font-size:1rem}.modal{max-width:94vw;width:94vw;padding:1.25rem}.modal .actions{flex-direction:column-reverse}.modal .actions .btn{width:100%;justify-content:center;min-height:44px}.modal-form input{min-height:44px}.toast-container{left:1rem;align-items:stretch}.toast{max-width:100%}.detail-row{border:1px dashed #334155;background:transparent !important;margin-bottom:.6rem;border-radius:10px}.detail-row td{display:block;border:none;padding:.25rem .5rem}.detail-row td::before{display:none}.detail-card{margin:.5rem .4rem;padding:.75rem .85rem}.detail-grid{grid-template-columns:1fr}.expand-btn{width:2rem;height:2rem;min-width:40px;min-height:40px;font-size:.95rem}.msg-list-item{min-height:44px}.pagination{gap:.25rem}.page-info{width:100%;text-align:center;margin-left:0;margin-top:.25rem}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1 data-i18n="title">&#128737;&#65039; Admin Console</h1>
      <div class="subtitle" id="adminName"></div>
    </div>
    <div class="flex">
      <button type="button" class="lang-toggle" onclick="toggleLang()">中 / EN</button>
      <a class="btn btn-outline btn-sm" href="/" data-i18n="dashboard">Dashboard</a>
      <button class="btn btn-outline btn-sm" onclick="logout()" data-i18n="logout">Logout</button>
    </div>
  </div>
  <div class="tabs">
    <button id="tabUsers" class="tab active" onclick="showTab('users')" data-i18n="tabUsers">Users</button>
    <button id="tabMsgs" class="tab" onclick="showTab('msgs')" data-i18n="tabMsgs">Messages</button>
    <button id="tabLevels" class="tab" onclick="showTab('levels')" data-i18n="tabLevels">Levels</button>
    <button id="tabBlock" class="tab" onclick="showTab('block')" data-i18n="tabBlock">IP Blacklist</button>
  </div>

  <div id="secUsers">
    <div class="controls">
      <button class="btn btn-primary" onclick="openAddUser()" data-i18n="addUser">Add User</button>
      <input id="fUser" placeholder="Search by wxId..." oninput="onUserSearchInput()" data-i18n="fUserPlaceholder" data-i18n-placeholder/>
      <button class="btn btn-secondary btn-sm" onclick="expandAllUsers()" data-i18n="expandAll">Expand all</button>
      <button class="btn btn-secondary btn-sm" onclick="collapseAllUsers()" data-i18n="collapseAll">Collapse all</button>
    </div>
    <div class="table-wrapper">
      <div class="stats"><span><span class="count" id="userCount">0</span> <span data-i18n="usersLabel">users</span></span></div>
      <table>
        <thead><tr><th style="width:2.4rem"></th><th>wxId</th><th data-i18n="level">Level</th><th data-i18n="registered">Registered</th><th data-i18n="actions">Actions</th></tr></thead>
        <tbody id="userTbody"></tbody>
      </table>
      <div class="pagination" id="userPagination"></div>
    </div>
  </div>

  <div id="secMsgs" class="hidden">
    <div class="controls">
      <input id="fWxid" placeholder="Filter by wxId..." oninput="resetMsgPage()" data-i18n="fWxidPlaceholder" data-i18n-placeholder/>
      <input id="fContent" placeholder="Filter by message text..." oninput="resetMsgPage()" data-i18n="fContentPlaceholder" data-i18n-placeholder/>
      <span class="sep">|</span>
      <input id="fDelWxid" placeholder="wxId to wipe all its data" data-i18n="fDelWxidPlaceholder" data-i18n-placeholder/>
      <button class="btn btn-danger btn-sm" onclick="askClearUser()" data-i18n="wipeUserData">Wipe user data</button>
    </div>
    <div class="table-wrapper">
      <div class="stats"><span><span class="count" id="msgCount">0</span> <span data-i18n="messagesLabel">messages</span></span></div>
      <table>
        <thead><tr><th>wxId</th><th data-i18n="message">Message</th><th data-i18n="reads">Reads</th><th data-i18n="timestamp">Timestamp</th><th></th></tr></thead>
        <tbody id="msgTbody"></tbody>
      </table>
      <div class="pagination" id="msgPagination"></div>
    </div>
  </div>

  <div id="secLevels" class="hidden">
    <div class="controls">
      <span class="levels-hint" data-i18n="levelsHint"></span>
      <span class="sep">|</span>
      <button class="btn btn-primary" onclick="saveLevels()" data-i18n="saveLevels">Save Level Benefits</button>
    </div>
    <div class="table-wrapper">
      <table>
        <tbody>
          <tr>
            <td class="uuid-col" data-i18n="benefitMessages">Messages</td>
            <td><input id="formulaMessage" class="level-formula" type="text" data-i18n-placeholder data-i18n="formulaPlaceholder" placeholder="x" oninput="onFormulaInput('message')"/></td>
          </tr>
          <tr>
            <td class="uuid-col" data-i18n="benefitGeo">Geo lookups</td>
            <td><input id="formulaGeo" class="level-formula" type="text" data-i18n-placeholder data-i18n="formulaPlaceholder" placeholder="x" oninput="onFormulaInput('geo')"/></td>
          </tr>
          <tr>
            <td class="uuid-col" data-i18n="benefitRetention">Retention (mo)</td>
            <td><input id="formulaRetention" class="level-formula" type="text" data-i18n-placeholder data-i18n="formulaPlaceholder" placeholder="x" oninput="onFormulaInput('retentionMonths')"/></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-wrapper">
      <div class="stats"><span data-i18n="levelsPreview">Preview (levels 1-20)</span></div>
      <table>
        <thead><tr>
          <th data-i18n="level">Level</th>
          <th class="lv-preview-col" data-i18n="benefitMessages">Messages</th>
          <th class="lv-preview-col" data-i18n="benefitGeo">Geo lookups</th>
          <th class="lv-preview-col" data-i18n="benefitRetention">Retention (mo)</th>
        </tr></thead>
        <tbody id="levelPreviewTbody"></tbody>
      </table>
    </div>
  </div>
  <div id="secBlock" class="hidden">
    <div class="controls">
      <input id="fGlobalIp" placeholder="Add IP to global blacklist..." onkeydown="if(event.key==='Enter')addGlobalIp()" data-i18n="fGlobalIpPlaceholder" data-i18n-placeholder/>
      <button class="btn btn-primary" onclick="addGlobalIp()" data-i18n="addIp">Add</button>
    </div>
    <div class="table-wrapper">
      <div class="stats"><span><span class="count" id="globalIpCount">0</span> <span data-i18n="globalIpLabel">IPs</span></span><span data-i18n="globalBlacklistHint"></span></div>
      <table>
        <thead><tr><th data-i18n="ipAddressCol">IP Address</th><th data-i18n="addedAt">Added At</th><th data-i18n="actions">Actions</th></tr></thead>
        <tbody id="globalIpTbody"></tbody>
      </table>
    </div>
  </div>
</div>

<a class="repo-footer" href="https://github.com/lie-jiu/wekit-read-receipts-server" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
<span>lie-jiu · GitHub</span>
</a>

<div id="toastContainer" class="toast-container"></div>
<div id="modalOverlay" class="modal-overlay hidden">
  <div class="modal">
    <h3 id="modalTitle">Confirm</h3>
    <p id="modalBody"></p>
    <div class="actions">
      <button class="btn btn-secondary" id="modalCancel" data-i18n="cancel">Cancel</button>
      <button class="btn btn-danger" id="modalConfirm" data-i18n="confirm">Confirm</button>
    </div>
  </div>
</div>
<div id="passOverlay" class="modal-overlay hidden">
  <div class="modal">
    <h3 data-i18n="setPassword">Set Password</h3>
    <div class="modal-form">
      <input type="password" id="newUserPass" placeholder="New password (min 8 chars)" data-i18n="newPassPlaceholder" data-i18n-placeholder/>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" id="passCancel" data-i18n="cancel">Cancel</button>
      <button class="btn btn-primary" id="passSave" data-i18n="save">Save</button>
    </div>
  </div>
</div>
<div id="addUserOverlay" class="modal-overlay hidden">
  <div class="modal">
    <h3 data-i18n="addUserTitle">Add User</h3>
    <div class="modal-form">
      <input id="newUserWxid" placeholder="wxId" data-i18n="addUserWxidPlaceholder" data-i18n-placeholder/>
      <input type="password" id="newUserPw" placeholder="Password (min 8 chars)" data-i18n="newPassPlaceholder" data-i18n-placeholder/>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" id="addUserCancel" data-i18n="cancel">Cancel</button>
      <button class="btn btn-primary" id="addUserSave" data-i18n="save">Save</button>
    </div>
  </div>
</div>

<script>
const ME = ${safeJson({ wxId: session.wxId })};
const $ = (id) => document.getElementById(id);
let lang = localStorage.getItem("lang") || "zh-CN";
const translations = {
  "zh-CN": {
    title: "管理后台",
    dashboard: "仪表盘",
    logout: "退出登录",
    tabUsers: "用户",
    tabMsgs: "消息",
    tabLevels: "等级权益",
    tabBlock: "全局 IP 黑名单",
    globalBlacklistHint: "命中即对所有用户的所有消息的已读详情生效：接口不再返回该 IP 的任何数据（记录保留）",
    fGlobalIpPlaceholder: "输入要拉黑的 IP，如 203.0.113.7",
    addIp: "添加",
    globalIpLabel: "个 IP",
    ipAddressCol: "IP 地址",
    addedAt: "添加时间",
    noBlacklistIps: "黑名单为空",
    invalidIp: "IP 格式无效",
    ipExists: "该 IP 已在黑名单中",
    ipAdded: "已加入黑名单",
    ipRemoved: "已移除",
    addIpFail: "添加失败",
    removeIpFail: "移除失败",
    loadIpFail: "加载黑名单失败",
    levelsHint: "公式中 x 代表用户等级，留空恢复默认公式 x。支持 + - * / % ^ 括号与 min/max/floor/ceil/round/abs/pow。",
    formulaPlaceholder: "公式，如 x*2-1",
    saveLevels: "保存等级权益",
    levelsSaved: "已保存，重启服务后生效",
    saveLevelsFail: "保存失败",
    loadLevelsFail: "加载等级配置失败",
    formulaInvalid: "公式无效",
    levelsPreview: "等级 1-20 预览",
    benefitMessages: "消息保留(条)",
    benefitGeo: "IP定位(次)",
    benefitRetention: "保留时长(月)",
    addUser: "新增用户",
    addUserTitle: "新增用户",
    addUserWxidPlaceholder: "wxId",
    addUserOk: "已创建用户 {0}",
    addUserFail: "创建用户失败",
    addUserEmptyWxid: "请填写 wxId",
    usersLabel: "个用户",
    fUserPlaceholder: "按 wxId 搜索...",
    pageOf: "第 {0} / {1} 页",
    pageSizeLabel: "每页",
    prevPage: "上一页",
    nextPage: "下一页",
    messagesLabel: "条消息",
    level: "等级",
    registered: "注册时间",
    actions: "操作",
    expandAll: "全部展开",
    collapseAll: "全部收起",
    expand: "展开",
    collapse: "收起",
    detailRegistered: "注册时间",
    detailLastMsg: "最新消息时间",
    detailLevel: "用户等级",
    detailTotalReg: "累计注册消息数",
    detailCurrentMsg: "当前保留消息数",
    viewLatestMsgs: "查看最新消息",
    hideLatestMsgs: "收起最新消息",
    noLatestMsgs: "该用户暂无消息",
    message: "消息",
    reads: "已读",
    timestamp: "时间",
    fWxidPlaceholder: "按 wxId 过滤...",
    fContentPlaceholder: "按消息内容过滤...",
    fDelWxidPlaceholder: "要清空数据的 wxId",
    wipeUserData: "清空用户数据",
    confirm: "确认",
    cancel: "取消",
    save: "保存",
    setPassword: "设置密码",
    newPassPlaceholder: "新密码（至少 8 位）",
    delete: "删除",
    noMessages: "暂无消息",
    loadUsersFail: "加载用户失败",
    loadMsgsFail: "加载消息失败",
    networkError: "网络错误",
    levelUpdated: "等级已更新",
    levelFail: "等级更新失败",
    passTooShort: "密码至少 8 位",
    setPassOk: "已为 {0} 设置新密码",
    setPassFail: "设置密码失败",
    delUserTitle: "删除用户？",
    delUserBody: "删除用户「{0}」及其全部消息和已读记录？此操作不可撤销。",
    delUserFail: "删除用户失败",
    userDeleted: "用户已删除",
    delMsgTitle: "删除消息？",
    delMsgBody: "删除这条消息及其已读记录？",
    delMsgFail: "删除消息失败",
    msgDeleted: "消息已删除",
    enterWxid: "请先输入 wxId",
    wipeTitle: "清空用户数据？",
    wipeBody: "删除「{0}」的全部消息和已读记录？",
    failed: "操作失败",
    dataWiped: "数据已清空",
  },
  en: {
    title: "Admin Console",
    dashboard: "Dashboard",
    logout: "Logout",
    tabUsers: "Users",
    tabMsgs: "Messages",
    tabLevels: "Levels",
    tabBlock: "IP Blacklist",
    globalBlacklistHint: "Applies to read details of all messages of all users: the API returns no data for blacklisted IPs (records kept)",
    fGlobalIpPlaceholder: "Enter an IP to blacklist, e.g. 203.0.113.7",
    addIp: "Add",
    globalIpLabel: "IPs",
    ipAddressCol: "IP Address",
    addedAt: "Added At",
    noBlacklistIps: "Blacklist is empty",
    invalidIp: "Invalid IP format",
    ipExists: "IP already blacklisted",
    ipAdded: "Added to blacklist",
    ipRemoved: "Removed",
    addIpFail: "Failed to add",
    removeIpFail: "Failed to remove",
    loadIpFail: "Failed to load blacklist",
    levelsHint: "Formula variable x = user level; empty reverts to default x. Supports + - * / % ^ () and min/max/floor/ceil/round/abs/pow.",
    formulaPlaceholder: "Formula, e.g. x*2-1",
    saveLevels: "Save Level Benefits",
    levelsSaved: "Saved. Restart service to apply.",
    saveLevelsFail: "Failed to save",
    loadLevelsFail: "Failed to load level config",
    formulaInvalid: "Invalid formula",
    levelsPreview: "Preview (levels 1-20)",
    benefitMessages: "Messages",
    benefitGeo: "Geo lookups",
    benefitRetention: "Retention (mo)",
    addUser: "Add User",
    addUserTitle: "Add User",
    addUserWxidPlaceholder: "wxId",
    addUserOk: 'User "{0}" created',
    addUserFail: "Failed to create user",
    addUserEmptyWxid: "Enter a wxId",
    usersLabel: "users",
    fUserPlaceholder: "Search by wxId...",
    pageOf: "Page {0} / {1}",
    pageSizeLabel: "Per page",
    prevPage: "Prev",
    nextPage: "Next",
    messagesLabel: "messages",
    level: "Level",
    registered: "Registered",
    actions: "Actions",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    expand: "Expand",
    collapse: "Collapse",
    detailRegistered: "Registered",
    detailLastMsg: "Latest message",
    detailLevel: "User level",
    detailTotalReg: "Total registered messages",
    detailCurrentMsg: "Current stored messages",
    viewLatestMsgs: "View latest messages",
    hideLatestMsgs: "Hide latest messages",
    noLatestMsgs: "No messages for this user",
    message: "Message",
    reads: "Reads",
    timestamp: "Timestamp",
    fWxidPlaceholder: "Filter by wxId...",
    fContentPlaceholder: "Filter by message text...",
    fDelWxidPlaceholder: "wxId to wipe all its data",
    wipeUserData: "Wipe user data",
    confirm: "Confirm",
    cancel: "Cancel",
    save: "Save",
    setPassword: "Set Password",
    newPassPlaceholder: "New password (min 8 chars)",
    delete: "Delete",
    noMessages: "No messages",
    loadUsersFail: "Failed to load users",
    loadMsgsFail: "Failed to load messages",
    networkError: "Network error",
    levelUpdated: "Level updated",
    levelFail: "Failed to update level",
    passTooShort: "Password must be at least 8 characters",
    setPassOk: 'Password set for "{0}"',
    setPassFail: "Failed to set password",
    delUserTitle: "Delete user?",
    delUserBody: 'Delete user "{0}" and all their messages and reads? This cannot be undone.',
    delUserFail: "Failed to delete user",
    userDeleted: "User deleted",
    delMsgTitle: "Delete message?",
    delMsgBody: "Delete this message and its read records?",
    delMsgFail: "Failed to delete message",
    msgDeleted: "Message deleted",
    enterWxid: "Enter a wxId first",
    wipeTitle: "Wipe user data?",
    wipeBody: 'Delete all messages and reads for "{0}"?',
    failed: "Failed",
    dataWiped: "Data wiped",
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
  if ($("tabUsers").classList.contains("active")) loadUsers();
  else if ($("tabMsgs").classList.contains("active")) loadMsgs();
  else if ($("tabBlock").classList.contains("active")) loadGlobalIps();
  else loadLevels();
}
/* 移动端卡片布局的列标签（跟随当前语言） */
function setLabels() {
  const apply = (tbodyEl, labels) => {
    tbodyEl.querySelectorAll("tr:not(.empty-row):not(.detail-row)").forEach((tr) => {
      Array.from(tr.cells).forEach((td, i) => {
        if (labels[i]) td.setAttribute("data-label", labels[i]);
      });
    });
  };
  apply($("userTbody"), ["wxId", t("level"), t("registered"), t("actions")]);
  apply($("msgTbody"), ["wxId", t("message"), t("reads"), t("timestamp"), t("actions")]);
  apply($("globalIpTbody"), [t("ipAddressCol"), t("addedAt"), t("actions")]);
}
applyI18n();
const toastContainer = $("toastContainer");
const modalOverlay = $("modalOverlay"), modalTitle = $("modalTitle"), modalBody = $("modalBody"), modalCancel = $("modalCancel"), modalConfirm = $("modalConfirm");
const passOverlay = $("passOverlay"), newUserPass = $("newUserPass"), passCancel = $("passCancel"), passSave = $("passSave");
const addUserOverlay = $("addUserOverlay"), newUserWxid = $("newUserWxid"), newUserPw = $("newUserPw"), addUserCancel = $("addUserCancel"), addUserSave = $("addUserSave");
let targetWxId = "";

$("adminName").textContent = ME.wxId;

function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escAttr(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function fmtTs(s){
  const m = /^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2})$/.exec(String(s || ""));
  if (!m) return String(s || "");
  const offset = lang === "zh-CN" ? 8 : 0;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]) + offset*3600*1000);
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear()+"-"+p(d.getUTCMonth()+1)+"-"+p(d.getUTCDate())+" "+p(d.getUTCHours())+":"+p(d.getUTCMinutes())+":"+p(d.getUTCSeconds());
}
function toast(message, type = "info"){
  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.classList.add("toast-out"), 2800);
  setTimeout(() => el.remove(), 3100);
}
function showModal(title, body, onConfirm){
  modalTitle.textContent = title;
  modalBody.textContent = body;
  modalOverlay.classList.remove("hidden");
  const cleanup = () => { modalOverlay.classList.add("hidden"); modalConfirm.onclick = null; };
  modalCancel.onclick = cleanup;
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) cleanup(); };
  modalConfirm.onclick = () => { cleanup(); onConfirm(); };
}
function showTab(name){
  $("tabUsers").classList.toggle("active", name === "users");
  $("tabMsgs").classList.toggle("active", name === "msgs");
  $("tabLevels").classList.toggle("active", name === "levels");
  $("tabBlock").classList.toggle("active", name === "block");
  $("secUsers").classList.toggle("hidden", name !== "users");
  $("secMsgs").classList.toggle("hidden", name !== "msgs");
  $("secLevels").classList.toggle("hidden", name !== "levels");
  $("secBlock").classList.toggle("hidden", name !== "block");
  if (name === "users") loadUsers();
  else if (name === "msgs") loadMsgs();
  else if (name === "block") loadGlobalIps();
  else loadLevels();
}
let userSearchTimer = null;
let userPage = 1;
let userPageSize = 20;
let userTotalPages = 1;
let userTotal = 0;

function onUserSearchInput() {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(() => {
    userPage = 1;
    loadUsers();
  }, 300);
}

function goToUserPage(p) {
  if (p < 1 || p > userTotalPages || p === userPage) return;
  userPage = p;
  loadUsers();
}

function changeUserPageSize(size) {
  const n = parseInt(size, 10);
  if (!Number.isFinite(n) || n < 1) return;
  userPageSize = n;
  userPage = 1;
  loadUsers();
}

function renderUserPagination() {
  const el = $("userPagination");
  if (!el) return;
  if (userTotal === 0) { el.innerHTML = ""; return; }

  const buttons = [];
  const prevDis = userPage <= 1 ? " disabled" : "";
  buttons.push('<button class="page-btn" onclick="goToUserPage(' + (userPage - 1) + ')"' + prevDis + ' aria-label="' + escAttr(t("prevPage")) + '">&laquo;</button>');

  // 页码窗口：始终显示第一页、当前页前后各 2 页、最后一页
  const addPageBtn = (p, label, cls) => {
    const dis = p === userPage ? " disabled" : "";
    buttons.push('<button class="page-btn ' + (cls || "") + '" onclick="goToUserPage(' + p + ')"' + dis + ">" + label + "</button>");
  };
  const addEllipsis = () => buttons.push('<span class="page-btn page-ellipsis">&hellip;</span>');

  const pages = new Set([1, userPage - 1, userPage, userPage + 1, userTotalPages]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= userTotalPages).sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) addEllipsis();
    addPageBtn(p, p, p === userPage ? "page-active" : "");
    prev = p;
  }

  const nextDis = userPage >= userTotalPages ? " disabled" : "";
  buttons.push('<button class="page-btn" onclick="goToUserPage(' + (userPage + 1) + ')"' + nextDis + ' aria-label="' + escAttr(t("nextPage")) + '">&raquo;</button>');

  const sizeOptions = [10, 20, 50, 100]
    .map((n) => '<option value="' + n + '"' + (n === userPageSize ? " selected" : "") + ">" + n + "</option>")
    .join("");
  const sizeSelect = '<span class="page-info">' + t("pageOf", userPage, userTotalPages) + '</span><span class="page-info">' + t("pageSizeLabel") + '</span><select class="page-size-select" onchange="changeUserPageSize(this.value)">' + sizeOptions + "</select>";

  el.innerHTML = buttons.join("") + sizeSelect;
}

async function loadUsers() {
  try {
    const params = new URLSearchParams();
    const q = $("fUser").value.trim();
    if (q) params.set("q", q);
    params.set("page", userPage);
    params.set("pageSize", userPageSize);
    const res = await fetch("/admin/users?" + params.toString());
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("loadUsersFail"), "error"); return; }
    const data = await res.json();
    const rows = data.rows || [];
    userTotal = data.total || 0;
    userTotalPages = data.totalPages || 1;
    if (userPage > userTotalPages) { userPage = 1; }
    $("userCount").textContent = userTotal;
    $("userTbody").innerHTML = rows
      .map((u) => {
        const detail =
          '<div class="detail-card">' +
            '<div class="detail-grid">' +
              '<div class="detail-item"><span class="detail-label">' + t("detailRegistered") + '</span><span class="detail-value ts-col">' + esc(fmtTs(u.createdAt)) + '</span></div>' +
              '<div class="detail-item"><span class="detail-label">' + t("detailLastMsg") + '</span><span class="detail-value ts-col">' + esc(u.lastMsgAt ? fmtTs(u.lastMsgAt) : "—") + '</span></div>' +
              '<div class="detail-item"><span class="detail-label">' + t("detailLevel") + '</span><span class="detail-value">' + esc(u.level) + '</span></div>' +
              '<div class="detail-item"><span class="detail-label">' + t("detailTotalReg") + '</span><span class="detail-value">' + esc(u.totalRegMsgs) + '</span></div>' +
              '<div class="detail-item" style="grid-column:1/-1"><span class="detail-label">' + t("detailCurrentMsg") + '</span><span class="detail-value">' + esc(u.messageCount) + '</span></div>' +
            '</div>' +
            '<div class="detail-actions">' +
              '<button type="button" class="btn btn-secondary btn-sm act-msgs" data-wxid="' + escAttr(u.wxId) + '">' + t("viewLatestMsgs") + '</button>' +
            '</div>' +
            '<div class="msg-list hidden" data-wxid="' + escAttr(u.wxId) + '"></div>' +
          '</div>';
        return (
          "<tr>" +
          '<td><button type="button" class="expand-btn" aria-label="' + escAttr(t("expand")) + '"><span class="expand-icon">&#9656;</span></button></td>' +
          '<td class="uuid-col">' + esc(u.wxId) + "</td>" +
          '<td><span class="level-editor" data-wxid="' + escAttr(u.wxId) + '">' +
          '<button type="button" class="btn btn-outline btn-sm level-minus" aria-label="Decrease level">−</button>' +
          '<input class="level-input" type="number" min="0" max="99" value="' + u.level + '" />' +
          '<button type="button" class="btn btn-outline btn-sm level-plus" aria-label="Increase level">+</button>' +
          "</span></td>" +
          '<td class="ts-col">' + esc(fmtTs(u.createdAt)) + "</td>" +
          '<td class="flex">' +
          '<button class="btn btn-outline btn-sm act-setpass" data-wxid="' + escAttr(u.wxId) + '">' + t("setPassword") + "</button>" +
          '<button class="btn btn-danger btn-sm act-del-user" data-wxid="' + escAttr(u.wxId) + '">' + t("delete") + "</button>" +
          "</td></tr>" +
          '<tr class="detail-row hidden"><td colspan="5">' + detail + "</td></tr>"
        );
      })
      .join("");
    renderUserPagination();
  } catch (e) { toast(t("networkError") + ": " + e.message, "error"); }
  setLabels();
}
async function saveLevel(wxId, level) {
  try {
    const res = await fetch("/admin/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wxId, level: Number(level) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("levelFail"), "error"); return; }
    toast(t("levelUpdated"), "success");
  } catch (e) { toast(t("networkError"), "error"); }
}
function openSetPass(wxId) {
  targetWxId = wxId;
  newUserPass.value = "";
  passOverlay.classList.remove("hidden");
  newUserPass.focus();
}
function openAddUser() {
  newUserWxid.value = "";
  newUserPw.value = "";
  addUserOverlay.classList.remove("hidden");
  newUserWxid.focus();
}
function closeAddUser() { addUserOverlay.classList.add("hidden"); }
addUserCancel.onclick = closeAddUser;
addUserOverlay.onclick = (e) => { if (e.target === addUserOverlay) closeAddUser(); };
addUserSave.onclick = async () => {
  const wxId = newUserWxid.value.trim();
  const password = newUserPw.value;
  if (!wxId) { toast(t("addUserEmptyWxid"), "error"); return; }
  if (password.length < 8) { toast(t("passTooShort"), "error"); return; }
  try {
    const res = await fetch("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wxId, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("addUserFail"), "error"); return; }
    toast(t("addUserOk", wxId), "success");
    closeAddUser();
    loadUsers();
  } catch (e) { toast(t("networkError"), "error"); }
};
function closePass() { passOverlay.classList.add("hidden"); }
passCancel.onclick = closePass;
passOverlay.onclick = (e) => { if (e.target === passOverlay) closePass(); };
passSave.onclick = async () => {
  const password = newUserPass.value;
  if (password.length < 8) { toast(t("passTooShort"), "error"); return; }
  try {
    const res = await fetch("/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wxId: targetWxId, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("setPassFail"), "error"); return; }
    toast(t("setPassOk", targetWxId), "success");
    closePass();
  } catch (e) { toast(t("networkError"), "error"); }
};
function askDeleteUser(wxId) {
  showModal(t("delUserTitle"), t("delUserBody", wxId), () => doDeleteUser(wxId));
}
async function doDeleteUser(wxId) {
  try {
    const res = await fetch("/admin/users/" + encodeURIComponent(wxId), { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("delUserFail"), "error"); return; }
    toast(t("userDeleted"), "success");
    // 删除后若当前页可能变空，先回退一页再加载
    if (userPage > 1) {
      const checkRes = await fetch("/admin/users?page=" + userPage + "&pageSize=" + userPageSize);
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkData.rows || checkData.rows.length === 0) userPage = Math.max(1, userPage - 1);
    }
    loadUsers();
  } catch (e) { toast(t("networkError"), "error"); }
}
let msgPage = 1;
let msgPageSize = 20;
let msgTotalPages = 1;
let msgTotal = 0;

function resetMsgPage() {
  msgPage = 1;
  loadMsgs();
}

function goToMsgPage(p) {
  if (p < 1 || p > msgTotalPages || p === msgPage) return;
  msgPage = p;
  loadMsgs();
}

function changeMsgPageSize(size) {
  const n = parseInt(size, 10);
  if (!Number.isFinite(n) || n < 1) return;
  msgPageSize = n;
  msgPage = 1;
  loadMsgs();
}

function renderMsgPagination() {
  const el = $("msgPagination");
  if (!el) return;
  if (msgTotal === 0) { el.innerHTML = ""; return; }

  const buttons = [];
  const prevDis = msgPage <= 1 ? " disabled" : "";
  buttons.push('<button class="page-btn" onclick="goToMsgPage(' + (msgPage - 1) + ')"' + prevDis + ' aria-label="' + escAttr(t("prevPage")) + '">&laquo;</button>');

  const addPageBtn = (p, label, cls) => {
    const dis = p === msgPage ? " disabled" : "";
    buttons.push('<button class="page-btn ' + (cls || "") + '" onclick="goToMsgPage(' + p + ')"' + dis + ">" + label + "</button>");
  };
  const addEllipsis = () => buttons.push('<span class="page-btn page-ellipsis">&hellip;</span>');

  const pages = new Set([1, msgPage - 1, msgPage, msgPage + 1, msgTotalPages]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= msgTotalPages).sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) addEllipsis();
    addPageBtn(p, p, p === msgPage ? "page-active" : "");
    prev = p;
  }

  const nextDis = msgPage >= msgTotalPages ? " disabled" : "";
  buttons.push('<button class="page-btn" onclick="goToMsgPage(' + (msgPage + 1) + ')"' + nextDis + ' aria-label="' + escAttr(t("nextPage")) + '">&raquo;</button>');

  const sizeOptions = [10, 20, 50, 100]
    .map((n) => '<option value="' + n + '"' + (n === msgPageSize ? " selected" : "") + ">" + n + "</option>")
    .join("");
  const sizeSelect = '<span class="page-info">' + t("pageOf", msgPage, msgTotalPages) + '</span><span class="page-info">' + t("pageSizeLabel") + '</span><select class="page-size-select" onchange="changeMsgPageSize(this.value)">' + sizeOptions + "</select>";

  el.innerHTML = buttons.join("") + sizeSelect;
}

async function loadMsgs() {
  try {
    const params = new URLSearchParams();
    const fwx = $("fWxid").value.trim(), fq = $("fContent").value.trim();
    if (fwx) params.set("wxId", fwx);
    if (fq) params.set("q", fq);
    params.set("page", msgPage);
    params.set("pageSize", msgPageSize);
    const qs = params.toString();
    const res = await fetch("/admin/messages" + (qs ? "?" + qs : ""));
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("loadMsgsFail"), "error"); return; }
    const data = await res.json();
    const rows = data.rows || [];
    msgTotal = data.total || 0;
    msgTotalPages = data.totalPages || 1;
    if (msgPage > msgTotalPages) msgPage = 1;
    $("msgCount").textContent = msgTotal;
    $("msgTbody").innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              "<tr>" +
              '<td class="uuid-col">' + esc(r.wxId) + "</td>" +
              '<td class="msg-col" title="' + escAttr(r.content) + '">' + esc(r.content) + "</td>" +
              "<td>" + esc(r.reads) + "</td>" +
              '<td class="ts-col">' + esc(fmtTs(r.timestamp)) + "</td>" +
              '<td><button class="btn btn-danger btn-sm act-del-msg" data-id="' + escAttr(r.id) + '">' + t("delete") + "</button></td>" +
              "</tr>"
          )
          .join("")
      : '<tr class="empty-row"><td colspan="5">' + t("noMessages") + "</td></tr>";
    renderMsgPagination();
  } catch (e) { toast(t("networkError"), "error"); }
  setLabels();
}
function askDeleteMsg(id) {
  showModal(t("delMsgTitle"), t("delMsgBody"), () => doDeleteMsg(id));
}
async function doDeleteMsg(id) {
  try {
    const res = await fetch("/admin/messages/" + encodeURIComponent(id), { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("delMsgFail"), "error"); return; }
    toast(t("msgDeleted"), "success");
    // 删除后若当前页可能变空，先回退一页再加载
    if (msgPage > 1) {
      const checkRes = await fetch("/admin/messages?page=" + msgPage + "&pageSize=" + msgPageSize);
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkData.rows || checkData.rows.length === 0) msgPage = Math.max(1, msgPage - 1);
    }
    loadMsgs();
  } catch (e) { toast(t("networkError"), "error"); }
}
function askClearUser() {
  const wxId = $("fDelWxid").value.trim();
  if (!wxId) { toast(t("enterWxid"), "error"); return; }
  showModal(t("wipeTitle"), t("wipeBody", wxId), () => doClearUser(wxId));
}
async function doClearUser(wxId) {
  try {
    const res = await fetch("/admin/messages?wxId=" + encodeURIComponent(wxId), { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("failed"), "error"); return; }
    toast(t("dataWiped"), "success");
    loadMsgs();
  } catch (e) { toast(t("networkError"), "error"); }
}
async function logout() {
  try { await fetch("/auth/logout", { method: "POST" }); } catch {}
  location.href = "/";
}

/* ── 全局 IP 黑名单（仅管理员；仅自定义 IP，无一键拉黑） ── */
async function loadGlobalIps() {
  try {
    const res = await fetch("/admin/ip-block");
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("loadIpFail"), "error"); return; }
    const data = await res.json();
    $("globalIpCount").textContent = data.count || 0;
    $("globalIpTbody").innerHTML = data.ips.length
      ? data.ips
          .map(
            (r) =>
              "<tr>" +
              '<td class="uuid-col">' + esc(r.ip) + "</td>" +
              '<td class="ts-col">' + esc(fmtTs(r.createdAt)) + "</td>" +
              '<td><button class="btn btn-danger btn-sm act-del-ip" data-ip="' + escAttr(r.ip) + '">' + t("delete") + "</button></td>" +
              "</tr>",
          )
          .join("")
      : '<tr class="empty-row"><td colspan="3">' + t("noBlacklistIps") + "</td></tr>";
  } catch (e) { toast(t("networkError") + ": " + e.message, "error"); }
  setLabels();
}
async function addGlobalIp() {
  const input = $("fGlobalIp");
  const ip = input.value.trim();
  try {
    const res = await fetch("/admin/ip-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(res.status === 400 ? t("invalidIp") : data.error === "exists" ? t("ipExists") : data.error || t("addIpFail"), "error"); return; }
    toast(t("ipAdded"), "success");
    input.value = "";
    loadGlobalIps();
  } catch (e) { toast(t("networkError"), "error"); }
}
async function removeGlobalIp(ip) {
  try {
    const res = await fetch("/admin/ip-block?ip=" + encodeURIComponent(ip), { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("removeIpFail"), "error"); return; }
    toast(t("ipRemoved"), "success");
    loadGlobalIps();
  } catch (e) { toast(t("networkError"), "error"); }
}

/* ── 等级权益 ── */
const levelPreviewTbody = $("levelPreviewTbody");
const levelFormulaInputs = {
  message: $("formulaMessage"),
  geo: $("formulaGeo"),
  retentionMonths: $("formulaRetention"),
};
let levelValues = { message: [], geo: [], retentionMonths: [] };
let formulaPreviewTimer = null;

function renderLevelTable() {
  const rows = [];
  for (let lv = 1; lv <= 20; lv++) {
    rows.push(
      "<tr>" +
        "<td>" + lv + "</td>" +
        '<td class="lv-preview-col">' + (levelValues.message[lv - 1] ?? "—") + "</td>" +
        '<td class="lv-preview-col">' + (levelValues.geo[lv - 1] ?? "—") + "</td>" +
        '<td class="lv-preview-col">' + (levelValues.retentionMonths[lv - 1] ?? "—") + "</td>" +
        "</tr>",
    );
  }
  levelPreviewTbody.innerHTML = rows.join("");
  Array.from(levelPreviewTbody.querySelectorAll("tr")).forEach((tr) => {
    const tds = tr.cells;
    tds[0].setAttribute("data-label", t("level"));
    tds[1].setAttribute("data-label", t("benefitMessages"));
    tds[2].setAttribute("data-label", t("benefitGeo"));
    tds[3].setAttribute("data-label", t("benefitRetention"));
  });
}

async function loadLevels() {
  try {
    const res = await fetch("/admin/levels");
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("loadLevelsFail"), "error"); return; }
    const data = await res.json();
    levelFormulaInputs.message.value = data.message.formula;
    levelFormulaInputs.geo.value = data.geo.formula;
    levelFormulaInputs.retentionMonths.value = data.retentionMonths.formula;
    levelValues.message = data.message.values;
    levelValues.geo = data.geo.values;
    levelValues.retentionMonths = data.retentionMonths.values;
    renderLevelTable();
  } catch (e) { toast(t("networkError"), "error"); }
}

function onFormulaInput(dim) {
  clearTimeout(formulaPreviewTimer);
  formulaPreviewTimer = setTimeout(() => previewDim(dim), 300);
}

async function previewDim(dim) {
  const formula = levelFormulaInputs[dim].value.trim();
  try {
    const res = await fetch("/admin/levels/preview?formula=" + encodeURIComponent(formula));
    const data = await res.json();
    if (!data.valid) { toast(t("formulaInvalid") + ": " + data.error, "error"); return; }
    levelValues[dim] = data.values;
    renderLevelTable();
  } catch (e) { toast(t("networkError"), "error"); }
}

async function saveLevels() {
  const body = {
    message: levelFormulaInputs.message.value,
    geo: levelFormulaInputs.geo.value,
    retentionMonths: levelFormulaInputs.retentionMonths.value,
  };
  try {
    const res = await fetch("/admin/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("saveLevelsFail"), "error"); return; }
    toast(t("levelsSaved"), "success");
    loadLevels();
  } catch (e) { toast(t("networkError"), "error"); }
}
function toggleUserRow(row) {
  const detail = row.nextElementSibling;
  if (!detail || !detail.classList.contains("detail-row")) return;
  const open = detail.classList.toggle("hidden");
  row.classList.toggle("expanded", !open);
}
function expandAllUsers() {
  document.querySelectorAll("#userTbody > tr:not(.detail-row)").forEach((row) => {
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains("detail-row")) {
      detail.classList.remove("hidden");
      row.classList.add("expanded");
    }
  });
}
function collapseAllUsers() {
  document.querySelectorAll("#userTbody > tr:not(.detail-row)").forEach((row) => {
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains("detail-row")) {
      detail.classList.add("hidden");
      row.classList.remove("expanded");
    }
  });
}
async function toggleLatestMsgs(btn) {
  const card = btn.closest(".detail-card");
  const list = card && card.querySelector(".msg-list");
  if (!list) return;
  if (!list.classList.contains("hidden")) {
    list.classList.add("hidden");
    btn.textContent = t("viewLatestMsgs");
    return;
  }
  if (list.dataset.loaded === "1") {
    list.classList.remove("hidden");
    btn.textContent = t("hideLatestMsgs");
    return;
  }
  btn.disabled = true;
  try {
    const wxId = btn.dataset.wxid;
    if (!wxId) { toast(t("enterWxid"), "error"); return; }
    const res = await fetch("/admin/messages?wxId=" + encodeURIComponent(wxId) + "&pageSize=5");
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("loadMsgsFail"), "error"); return; }
    const data = await res.json();
    const rows = data.rows || [];
    list.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              '<div class="msg-list-item">' +
              '<div class="msg-list-content" title="' + escAttr(r.content) + '">' + esc(r.content) + "</div>" +
              '<div class="msg-list-meta"><span class="reads">' + esc(r.reads) + " " + t("reads") + '</span><span class="ts-col">' + esc(fmtTs(r.timestamp)) + "</span></div>" +
              "</div>",
          )
          .join("")
      : '<div class="msg-list-empty">' + t("noLatestMsgs") + "</div>";
    list.dataset.loaded = "1";
    list.classList.remove("hidden");
    btn.textContent = t("hideLatestMsgs");
  } catch (e) {
    toast(t("networkError") + ": " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}
function initAdminHandlers() {
  const ut = $("userTbody");
  ut.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const editor = btn.closest(".level-editor");
    if (editor) {
      const input = editor.querySelector(".level-input");
      let v = parseInt(input.value, 10);
      if (Number.isNaN(v)) v = 0;
      v = btn.classList.contains("level-plus") ? Math.min(99, v + 1) : Math.max(0, v - 1);
      input.value = v;
      saveLevel(editor.dataset.wxid, v);
      return;
    }
    if (btn.classList.contains("expand-btn")) { toggleUserRow(btn.closest("tr")); return; }
    if (btn.classList.contains("act-msgs")) { toggleLatestMsgs(btn); return; }
    const wxid = btn.dataset.wxid;
    if (btn.classList.contains("act-setpass")) openSetPass(wxid);
    else if (btn.classList.contains("act-del-user")) askDeleteUser(wxid);
  });
  ut.addEventListener("change", (e) => {
    const input = e.target.closest(".level-input");
    if (!input) return;
    const editor = input.closest(".level-editor");
    let v = parseInt(input.value, 10);
    if (Number.isNaN(v)) v = 0;
    v = Math.max(0, Math.min(99, v));
    input.value = v;
    saveLevel(editor.dataset.wxid, v);
  });
  const mt = $("msgTbody");
  mt.addEventListener("click", (e) => {
    const btn = e.target.closest(".act-del-msg");
    if (!btn) return;
    askDeleteMsg(btn.dataset.id);
  });
  const gt = $("globalIpTbody");
  gt.addEventListener("click", (e) => {
    const btn = e.target.closest(".act-del-ip");
    if (!btn) return;
    removeGlobalIp(btn.dataset.ip);
  });
}
showTab("users");
initAdminHandlers();
</script>
</body>
</html>`; }
