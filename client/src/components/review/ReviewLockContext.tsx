import { createContext, useContext } from 'react';

/**
 * 复盘锁的「上锁」入口：ReviewGate 在已解锁态提供，ReviewPage 消费后渲染页头按钮。
 *
 * 单独成模块而不是从 ReviewGate 导出——两者各自 lazy 成 chunk，从 ReviewGate
 * 引 context 会让复盘页的 chunk 拖带门禁模块的依赖（Card/Button/ErrorState 等）。
 */
const ReviewLockContext = createContext<(() => void) | null>(null);

export const ReviewLockProvider = ReviewLockContext.Provider;

/** 取上锁回调；不在门禁内（或未解锁）时为 null，调用方据此不渲染按钮 */
export function useReviewLock(): (() => void) | null {
  return useContext(ReviewLockContext);
}
