import type { StylePreset, ThemePreset } from 'sparkdesign'

/**
 * 全站主题档位。
 *
 * parchment 而非默认 mint：mint 的品牌绿 #8EE5A1 与 `Tag color="success"` 同色相，
 * 在本产品「满屏已读/正常状态标签」的语境下会分不清哪个是状态、哪个是操作。
 * parchment 把主色压成近黑 #202116（暗色模式自动反为暖米色 #C4B8A8），
 * 让红绿橙专用于语义。
 */
export const APP_THEME: ThemePreset = 'parchment'

/** compact 是 token 文档对「工具类后台 / 运营系统」的推荐档位（soft 偏消费与 AI 产品） */
export const APP_STYLE: StylePreset = 'compact'
