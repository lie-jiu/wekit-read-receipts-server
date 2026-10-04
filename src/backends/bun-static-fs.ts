import type { StaticReader } from "../spa";

/**
 * Bun 部署的 SPA 静态文件后端（Workers 构建不包含本文件，那边由 assets 绑定在边缘回文件）。
 *
 * relPath 来自 src/spa.ts 的显式白名单（`assets/<名>` 或根目录 `<名>.<扩展>`，
 * 字符集限定为字母数字与 . _ -，且刻意不做 percent-decode），
 * 因此这里拼出的路径不可能越出 dist 目录。
 */
export function bunStaticReader(distDir: string): StaticReader {
  const root = distDir.replace(/[/\\]+$/, "");
  return async (relPath: string): Promise<Response | null> => {
    const file = Bun.file(`${root}/${relPath}`);
    if (!(await file.exists())) return null;
    // Bun.file 作为 body 时按扩展名自动给出 Content-Type（JS 必须是 text/javascript，
    // 否则浏览器会以 "script src answered with a non-JavaScript MIME type" 拒绝执行 module）
    return new Response(file);
  };
}

/** 部署自检用：产物在不在（dist 不进版本库，忘了构建是最常见的一次 404 原因） */
export async function spaBuilt(distDir: string): Promise<boolean> {
  return Bun.file(`${distDir.replace(/[/\\]+$/, "")}/index.html`).exists();
}
