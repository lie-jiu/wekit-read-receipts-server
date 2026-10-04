import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const noRenderStub = path.join(rootDir, 'src/stubs/no-render.tsx')

/**
 * sparkdesign 0.4.11 的 JS 入口是**单个** 576 kB 的 dist/spark-design.es.js，
 * 它在顶层静态 import 了整条 AI 聊天 / markdown 链（react-markdown + remark/rehype + katex
 * + lottie-react + prism-react-renderer）。它的 exports 图只暴露 "." 与几个 CSS，
 * 所以既不能深路径导入，bundler 也无法把没用到的组件从这一个文件里摇掉 ——
 * 主包因此虚胖到 2.78 MB / gzip 745 kB。
 *
 * 这里把这些包整体指向 src/stubs/no-render.tsx：本项目一个都不渲染它们。
 * 代价是"以后真要用 Spark 的 markdown / lottie 组件时会静默变空白"，
 * 所以下面 forbidStubbedDeps() 在构建期就把话说死：一旦这些包被真正解析到
 * node_modules（说明桩件被绕过或有人改了 alias），构建直接失败而不是留下白屏。
 *
 * 真要恢复这些能力，正确做法是走 sparkdesign 的逐组件 CLI（把需要的组件源码落地到
 * src/components/ui），而不是删掉这里的桩件。
 */
const STUBBED_DEPS = [
  'react-markdown',
  'remark-gfm',
  'remark-math',
  'rehype-katex',
  'lottie-react',
  'prism-react-renderer',
]

/** 桩件覆盖到这些包之后，它们自己的重依赖也不该再出现在图里 */
const FORBIDDEN_TRANSITIVES = ['katex', 'lottie-web', 'refractor', 'shiki']

function forbidStubbedDeps(): Plugin {
  const blocked = [...STUBBED_DEPS, ...FORBIDDEN_TRANSITIVES]
  return {
    name: 'forbid-stubbed-deps',
    // 正常路径下 alias 已经把它们截走了，这里只会看到"漏网"的那次解析
    enforce: 'post',
    resolveId(id) {
      const bare = id.startsWith('.') || id.startsWith('/') || path.isAbsolute(id) ? '' : id.split('/')[0]
      if (blocked.includes(bare) || blocked.includes(id)) {
        throw new Error(
          `[forbid-stubbed-deps] "${id}" 绕过了 src/stubs/no-render.tsx 的桩件。\n` +
            `要么在 vite.config.ts 的 STUBBED_DEPS 里为它补一条 alias，要么改用 sparkdesign 的逐组件 CLI。\n` +
            `不要直接删桩件 —— 那等于把 745 kB gzip 请回来。`,
        )
      }
      return null
    },
  }
}

/**
 * 本地开发把数据路径直接代理给 Bun 服务，前端请求仍是同源：
 * 会话 cookie 是 HttpOnly + SameSite=Lax，只有同源才不用动 CORS，
 * 也和「同一个进程同时发静态页 + API」的线上形态一致。
 * 列表 = 服务器全部 JSON 端点前缀（旧 SSR 页面退役后 `/` 归静态兜底，不在这里代理）。
 */
const DEV_API_PATHS = [
  '/auth',
  '/me',
  '/messages',
  '/reads',
  '/stats',
  '/leaderboard',
  '/rank',
  '/admin',
  '/account',
  '/pixel',
  '/count',
]

export default defineConfig({
  plugins: [react(), tailwindcss(), forbidStubbedDeps()],
  resolve: {
    alias: [
      ...STUBBED_DEPS.map((pkg) => ({ find: new RegExp(`^${pkg}$`), replacement: noRenderStub })),
      { find: '@', replacement: path.resolve(rootDir, './src') },
    ],
  },
  server: {
    port: 5173,
    open: true,
    proxy: Object.fromEntries(
      DEV_API_PATHS.map((p) => [
        p,
        {
          target: process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8787',
          // 保留 Host：服务器据此判断是否 https，进而决定 __Host-session 还是 session
          changeOrigin: false,
        },
      ]),
    ),
  },
})
