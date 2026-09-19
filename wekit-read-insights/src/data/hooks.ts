// ============================================================
// 数据层 · 取数 hook
// ------------------------------------------------------------
// 只有「按 URL 取一次、可重取」这一种形态，所以不存在缓存层：
// URL 就是键，换 URL 就是换口径，旧数据必须先丢掉再显示新的。
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

export type Resource<T> = {
  data: T | null;
  error: ApiError | null;
  /** 首次加载（无数据可显示）。重取时为 true 但 data 仍在，页面可以只让刷新图标转 */
  loading: boolean;
  reload: () => void;
};

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new ApiError(0, "unknown", message);
}

/**
 * 取一个 GET 资源。path 传 null 表示「现在不该请求」（例如还没拿到会话）。
 *
 * 两条容易写错的规则都在这里：
 *   · URL 变了 → data 归 null。日期区间从 7 天切到 30 天时，若留着旧 data，
 *     页面会在请求往返之间显示上一个窗口的数字，而且看不出区别。
 *   · 同一 URL 重取失败 → 保留 data 并带上 error。"刷新失败"该提示，
 *     但不该把用户正在看的东西清空。
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: ApiError | null;
    loading: boolean;
  }>({ key: path, data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) {
      setState({ key: null, data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState((s) => ({
      key: path,
      data: s.key === path ? s.data : null,
      error: null,
      loading: true,
    }));
    api.get<T>(path, controller.signal).then(
      (data) => {
        if (!active) return;
        setState({ key: path, data, error: null, loading: false });
      },
      (e: unknown) => {
        // 组件卸载 / URL 变更导致的中断不是错误，不该渲染成红条
        if (!active || (e as Error)?.name === "AbortError") return;
        const error = toApiError(e);
        setState((s) => ({ key: path, data: s.key === path ? s.data : null, error, loading: false }));
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export type ListResource<T> = Resource<T[]> & { total: number | null };

/**
 * 同上，但用于 GET /messages 这种「body 是裸数组、总数在 X-Total-Count 头」的接口。
 * 单独一个 hook 而不是给 useResource 加开关：两条路径的差异只在最后一步解包，
 * 混在一起会让读的人分不清 data 到底是数组还是响应体。
 */
export function useList<T>(path: string | null): ListResource<T> {
  const [state, setState] = useState<{
    key: string | null;
    items: T[] | null;
    total: number | null;
    error: ApiError | null;
    loading: boolean;
  }>({ key: path, items: null, total: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) {
      setState({ key: null, items: null, total: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState((s) => ({
      key: path,
      items: s.key === path ? s.items : null,
      total: s.key === path ? s.total : null,
      error: null,
      loading: true,
    }));
    api.getList<T[]>(path, controller.signal).then(
      ({ items, total }) => {
        if (!active) return;
        setState({ key: path, items, total, error: null, loading: false });
      },
      (e: unknown) => {
        if (!active || (e as Error)?.name === "AbortError") return;
        const error = toApiError(e);
        setState((s) => ({
          key: path,
          items: s.key === path ? s.items : null,
          total: s.key === path ? s.total : null,
          error,
          loading: false,
        }));
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: state.items,
    total: state.total,
    error: state.error,
    loading: state.loading,
    reload,
  };
}
