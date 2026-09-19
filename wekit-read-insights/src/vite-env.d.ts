/// <reference types="vite/client" />

// `sparkdesign/style` 解析到 dist/sparkdesign.css，包内未提供类型声明
declare module 'sparkdesign/style'

/** 显式声明用到的两个构建期变量，免得 import.meta.env 退化成 any */
interface ImportMetaEnv {
  /** API 基址。默认空串 = 与页面同源（本地开发靠 vite 代理，线上同一个 Worker 同时发静态页和接口） */
  readonly VITE_API_BASE?: string
  /** 本地 dev 代理的目标；只在 vite.config.ts 里用 */
  readonly VITE_DEV_API_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
