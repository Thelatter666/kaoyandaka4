import { useEffect, useSyncExternalStore } from 'react';
import { setUnauthorizedHandler } from '../api/client';
import { authApi, type AuthUser } from '../api/auth';
import { getActiveLocalAccount, setActiveLocalAccount } from '../local/accounts';
import { isLocalMode } from '../local/mode';

/**
 * 登录态管理（账号系统 T2.4，真实 API 版 + P3 本地模式双源）
 *
 * 机制：模块级 store + useSyncExternalStore 订阅。
 * - 首次挂载时以 GET /api/v1/auth/me 探测会话（httpOnly cookie），
 *   进行中 isLoading=true（App 渲染加载壳，避免未登录闪现 landing）；
 * - P3 本地模式：存在激活的本地账户（localStorage）时跳过 /me 探测，
 *   直接以本地账户身份进入应用（本地账户 email 即登录邮箱）；
 * - 登录/注册成功后由页面调 applyAuthUser 直接写入全局态，立即生效；
 * - 业务请求 401（UNAUTHORIZED）由 api/client 回调本模块，全局回到未登录分支；
 * - 登出走 logoutAuth：本地模式仅清除激活账户；服务器模式先销毁服务端会话，
 *   再清空本地态。
 */

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthStoreState {
  status: AuthStatus;
  user: AuthUser | null;
}

let storeState: AuthStoreState = { status: 'loading', user: null };
const listeners = new Set<() => void>();

function emit(next: AuthStoreState): void {
  storeState = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthStoreState {
  return storeState;
}

/* /auth/me 探测去重：并发调用方共享同一请求 */
let meInflight: Promise<void> | null = null;

/** 重新查询会话（本地模式走本地账户；服务器模式 GET /api/v1/auth/me），刷新全局登录态 */
export function refreshAuth(): Promise<void> {
  // 本地模式：无需网络探测，直接以激活的本地账户登录
  const localAccount = getActiveLocalAccount();
  if (localAccount) {
    emit({ status: 'authenticated', user: { id: localAccount.accountId, email: localAccount.email } });
    return Promise.resolve();
  }
  if (!meInflight) {
    meInflight = authApi
      .me()
      .then((user) => emit({ status: 'authenticated', user }))
      .catch(() => emit({ status: 'guest', user: null }))
      .finally(() => {
        meInflight = null;
      });
  }
  return meInflight;
}

/** 登录/注册成功后写入全局登录态（响应已含用户信息，无需再查 /me） */
export function applyAuthUser(user: AuthUser): void {
  emit({ status: 'authenticated', user });
}

/** 退出登录：本地模式仅清除激活账户；服务器模式先销毁服务端会话再清空本地态 */
export async function logoutAuth(): Promise<void> {
  if (isLocalMode()) {
    setActiveLocalAccount(null);
    emit({ status: 'guest', user: null });
    return;
  }
  try {
    await authApi.logout();
  } catch {
    /* 服务端不可达时也强制本地登出，避免 UI 卡在已登录分支 */
  }
  emit({ status: 'guest', user: null });
}

/* 业务请求 401 全局处理：会话失效 → 回到未登录分支（/auth/* 的 401 不触发，见 api/client.ts） */
setUnauthorizedHandler(() => {
  if (storeState.status === 'authenticated') {
    emit({ status: 'guest', user: null });
  }
});

interface AuthState {
  isLoggedIn: boolean;
  /** 首次会话探测进行中为 true，调用方应渲染加载壳而非 landing/应用 */
  isLoading: boolean;
  user: AuthUser | null;
  /** 主动重新查询会话（如怀疑会话状态变化后） */
  refresh: () => Promise<void>;
  /** 退出登录（调 POST /auth/logout 后清空本地态） */
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  /* 首次挂载探测会话；多组件并发调用由 meInflight 去重 */
  useEffect(() => {
    if (storeState.status === 'loading') {
      void refreshAuth();
    }
  }, []);

  return {
    isLoggedIn: state.status === 'authenticated',
    isLoading: state.status === 'loading',
    user: state.user,
    refresh: refreshAuth,
    logout: logoutAuth,
  };
}
