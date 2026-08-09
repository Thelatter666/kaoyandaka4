import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  /** 退出状态：true 时播放退出动画 */
  exiting?: boolean;
}

let toastId = 0;
let addToastFn: ((type: ToastType, message: string) => void) | null = null;

export function showToast(type: ToastType, message: string) {
  addToastFn?.(type, message);
}

const TOAST_CONFIG: Record<ToastType, { Icon: typeof CheckCircle2; color: string }> = {
  success: { Icon: CheckCircle2, color: 'var(--color-accent-success-ondark)' },
  error: { Icon: AlertCircle, color: 'var(--color-accent-danger-ondark)' },
  info: { Icon: Info, color: 'var(--color-glass-3-text)' },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, exiting: false }]);

    // 3.5s 后标记为退出状态，播放退出动画
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    }, 3500);

    // 退出动画结束后（300ms）真正移除
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1000, // 修复：数值而非字符串
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
      }}
    >
      {toasts.map((toast) => {
        const { Icon, color } = TOAST_CONFIG[toast.type];

        return (
          <div
            key={toast.id}
            role="status"
            className="glass-3 toast-item"
            data-exiting={toast.exiting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              /* 375px 窄屏不横向溢出：宽度上限随视口收敛 */
              maxWidth: 'min(360px, calc(100vw - 48px))',
            }}
          >
            <Icon size={18} strokeWidth={1.75} color={color} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{toast.message}</span>
          </div>
        );
      })}
      <style>{`
        /* Toast 入场/退出：transition 实现（可中断），不使用 keyframes */
        .toast-item {
          opacity: 0;
          transform: scale(0.95) translateY(8px);
          transition:
            opacity var(--dur-med) var(--ease-out),
            transform var(--dur-med) var(--ease-out);
        }

        .toast-item:not([data-exiting="true"]) {
          opacity: 1;
          transform: scale(1) translateY(0);
        }

        .toast-item[data-exiting="true"] {
          opacity: 0;
          transform: scale(0.95) translateY(4px);
        }

        /* Reduced motion: 仅保留透明度变化 */
        @media (prefers-reduced-motion: reduce) {
          .toast-item {
            transition: opacity var(--dur-fast) ease;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
