import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCountdownOptions {
  totalSeconds: number;
  onComplete?: () => void;
  autoStart?: boolean;
}

interface UseCountdownReturn {
  remainingSeconds: number;
  totalSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  progress: number; // 0 to 1
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (newTotal?: number) => void;
}

export function useCountdown({
  totalSeconds: initialTotal,
  onComplete,
  autoStart = true,
}: UseCountdownOptions): UseCountdownReturn {
  const [remainingSeconds, setRemainingSeconds] = useState(initialTotal);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const totalRef = useRef(initialTotal);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    setRemainingSeconds((prev) => {
      if (prev <= 1) {
        clearTimer();
        setIsRunning(false);
        onCompleteRef.current?.();
        return 0;
      }
      return prev - 1;
    });
  }, [clearTimer]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isRunning, isPaused, tick, clearTimer]);

  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const reset = useCallback((newTotal?: number) => {
    clearTimer();
    const total = newTotal ?? totalRef.current;
    totalRef.current = total;
    setRemainingSeconds(total);
    setIsRunning(false);
    setIsPaused(false);
  }, [clearTimer]);

  const isComplete = remainingSeconds <= 0;
  const progress = totalRef.current > 0 ? remainingSeconds / totalRef.current : 0;

  return {
    remainingSeconds,
    totalSeconds: totalRef.current,
    isRunning,
    isPaused,
    isComplete,
    progress,
    start,
    pause,
    resume,
    reset,
  };
}
