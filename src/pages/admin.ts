import type { AdminSession } from "./types";
import { safeJson } from "../utils";
import { frontendHelpers } from "./shared";
import { adminStyle } from "./admin/admin-style";
import { adminScript } from "./admin/admin-script";

export function adminPage(session: AdminSession): string {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="theme-color" content="#0f172a"/>
<title data-i18n="title">Admin — Read Receipts</title>
${adminStyle()}
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
      <button type="button" class="theme-toggle" onclick="toggleTheme()"></button>
      <a class="btn btn-outline btn-sm" href="/" data-i18n="dashboard">Dashboard</a>
      <button class="btn btn-outline btn-sm" onclick="logout()" data-i18n="logout">Logout</button>
    </div>
  </div>
  <div class="tabs">
    <button id="tabUsers" class="tab active" onclick="showTab('users')" data-i18n="tabUsers">Users</button>
    <button id="tabMsgs" class="tab" onclick="showTab('msgs')" data-i18n="tabMsgs">Messages</button>
    <button id="tabLevels" class="tab" onclick="showTab('levels')" data-i18n="tabLevels">Levels</button>
    <button id="tabRetention" class="tab" onclick="showTab('retention')" data-i18n="tabRetention">Retention</button>
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
  <div id="secRetention" class="hidden">
    <div class="controls">
      <span class="levels-hint" data-i18n="retentionHint"></span>
    </div>
    <div class="table-wrapper">
      <table>
        <tbody>
          <tr>
            <td class="uuid-col" data-label="" data-i18n="retentionNewUser">Days since signup, never registered a message</td>
            <td><input id="retentionNewUserDays" class="retention-input" type="number" min="0" step="1"/></td>
          </tr>
          <tr>
            <td class="uuid-col" data-label="" data-i18n="retentionDormant">Days since last registered message</td>
            <td><input id="retentionDormantDays" class="retention-input" type="number" min="0" step="1"/></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="controls">
      <button class="btn btn-primary" onclick="saveRetention()" data-i18n="saveRetention">Save Policy</button>
      <span class="sep">|</span>
      <button class="btn btn-secondary" onclick="previewRetention(true)" data-i18n="previewRetention">Preview</button>
      <button class="btn btn-danger" onclick="askRunRetention()" data-i18n="runRetention">Purge now</button>
    </div>
    <div class="table-wrapper hidden" id="retentionPreviewWrap">
      <div class="stats"><span id="retentionSummary"></span></div>
      <table>
        <thead><tr>
          <th>wxId</th>
          <th data-i18n="retentionReason">Reason</th>
          <th data-i18n="registered">Registered</th>
          <th data-i18n="retentionLastReg">Last registered message</th>
        </tr></thead>
        <tbody id="retentionTbody"></tbody>
      </table>
      <div class="pagination" id="retentionPagination"></div>
    </div>
    <hr class="section-sep" />
    <div class="controls">
      <span class="levels-hint" data-i18n="orphanCleanupHint"></span>
    </div>
    <div class="controls">
      <button class="btn btn-secondary" onclick="checkOrphans()" data-i18n="checkOrphans">Check orphan leaderboard rows</button>
      <span class="sep">|</span>
      <button class="btn btn-danger" onclick="askCleanOrphans()" data-i18n="cleanOrphans">Clean orphan leaderboard</button>
    </div>
    <div class="table-wrapper hidden" id="orphanWrap">
      <div class="stats"><span id="orphanSummary"></span></div>
      <table>
        <thead><tr>
          <th data-i18n="orphanTable">Table</th>
          <th data-i18n="orphanCount">Orphan rows</th>
        </tr></thead>
        <tbody id="orphanTbody"></tbody>
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
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <h3 id="modalTitle">Confirm</h3>
    <p id="modalBody"></p>
    <div class="actions">
      <button class="btn btn-secondary" id="modalCancel" data-i18n="cancel">Cancel</button>
      <button class="btn btn-danger" id="modalConfirm" data-i18n="confirm">Confirm</button>
    </div>
  </div>
</div>
<div id="passOverlay" class="modal-overlay hidden">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="passTitle">
    <h3 id="passTitle" data-i18n="setPassword">Set Password</h3>
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
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="addUserTitle">
    <h3 id="addUserTitle" data-i18n="addUserTitle">Add User</h3>
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

${adminScript(session)}
</body>
</html>`;
}
