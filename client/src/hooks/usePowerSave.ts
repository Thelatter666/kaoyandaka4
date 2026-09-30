import { useCallback, useEffect, useState } from 'react';
import {
  isPowerSave,
  setPowerSave,
  subscribePowerSave,
  resolveShouldReduceMotion,
  prefersReducedMotion,
} from '../utils/powerSave';

/**
 * 节能模式开关（设备级偏好，见 utils/powerSave.ts）。
 * 初始值直接读 DOM 属性 / localStorage——模式在 main.tsx 首帧前已确定，
 * 不存在"先渲染正常模式再切换"的空窗。
 */
export function usePowerSave() {
  const [powerSave, setState] = useState(isPowerSave);

  useEffect(() => subscribePowerSave(setState), []);

  const toggle = useCallback(() => {
    setPowerSave(!isPowerSave());
  }, []);

  const set = useCallback((on: boolean) => {
    setPowerSave(on);
  }, []);

  return { powerSave, toggle, setPowerSave: set };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 是否需要降级动效：系统「减少动效」偏好 OR 节能模式。
 *
 * 刻意不依赖 framer-motion 的 useReducedMotion —— 本 hook 会被 App.tsx
 * （入门图）使用，静态引入 framer 会把 motion-vendor 拖进首屏图，
 * 与 e2e/check-perf-budget.mjs 的断言 1 冲突。
 */
export function useShouldReduceMotion(): boolean {
  const { powerSave } = usePowerSave();
  const [systemReduced, setSystemReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return resolveShouldReduceMotion(systemReduced, powerSave);
}
