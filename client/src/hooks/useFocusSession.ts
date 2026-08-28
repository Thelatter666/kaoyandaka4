import { useState, useCallback, useEffect, useRef } from 'react';
import type { SessionSubject, SubSubject, FocusSource } from '@shared/types';
import { focusApi } from '../api/focus';
import { ApiError } from '../api/client';

export interface ActiveSession {
  id: string;
  presetNameSnapshot: string;
  subjectSnapshot: SessionSubject;
  subSubjectSnapshot: SubSubject | null;
  plannedDurationSeconds: number;
  startedAt: string;
  plannedEndAt: string;
  status: 'in_progress';
  source: 'pomodoro' | 'plan' | 'course';
  /** 非空 = 暂停中（ISO 时间戳）；判断暂停一律看本字段，勿发明 status 判断（ADR-0006） */
  pausedAt: string | null;
  pausedTotalSeconds: number;
}

export type FocusMode = 'focus' | 'short_break' | 'long_break';

interface UseFocusSessionReturn {
  activeSession: ActiveSession | null;
  loading: boolean;
  error: string | null;
  breakMode: FocusMode | null;
  breakRemainingSeconds: number;
  /** 休息结束时间戳（ms）：供页面用 rAF 计算毫秒级剩余，驱动平滑圆环 */
  breakEndsAt: number | null;
  /** 休息是否自然结束（timer 归零）；null 表示未结束或手动结束 */
  breakEndMode: 'natural' | null;
  roundCount: number;
  startFocus: (presetId: string | null, minutes: number, source: string) => Promise<void>;
  completeFocus: () => Promise<void>;
  cancelFocus: () => Promise<void>;
  pauseFocus: () => Promise<void>;
  resumeFocus: () => Promise<void>;
  startBreak: (mode: 'short' | 'long') => void;
  completeBreak: () => void;
  checkActive: () => Promise<void>;
}

export function useFocusSession(): UseFocusSessionReturn {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakMode, setBreakMode] = useState<FocusMode | null>(null);
  const [breakRemainingSeconds, setBreakRemainingSeconds] = useState(0);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  /** 休息是否自然结束（timer 归零）；手动开始/跳过时清空，供页面兜底响铃判定 */
  const [breakEndMode, setBreakEndMode] = useState<'natural' | null>(null);
  const [roundCount, setRoundCount] = useState(1);
  const breakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearBreakTimer = useCallback(() => {
    if (breakTimerRef.current) {
      clearInterval(breakTimerRef.current);
      breakTimerRef.current = null;
    }
  }, []);

  const checkActive = useCallback(async () => {
    try {
      // 统一 api client：自动携带会话 cookie，401 触发全局登出
      const data = await focusApi.getActive();
      setActiveSession(data as ActiveSession | null);
    } catch {
      // 轮询失败静默保留上次状态：不再每 10 秒 setError 触发整页重渲染
    } finally {
      setLoading(false);
    }
  }, []);

  // 每 10 秒轮询会话恢复 + 可见性暂停
  // 与极光背景 page-hidden 机制同构：后台标签页零请求零写库
  useEffect(() => {
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const startPolling = () => {
      stopPolling();
      pollRef.current = setInterval(checkActive, 10000);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏：停止轮询，零请求
        stopPolling();
      } else {
        // 恢复可见：立即校准一次并重启轮询
        checkActive();
        startPolling();
      }
    };

    checkActive();
    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkActive]);

const startFocus = useCallback(async (presetId: string | null, minutes: number, source: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await focusApi.start({
        // presetId 为 null 即漫游专注：body 中不携带该字段
        ...(presetId ? { presetId } : {}),
        plannedDurationMinutes: minutes,
        source: source as FocusSource,
      });
      setActiveSession(session as ActiveSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动专注失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const completeFocus = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await focusApi.complete(activeSession.id);
      setActiveSession(null);
      // Record round
      setRoundCount((prev) => prev + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already completed, just clear
        setActiveSession(null);
        return;
      }
      setError(err instanceof Error ? err.message : '完成专注失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeSession]);

  const cancelFocus = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await focusApi.cancel(activeSession.id);
      setActiveSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消专注失败');
    } finally {
      setLoading(false);
    }
  }, [activeSession]);

  const pauseFocus = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await focusApi.pause(activeSession.id);
      await checkActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂停失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeSession, checkActive]);

  const resumeFocus = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await focusApi.resume(activeSession.id);
      await checkActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeSession, checkActive]);

  const startBreak = useCallback((mode: 'short' | 'long') => {
    const seconds = mode === 'short' ? 300 : 900; // 5 or 15 minutes
    setBreakMode(mode === 'short' ? 'short_break' : 'long_break');
    setBreakRemainingSeconds(seconds);
    setBreakEndsAt(Date.now() + seconds * 1000);
    setBreakEndMode(null);
    clearBreakTimer();
    breakTimerRef.current = setInterval(() => {
      setBreakRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearBreakTimer();
          setBreakMode(null);
          setBreakEndsAt(null);
          setBreakEndMode('natural');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearBreakTimer]);

  const completeBreak = useCallback(() => {
    clearBreakTimer();
    setBreakMode(null);
    setBreakRemainingSeconds(0);
    setBreakEndsAt(null);
    setBreakEndMode(null);
  }, [clearBreakTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearBreakTimer();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [clearBreakTimer]);

  return {
    activeSession,
    loading,
    error,
    breakMode,
    breakRemainingSeconds,
    breakEndsAt,
    breakEndMode,
    roundCount,
    startFocus,
    completeFocus,
    cancelFocus,
    pauseFocus,
    resumeFocus,
    startBreak,
    completeBreak,
    checkActive,
  };
}
