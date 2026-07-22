import { useState, useEffect, useCallback } from 'react';

/**
 * 登录态判断（设计文档《滚动式介绍页设计》§3）
 *
 * 当前为 mock 实现：localStorage('yantai_mock_auth') = '1' 视为已登录，
 * 其余（含缺省）视为未登录。用于在账号系统上线前验证介绍页/应用两条路由分支。
 *
 * 账号系统接入方式：将 readMockAuth 替换为 GET /api/v1/auth/me 请求，
 * 保持返回形状 { isLoggedIn, isLoading, setMockLoggedIn } 不变即可无缝切换；
 * 届时 isLoading 在请求进行中为 true，调用方可渲染骨架。
 */

const MOCK_KEY = 'yantai_mock_auth';

function readMockAuth(): boolean {
  try {
    return window.localStorage.getItem(MOCK_KEY) === '1';
  } catch {
    return false;
  }
}

interface AuthState {
  isLoggedIn: boolean;
  /** mock 实现下恒为 false；接通真实接口后表示会话查询进行中 */
  isLoading: boolean;
  /** 仅 mock 阶段可用的调试开关：写入 localStorage 并同步状态 */
  setMockLoggedIn: (value: boolean) => void;
}

export function useAuth(): AuthState {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(readMockAuth);

  /* 跨标签页同步 mock 状态（storage 事件仅在其他标签页触发） */
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === MOCK_KEY) {
        setIsLoggedIn(readMockAuth());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setMockLoggedIn = useCallback((value: boolean) => {
    try {
      if (value) {
        window.localStorage.setItem(MOCK_KEY, '1');
      } else {
        window.localStorage.removeItem(MOCK_KEY);
      }
    } catch {
      /* localStorage 不可用（隐私模式等）：仅更新内存态 */
    }
    setIsLoggedIn(value);
  }, []);

  return { isLoggedIn, isLoading: false, setMockLoggedIn };
}
