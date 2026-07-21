import { useState, useCallback, useEffect, useRef } from 'react';
import type { SessionSubject, SubSubject } from '@shared/types';

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
  roundCount: number;
  startFocus: (presetId: string | null, minutes: number, source: string) => Promise<void>;
  completeFocus: () => Promise<void>;
  cancelFocus: () => Promise<void>;
  startBreak: (mode: 'short' | 'long') => void;
  completeBreak: () => void;
  checkActive: () => Promise<void>;
}

const API_BASE = '/api/v1';

export function useFocusSession(): UseFocusSessionReturn {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakMode, setBreakMode] = useState<FocusMode | null>(null);
  const [breakRemainingSeconds, setBreakRemainingSeconds] = useState(0);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
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
      const res = await fetch(`${API_BASE}/focus/active`);
      if (!res.ok) throw new Error('获取会话状态失败');
      const data = await res.json();
      setActiveSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkActive();
    // Poll every 10 seconds for session recovery
    pollRef.current = setInterval(checkActive, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkActive]);

  const startFocus = useCallback(async (presetId: string | null, minutes: number, source: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/focus/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // presetId 为 null 即漫游专注：body 中不携带该字段
          ...(presetId ? { presetId } : {}),
          plannedDurationMinutes: minutes,
          source,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || '启动专注失败');
      }
      const session = await res.json();
      setActiveSession(session);
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
      const res = await fetch(`${API_BASE}/focus/${activeSession.id}/complete`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          // Already completed, just clear
          setActiveSession(null);
          return;
        }
        throw new Error(err.error?.message || '完成专注失败');
      }
      setActiveSession(null);
      // Record round
      setRoundCount((prev) => prev + 1);
    } catch (err) {
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
      const res = await fetch(`${API_BASE}/focus/${activeSession.id}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || '取消专注失败');
      }
      setActiveSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消专注失败');
    } finally {
      setLoading(false);
    }
  }, [activeSession]);

  const startBreak = useCallback((mode: 'short' | 'long') => {
    const seconds = mode === 'short' ? 300 : 900; // 5 or 15 minutes
    setBreakMode(mode === 'short' ? 'short_break' : 'long_break');
    setBreakRemainingSeconds(seconds);
    setBreakEndsAt(Date.now() + seconds * 1000);
    clearBreakTimer();
    breakTimerRef.current = setInterval(() => {
      setBreakRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearBreakTimer();
          setBreakMode(null);
          setBreakEndsAt(null);
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
    roundCount,
    startFocus,
    completeFocus,
    cancelFocus,
    startBreak,
    completeBreak,
    checkActive,
  };
}
