import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
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
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
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
        zIndex: 'var(--z-toast)',
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
            className="glass-3"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              animation: 'toast-slide-in 200ms var(--ease-out)',
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
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
