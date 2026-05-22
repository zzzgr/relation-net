// 通用 fetch 封装：自动带 cookie，统一错误处理

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (res.status === 401) {
    let msg = '密码错误';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }

    const isAuthEndpoint = path.startsWith('/api/auth/');
    if (!isAuthEndpoint && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(401, msg);
  }

  if (!res.ok) {
    let msg = '';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* response 不是 JSON（比如平台层返回的 HTML 500 页面），fallthrough */
    }
    if (!msg) {
      if (res.status >= 500) msg = '服务器开小差了，请稍后再试';
      else if (res.status === 404) msg = '资源不存在';
      else if (res.status === 403) msg = '没有权限执行此操作';
      else if (res.status === 408 || res.status === 504) msg = '请求超时，请稍后再试';
      else if (res.status === 400) msg = '请求参数有误';
      else msg = `请求失败（${res.status}）`;
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
