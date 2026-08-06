/**
 * useScreenWakeLock — 番茄钟期间保持屏幕点亮（Screen Wake Lock API）
 *
 * active 为 true 时请求 screen wake lock（浏览器阻止屏幕熄灭/系统睡眠），
 * 为 false 时释放。浏览器在页面隐藏（切标签/最小化）时自动释放 wake lock，
 * 故监听 visibilitychange：回到可见且仍 active 时重建。
 * 不支持 wakeLock 的浏览器静默降级（屏幕可能熄灭，无报错）。
 */
import { useEffect, useRef } from 'react';

export function useScreenWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (sentinelRef.current && sentinelRef.current !== s) {
          sentinelRef.current.release().catch(() => {});
        }
        sentinelRef.current = s;
        // 浏览器（如页面隐藏）释放时置空引用，待可见后重建
        s.addEventListener('release', () => {
          if (sentinelRef.current === s) sentinelRef.current = null;
        });
      } catch {
        /* 降级：保持屏幕熄灭行为，不抛错 */
      }
    };

    const release = () => {
      const s = sentinelRef.current;
      sentinelRef.current = null;
      if (s) s.release().catch(() => {});
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeRef.current) acquire();
    };

    if (active) {
      acquire();
      document.addEventListener('visibilitychange', onVisibilityChange);
    } else {
      release();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [active]);
}
