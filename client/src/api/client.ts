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

/** 非 2xx 统一处理：解析错误形状、401 触发全局登出（/auth/* 除外）、抛 ApiError */
async function throwIfNotOk(res: Response, path: string): Promise<void> {
  if (res.ok) return;
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

  await throwIfNotOk(res, path);

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

/** 下载文件：fetch → blob → 临时 <a download> 触发保存；文件名由调用方给定 */
async function download(path: string, filename: string): Promise<void> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { credentials: 'include' });
  await throwIfNotOk(res, path);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  download: (path: string, filename: string) => download(path, filename),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
