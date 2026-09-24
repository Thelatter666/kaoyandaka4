import { useState, useCallback, useEffect, useRef } from 'react';
import type { SessionSubject, SubSubject, FocusSource } from '@shared/types';
import { SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES } from '@shared/constants';
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

/** 到点校准：首次拉取的延迟（ms）。给服务端 NOW() 留余量，避开「刚过点但服务端还没到点」 */
const END_SYNC_DELAY_MS = 250;
/** 到点校准：仍返回同一会话时的重试间隔（ms），覆盖客户端与服务端的时钟偏差 */
const END_SYNC_RETRY_MS = 500;
/** 到点校准：最大重试次数（12 × 500ms ≈ 6s），超出后交回 10 秒轮询兜底 */
const END_SYNC_MAX_RETRIES = 12;

/**
 * 会话是否与上次解析结果等价（决定要不要换 state 引用）。
 * 只比对服务端会改动的字段：会话对象每次都是新解析的，无脑 setState 会让
 * 页面里所有 [activeSession] 的 effect 跟着重跑——其中响铃 worker 会重新武装，
 * 在客户端时钟快于服务端时重复响铃。
 */
function sameSession(a: ActiveSession | null, b: ActiveSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.plannedEndAt === b.plannedEndAt &&
    a.pausedAt === b.pausedAt &&
    a.pausedTotalSeconds === b.pausedTotalSeconds &&
    a.status === b.status
  );
}

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
  /** 到点校准定时器（见下方 endSync effect） */
  const endSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBreakTimer = useCallback(() => {
    if (breakTimerRef.current) {
      clearInterval(breakTimerRef.current);
      breakTimerRef.current = null;
    }
  }, []);

  /**
   * 拉取 /focus/active 并写入状态，回传结果供「到点校准」判定。
   * 返回 null = 已无进行中会话；'error' = 请求失败（保留上次状态）——
   * 不区分会让到点校准把网络抖动误判为「会话已结束」而停止重试。
   */
  const probeActive = useCallback(async (): Promise<ActiveSession | null | 'error'> => {
    try {
      // 统一 api client：自动携带会话 cookie，401 触发全局登出
      const data = (await focusApi.getActive()) as ActiveSession | null;
      // 内容未变就不换引用（见 sameSession 注释）
      setActiveSession((prev) => (sameSession(prev, data) ? prev : data));
      return data;
    } catch {
      // 轮询失败静默保留上次状态：不再每 10 秒 setError 触发整页重渲染
      return 'error';
    } finally {
      setLoading(false);
    }
  }, []);

  const checkActive = useCallback(async () => {
    await probeActive();
  }, [probeActive]);

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

  /* 到点校准：会话到点后立刻拉状态，不再等下一个 10 秒轮询。
     服务端（与本地模式同构）的「过期自动完成」是惰性的——只有 GET /focus/active
     被调用时才落库，因此前端感知「会话已结束」的时刻完全取决于轮询到点，完成
     动画会随机晚 0~10 秒。这里按 plannedEndAt 排定时器，到点即拉；客户端与服务端
     时钟有偏差时（首次仍返回进行中）按固定间隔重试，超限后交回轮询兜底。

     依赖只取会话的标量字段：轮询会把同一会话反复写回，若依赖整个对象，
     每次写回都会清掉重试链并把重试计数重置回 0（恒早于服务端到点时永不收敛）。 */
  const sessionId = activeSession?.id ?? null;
  const plannedEndAtIso = activeSession?.plannedEndAt ?? null;
  const pausedAtIso = activeSession?.pausedAt ?? null;

  useEffect(() => {
    const clear = () => {
      if (endSyncTimerRef.current) clearTimeout(endSyncTimerRef.current);
      endSyncTimerRef.current = null;
    };
    clear();
    // 暂停中 planned_end_at 未顺延（恢复时才顺延），此时按它排程没有意义
    if (!sessionId || !plannedEndAtIso || pausedAtIso) return;

    const endMs = new Date(plannedEndAtIso).getTime();
    if (Number.isNaN(endMs)) return;

    let attempt = 0;
    const sync = async () => {
      endSyncTimerRef.current = null;
      const probe = await probeActive();
      // 请求失败留待重试；换成了别的会话（用户又开始了新的一轮）则本链自然作废
      const stillRunning =
        probe === 'error' || (probe !== null && probe.id === sessionId);
      if (!stillRunning || attempt >= END_SYNC_MAX_RETRIES) return;
      attempt += 1;
      endSyncTimerRef.current = setTimeout(() => void sync(), END_SYNC_RETRY_MS);
    };
    endSyncTimerRef.current = setTimeout(
      () => void sync(),
      Math.max(0, endMs - Date.now()) + END_SYNC_DELAY_MS
    );
    return clear;
  }, [sessionId, plannedEndAtIso, pausedAtIso, probeActive]);

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
    // 时长取自共享常量：页面的砚池用同一常量算总时长，硬编码会使钟面总量与倒数脱节
    const seconds = (mode === 'short' ? SHORT_BREAK_MINUTES : LONG_BREAK_MINUTES) * 60;
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
