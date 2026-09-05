import type { AdminSession } from "../types";
import { safeJson } from "../../utils";
import { frontendHelpers } from "../shared";

export function adminScript(session: AdminSession): string {
  const inner = `
const ME = ${safeJson({ wxId: session.wxId })};
const $ = (id) => document.getElementById(id);
let lang = localStorage.getItem("lang") || "zh-CN";
const translations = {
  "zh-CN": {
    title: "管理后台",
    dashboard: "仪表盘",
    logout: "退出登录",
    themeLight: "浅色",
    themeDark: "深色",
    tabUsers: "用户",
    tabMsgs: "消息",
    tabLevels: "等级权益",
    tabRetention: "僵尸清理",
    tabBlock: "全局 IP 黑名单",
    retentionHint: "两条规则独立判断，0 表示不清理。清理会删除用户及其全部消息、已读记录，并同步清空该用户在注册榜/已读榜/消息榜上的记录（外键级联）。管理员账号与已停用（等级 0）的账号永不自动清理。保存后立即生效，无需重启。",
    retentionNewUser: "注册后从未注册消息（天）",
    retentionDormant: "注册过但已沉寂（天）",
    saveRetention: "保存清理策略",
    retentionSaved: "已保存，立即生效",
    saveRetentionFail: "保存失败",
    loadRetentionFail: "加载清理策略失败",
    previewRetention: "预演",
    previewRetentionFail: "预演失败",
    runRetention: "立即清理",
    retentionReason: "命中原因",
    retentionLastReg: "最后注册消息",
    reasonNever: "从未注册消息",
    reasonDormant: "长期未注册消息",
    retentionPreviewEmpty: "当前策略下没有会被清理的用户",
    retentionSummary: "将清理 {0} 个（从未注册 {1} / 长期沉寂 {2}）",
    retentionSkipped: "；另有 {0} 个命中但受豁免",
    retentionTruncated: "（本次已达上限，剩余留待下次）",
    retentionRunTitle: "立即清理？",
    retentionRunBody: "将删除 {0} 个用户及其全部消息、已读记录与排行榜记录。此操作不可撤销。",
    retentionRunDone: "已清理 {0} 个用户",
    retentionRunFail: "清理失败",
    retentionInvalidDays: "天数需为 0 到 {0} 之间的整数",
    orphanCleanupHint: "历史遗留：曾用外部工具（未开启外键）删除用户时，注册榜/已读榜/消息榜可能残留「父用户已不存在」的孤儿行，导致已删用户仍显示在榜上。可在此手动清理。",
    checkOrphans: "检测孤儿排行榜行",
    checkOrphansFail: "检测失败",
    cleanOrphans: "清理孤儿排行榜",
    orphanTable: "数据表",
    orphanCount: "孤儿行数",
    orphanSummary: "共发现 {0} 行孤儿记录",
    orphanNone: "未检测到孤儿排行榜行",
    orphanCleanTitle: "清理孤儿排行榜？",
    orphanCleanBody: "将删除 {0} 行「父用户已不存在」的排行榜记录（注册榜/已读榜/消息榜）。此操作不可撤销。",
    orphanCleanDone: "已清理 {0} 行孤儿记录",
    cleanOrphansFail: "清理失败",
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
    themeLight: "Light",
    themeDark: "Dark",
    tabUsers: "Users",
    tabMsgs: "Messages",
    tabLevels: "Levels",
    tabRetention: "Retention",
    tabBlock: "IP Blacklist",
    retentionHint: "The two rules are evaluated independently; 0 disables a rule. Purging deletes the user together with all their messages, read records, and their rows on the registration/read/message leaderboards (foreign key cascade). Admin accounts and disabled accounts (level 0) are never purged. Changes take effect immediately, no restart needed.",
    retentionNewUser: "Days since signup, never registered a message",
    retentionDormant: "Days since last registered message",
    saveRetention: "Save Policy",
    retentionSaved: "Saved. Takes effect immediately.",
    saveRetentionFail: "Failed to save",
    loadRetentionFail: "Failed to load retention policy",
    previewRetention: "Preview",
    previewRetentionFail: "Preview failed",
    runRetention: "Purge now",
    retentionReason: "Reason",
    retentionLastReg: "Last registered message",
    reasonNever: "Never registered a message",
    reasonDormant: "Silent for too long",
    retentionPreviewEmpty: "No users match the current policy",
    retentionSummary: "{0} users will be purged (never registered {1} / silent {2})",
    retentionSkipped: "; {0} more matched but are exempt",
    retentionTruncated: " (batch limit reached, the rest will follow next run)",
    retentionRunTitle: "Purge now?",
    retentionRunBody: "This deletes {0} users along with all their messages, read records and leaderboard rows. This cannot be undone.",
    retentionRunDone: "Purged {0} users",
    retentionRunFail: "Purge failed",
    retentionInvalidDays: "Days must be an integer between 0 and {0}",
    orphanCleanupHint: "Legacy orphans: if users were ever deleted via external tools (foreign keys off), the registration/read/message leaderboard tables may retain rows whose user no longer exists, so deleted users still show on the boards. Clean them here.",
    checkOrphans: "Check orphan leaderboard rows",
    checkOrphansFail: "Check failed",
    cleanOrphans: "Clean orphan leaderboard",
    orphanTable: "Table",
    orphanCount: "Orphan rows",
    orphanSummary: "{0} orphan rows found",
    orphanNone: "No orphan leaderboard rows detected",
    orphanCleanTitle: "Clean orphan leaderboard?",
    orphanCleanBody: "This will delete {0} leaderboard rows whose user no longer exists (registration/read/message boards). This cannot be undone.",
    orphanCleanDone: "Cleaned {0} orphan rows",
    cleanOrphansFail: "Clean failed",
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
function toggleLang() {
  lang = lang === "zh-CN" ? "en" : "zh-CN";
  localStorage.setItem("lang", lang);
  applyI18n();
  if ($("tabUsers").classList.contains("active")) loadUsers();
  else if ($("tabMsgs").classList.contains("active")) loadMsgs();
  else if ($("tabRetention").classList.contains("active")) {
    loadRetention();
    // 仅当预演结果已展开时才重新拉取，避免切语言把隐藏区块顶出来
    if (!$("retentionPreviewWrap").classList.contains("hidden")) previewRetention();
  }
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
  // 首列为展开按钮，占位空字符串跳过，保证后续标签与单元格一一对齐
  apply($("userTbody"), ["", "wxId", t("level"), t("registered"), t("actions")]);
  apply($("msgTbody"), ["wxId", t("message"), t("reads"), t("timestamp"), t("actions")]);
  apply($("retentionTbody"), ["wxId", t("retentionReason"), t("registered"), t("retentionLastReg")]);
  apply($("globalIpTbody"), [t("ipAddressCol"), t("addedAt"), t("actions")]);
}
applyI18n();
initTheme();
const toastContainer = $("toastContainer");
const modalOverlay = $("modalOverlay"), modalTitle = $("modalTitle"), modalBody = $("modalBody"), modalCancel = $("modalCancel"), modalConfirm = $("modalConfirm");
const passOverlay = $("passOverlay"), newUserPass = $("newUserPass"), passCancel = $("passCancel"), passSave = $("passSave");
const addUserOverlay = $("addUserOverlay"), newUserWxid = $("newUserWxid"), newUserPw = $("newUserPw"), addUserCancel = $("addUserCancel"), addUserSave = $("addUserSave");
let targetWxId = "";

$("adminName").textContent = ME.wxId;

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
let modalKeyCleanup = null, passKeyCleanup = null, addUserKeyCleanup = null;
function showModal(title, body, onConfirm){
  modalTitle.textContent = title;
  modalBody.textContent = body;
  modalOverlay.classList.remove("hidden");
  const cleanup = () => {
    modalOverlay.classList.add("hidden");
    modalConfirm.onclick = null;
    if (modalKeyCleanup) { modalKeyCleanup(); modalKeyCleanup = null; }
  };
  modalCancel.onclick = cleanup;
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) cleanup(); };
  modalConfirm.onclick = () => { cleanup(); onConfirm(); };
  modalKeyCleanup = bindModalKeys(modalOverlay, cleanup);
}
function showTab(name){
  $("tabUsers").classList.toggle("active", name === "users");
  $("tabMsgs").classList.toggle("active", name === "msgs");
  $("tabLevels").classList.toggle("active", name === "levels");
  $("tabRetention").classList.toggle("active", name === "retention");
  $("tabBlock").classList.toggle("active", name === "block");
  $("secUsers").classList.toggle("hidden", name !== "users");
  $("secMsgs").classList.toggle("hidden", name !== "msgs");
  $("secLevels").classList.toggle("hidden", name !== "levels");
  $("secRetention").classList.toggle("hidden", name !== "retention");
  $("secBlock").classList.toggle("hidden", name !== "block");
  if (name === "users") loadUsers();
  else if (name === "msgs") loadMsgs();
  else if (name === "retention") loadRetention();
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
  passKeyCleanup = bindModalKeys(passOverlay, closePass);
}
function openAddUser() {
  newUserWxid.value = "";
  newUserPw.value = "";
  addUserOverlay.classList.remove("hidden");
  addUserKeyCleanup = bindModalKeys(addUserOverlay, closeAddUser);
}
function closeAddUser() {
  addUserOverlay.classList.add("hidden");
  if (addUserKeyCleanup) { addUserKeyCleanup(); addUserKeyCleanup = null; }
}
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
function closePass() {
  passOverlay.classList.add("hidden");
  if (passKeyCleanup) { passKeyCleanup(); passKeyCleanup = null; }
}
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
              '<td class="msg-col" data-id="' + escAttr(r.id) + '" title="' + escAttr(r.content) + '">' + esc(r.content) + "</td>" +
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
/* ── 僵尸用户清理 ── */
let retentionMaxDays = 36500;
let retentionPage = 1;
let retentionPageSize = 20;
let retentionTotal = 0;
let retentionTotalPages = 1;

async function loadRetention() {
  try {
    const res = await fetch("/admin/retention");
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("loadRetentionFail"), "error"); return; }
    const data = await res.json();
    retentionMaxDays = data.maxDays || retentionMaxDays;
    $("retentionNewUserDays").value = data.newUserDays;
    $("retentionDormantDays").value = data.dormantDays;
  } catch (e) { toast(t("networkError") + ": " + e.message, "error"); }
}

async function saveRetention() {
  const newUserDays = Number($("retentionNewUserDays").value);
  const dormantDays = Number($("retentionDormantDays").value);
  const invalid = (n) => !Number.isInteger(n) || n < 0 || n > retentionMaxDays;
  if (invalid(newUserDays) || invalid(dormantDays)) {
    toast(t("retentionInvalidDays", retentionMaxDays), "error");
    return;
  }
  try {
    const res = await fetch("/admin/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newUserDays, dormantDays }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("saveRetentionFail"), "error"); return; }
    toast(t("retentionSaved"), "success");
    $("retentionPreviewWrap").classList.add("hidden");
    retentionPage = 1;
  } catch (e) { toast(t("networkError"), "error"); }
}

async function previewRetention(reset = false) {
  if (reset) retentionPage = 1;
  try {
    const res = await fetch("/admin/retention/preview?page=" + retentionPage + "&pageSize=" + retentionPageSize);
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("previewRetentionFail"), "error"); return; }
    const data = await res.json();
    retentionTotal = data.purgeable || 0;
    retentionTotalPages = data.totalPages || 1;
    if (retentionPage > retentionTotalPages) { retentionPage = 1; await previewRetention(); return; }
    if (!data.purgeable) {
      $("retentionSummary").textContent = t("retentionPreviewEmpty");
      $("retentionTbody").innerHTML = "";
      $("retentionPagination").innerHTML = "";
      $("retentionPreviewWrap").classList.remove("hidden");
      setLabels();
      return;
    }
    let summary = t("retentionSummary", data.purgeable, data.never, data.dormant);
    if (data.protectedCount) summary += t("retentionSkipped", data.protectedCount);
    if (data.truncated) summary += t("retentionTruncated");
    $("retentionSummary").textContent = summary;
    $("retentionTbody").innerHTML = (data.samples || [])
      .map(
        (u) =>
          "<tr>" +
          '<td class="uuid-col">' + esc(u.wxId) + "</td>" +
          "<td>" + esc(u.reason === "never" ? t("reasonNever") : t("reasonDormant")) + "</td>" +
          '<td class="ts-col">' + esc(fmtTs(u.createdAt)) + "</td>" +
          '<td class="ts-col">' + esc(u.lastRegAt || "—") + "</td>" +
          "</tr>",
      )
      .join("");
    $("retentionPreviewWrap").classList.remove("hidden");
    renderRetentionPagination();
  } catch (e) { toast(t("networkError") + ": " + e.message, "error"); }
  setLabels();
}

function goToRetentionPage(p) {
  if (p < 1 || p > retentionTotalPages || p === retentionPage) return;
  retentionPage = p;
  previewRetention();
}

function changeRetentionPageSize(size) {
  const n = parseInt(size, 10);
  if (!Number.isFinite(n) || n < 1) return;
  retentionPageSize = n;
  retentionPage = 1;
  previewRetention();
}

function renderRetentionPagination() {
  const el = $("retentionPagination");
  if (!el) return;
  if (retentionTotal === 0) { el.innerHTML = ""; return; }

  const buttons = [];
  const prevDis = retentionPage <= 1 ? " disabled" : "";
  buttons.push('<button class="page-btn" onclick="goToRetentionPage(' + (retentionPage - 1) + ')"' + prevDis + ' aria-label="' + escAttr(t("prevPage")) + '">&laquo;</button>');

  const addPageBtn = (p, label, cls) => {
    const dis = p === retentionPage ? " disabled" : "";
    buttons.push('<button class="page-btn ' + (cls || "") + '" onclick="goToRetentionPage(' + p + ')"' + dis + ">" + label + "</button>");
  };
  const addEllipsis = () => buttons.push('<span class="page-btn page-ellipsis">&hellip;</span>');

  const pages = new Set([1, retentionPage - 1, retentionPage, retentionPage + 1, retentionTotalPages]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= retentionTotalPages).sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) addEllipsis();
    addPageBtn(p, p, p === retentionPage ? "page-active" : "");
    prev = p;
  }

  const nextDis = retentionPage >= retentionTotalPages ? " disabled" : "";
  buttons.push('<button class="page-btn" onclick="goToRetentionPage(' + (retentionPage + 1) + ')"' + nextDis + ' aria-label="' + escAttr(t("nextPage")) + '">&raquo;</button>');

  const sizeOptions = [10, 20, 50, 100]
    .map((n) => '<option value="' + n + '"' + (n === retentionPageSize ? " selected" : "") + ">" + n + "</option>")
    .join("");
  const sizeSelect = '<span class="page-info">' + t("pageOf", retentionPage, retentionTotalPages) + '</span><span class="page-info">' + t("pageSizeLabel") + '</span><select class="page-size-select" onchange="changeRetentionPageSize(this.value)">' + sizeOptions + "</select>";

  el.innerHTML = buttons.join("") + sizeSelect;
}

/** 先按当前策略取一次数量再二次确认，避免确认框里的数字与点击瞬间的实况不一致 */
async function askRunRetention() {
  try {
    const res = await fetch("/admin/retention/preview?limit=1");
    if (!res.ok) { toast(t("previewRetentionFail"), "error"); return; }
    const data = await res.json();
    if (!data.purgeable) { toast(t("retentionPreviewEmpty"), "info"); return; }
    showModal(t("retentionRunTitle"), t("retentionRunBody", data.purgeable), runRetention);
  } catch (e) { toast(t("networkError"), "error"); }
}

async function runRetention() {
  try {
    const res = await fetch("/admin/retention/run", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("retentionRunFail"), "error"); return; }
    let msg = t("retentionRunDone", data.deleted);
    if (data.skipped) msg += t("retentionSkipped", data.skipped);
    if (data.truncated) msg += t("retentionTruncated");
    toast(msg, "success");
    await previewRetention(true);
    loadUsers();
  } catch (e) { toast(t("networkError"), "error"); }
}

/* ── 手动清理孤儿排行榜 ── */
async function checkOrphans() {
  try {
    const res = await fetch("/admin/retention/orphans");
    if (res.status === 401) { location.href = "/"; return; }
    if (!res.ok) { toast(t("checkOrphansFail"), "error"); return; }
    const data = await res.json();
    const o = data.orphans || {};
    const total = (o.registration_stats || 0) + (o.read_stats || 0) + (o.message_read_stats || 0);
    const rows = [
      ["registration_stats", o.registration_stats || 0],
      ["read_stats", o.read_stats || 0],
      ["message_read_stats", o.message_read_stats || 0],
    ];
    $("orphanTbody").innerHTML = rows
      .map(([tb, n]) => '<tr><td class="uuid-col">' + esc(tb) + "</td><td>" + n + "</td></tr>")
      .join("");
    $("orphanSummary").textContent = t("orphanSummary", total);
    $("orphanWrap").classList.remove("hidden");
    setLabels();
  } catch (e) { toast(t("networkError") + ": " + e.message, "error"); }
}

async function askCleanOrphans() {
  try {
    const res = await fetch("/admin/retention/orphans");
    if (!res.ok) { toast(t("checkOrphansFail"), "error"); return; }
    const data = await res.json();
    const o = data.orphans || {};
    const total = (o.registration_stats || 0) + (o.read_stats || 0) + (o.message_read_stats || 0);
    if (!total) { toast(t("orphanNone"), "info"); return; }
    showModal(t("orphanCleanTitle"), t("orphanCleanBody", total), cleanOrphans);
  } catch (e) { toast(t("networkError"), "error"); }
}

async function cleanOrphans() {
  try {
    const res = await fetch("/admin/retention/orphans", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || t("cleanOrphansFail"), "error"); return; }
    toast(t("orphanCleanDone", data.total), "success");
    await checkOrphans();
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
              '<div class="msg-list-item" data-id="' + escAttr(r.id) + '">' +
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
    const item = e.target.closest(".msg-list-item");
    if (item) { location.href = "/reads/" + encodeURIComponent(item.dataset.id); return; }
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
    if (btn) { askDeleteMsg(btn.dataset.id); return; }
    const cell = e.target.closest(".msg-col");
    if (cell) { location.href = "/reads/" + encodeURIComponent(cell.dataset.id); return; }
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
`;
  return `<script>${frontendHelpers()}\n${inner}</script>`;
}
