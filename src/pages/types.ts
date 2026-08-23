/**
 * 页面函数的视图模型类型：路由层传入页面层的刻意收窄投影，
 * 与 auth.ts 的 SessionUser（数据库全量会话）刻意区分，避免耦合。
 */

/** account / rank 页：仅需身份标识 */
export type BasicSession = {
  wxId: string;
  level: number;
};

/** 仪表盘页：另含配额展示（geo 剩余次数、消息容量、保留月数） */
export type DashboardSession = BasicSession & {
  geo: boolean;
  geoQuota: number;
  geoRemaining: number;
  messageQuota: number;
  retentionMonths: number;
};

/** 已读详情页 session；匿名公开访问时 wxId 为空串且各配额为 0 */
export type ReadDetailsSession = {
  wxId: string;
  level: number;
  isAdmin: boolean;
  geo: boolean;
  geoQuota: number;
  geoRemaining: number;
};

/** 已读详情页的消息元信息 */
export type ReadDetailsMeta = {
  id: string;
  content: string;
  isOwner: boolean;
  isPublic: boolean;
};

/** 管理后台页：仅需管理员 wxId 用于展示 */
export type AdminSession = {
  wxId: string;
};
