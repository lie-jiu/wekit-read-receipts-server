import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * 本地开发把数据路径直接代理给 Bun 服务，前端请求仍是同源：
 * 会话 cookie 是 HttpOnly + SameSite=Lax，只有同源才不用动 CORS，
 * 也和将来「同一个 Worker 同时发静态页 + API」的形态一致。
 * 列表 = 服务器现有全部 JSON 端点前缀（含尚未接管的 SSR 页面路径，
 * 那批在旧页面退役前也一并转给 8787，方便两版并行对照）。
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
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
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
