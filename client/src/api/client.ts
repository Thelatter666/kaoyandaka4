const API_BASE = '/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 业务请求 401（UNAUTHORIZED，会话失效/被踢）的全局回调，由 useAuth 注册。
 * 仅对非 /auth/* 路径触发：/auth/login 的 401 是凭证错误（表单内展示）、
 * /auth/me 的 401 是未登录探测（useAuth 自行处理），二者不触发全局登出。
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    // 统一携带会话 cookie（vite proxy 同源下等价 same-origin；跨域部署时亦可工作）
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorData: { error?: { code?: string; message?: string; details?: Array<{ field: string; message: string }> } } = {};
    try {
      errorData = await res.json();
    } catch {
      // ignore parse errors
    }
    if (res.status === 401 && !path.startsWith('/auth/')) {
      unauthorizedHandler?.();
    }
    throw new ApiError(
      res.status,
      errorData.error?.code || 'UNKNOWN_ERROR',
      errorData.error?.message || `请求失败 (${res.status})`,
      errorData.error?.details
    );
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
