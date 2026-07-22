import { api } from './client';

/**
 * 认证接口（账号系统 T2.4）
 * 会话通过 httpOnly cookie 维护，client.ts 已统一 credentials: 'include'。
 */

export interface AuthUser {
  id: string;
  email: string;
}

export const authApi = {
  /** 当前登录用户；未登录抛 401 ApiError（UNAUTHORIZED） */
  me: () => api.get<AuthUser>('/auth/me'),

  /** 登录成功返回用户并建立会话；失败 401 INVALID_CREDENTIALS / 429 RATE_LIMITED */
  login: (email: string, password: string) =>
    api.post<AuthUser>('/auth/login', { email, password }),

  /** 注册成功自动建立会话并返回用户；409 EMAIL_TAKEN / 400 VALIDATION_ERROR / 429 RATE_LIMITED */
  register: (email: string, password: string, confirmPassword: string) =>
    api.post<AuthUser>('/auth/register', { email, password, confirmPassword }),

  /** 退出登录：销毁服务端会话并清除 cookie（204 无响应体） */
  logout: () => api.post<void>('/auth/logout'),
};
