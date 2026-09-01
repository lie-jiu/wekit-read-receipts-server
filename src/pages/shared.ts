/**
 * 前端共享运行时（浏览器内联脚本）。
 *
 * 原先 dashboard(×3) 与 admin 各自复制了一份 esc/escAttr/t/applyI18n，
 * 现统一抽到此处，由页面在 <script> 顶部注入 ${frontendHelpers()} 复用，
 * 既消除 4 份重复，又顺手统一了两版不一致的转义（dashboard 旧版 escAttr
 * 未转义 > " '，存在 XSS 短板，此处采用 admin 的严格版）。
 *
 * 注意：本文件返回的是「浏览器端 JS 源码字符串」，因为内联 <script> 是
 * 原生浏览器 JS，无法 import TS 模块。各页面的 translations / lang / ME
 * 仍由各页面自己声明，本运行时只依赖这些全局量（调用时才取值，安全）。
 */

export function frontendHelpers(): string {
  return `function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escAttr(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function t(key, ...args){
  let s = (translations[lang] && translations[lang][key]) || key;
  args.forEach((a, i) => { s = s.split("{" + i + "}").join(a); });
  return s;
}
/* 模态框键盘可达：Esc 关闭 + Tab 焦点陷阱 + 关闭后焦点还给触发元素。
   onClose 由调用方提供（真正隐藏 overlay 的那段逻辑）；返回值是清理函数。 */
function modalFocusables(root){
  return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.disabled && el.offsetParent !== null);
}
function bindModalKeys(overlay, onClose){
  const prevFocus = document.activeElement;
  const first = modalFocusables(overlay)[0];
  (first || overlay).focus();
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab") return;
    const f = modalFocusables(overlay);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };
  document.addEventListener("keydown", onKey, true);
  return () => {
    document.removeEventListener("keydown", onKey, true);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
}
function applyI18n(){
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (el.tagName === "TITLE") document.title = t(key);
    else if ("i18nPlaceholder" in el.dataset) el.placeholder = t(key);
    else el.textContent = t(key);
  });
  const chip = document.getElementById("userChip");
  if (chip && typeof ME !== "undefined" && ME && ME.retentionMonths != null) {
    const ret = ME.retentionMonths > 0 ? ME.retentionMonths : t("unlimited");
    chip.title = t("quotaHint", ME.level, ME.messageQuota, ret);
  }
  document.documentElement.lang = lang;
  updateThemeBtn();
}
/* 明暗主题：localStorage 持久化 + <html data-theme> 驱动 CSS 变量切换。
   暗色是默认；页面若在 JS 前闪一下深色，属于设计预期。 */
function themeBtnLabel(){
  const dark = (document.documentElement.dataset.theme || "dark") === "dark";
  return dark ? t("themeLight") : t("themeDark");
}
function updateThemeBtn(){
  document.querySelectorAll(".theme-toggle").forEach((b) => { b.textContent = themeBtnLabel(); });
}
function setTheme(name){
  const h = document.documentElement;
  h.dataset.theme = name;
  try { localStorage.setItem("theme", name); } catch {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", name === "light" ? "#f1f5f9" : "#0f172a");
  updateThemeBtn();
}
function toggleTheme(){
  setTheme((document.documentElement.dataset.theme || "dark") === "dark" ? "light" : "dark");
}
function initTheme(){
  let t = "dark";
  try { t = localStorage.getItem("theme") || "dark"; } catch {}
  setTheme(t);
}`;
}
