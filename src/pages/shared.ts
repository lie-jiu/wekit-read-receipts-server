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
}`;
}
