import React, { useEffect, useState, useCallback } from 'react';

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

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 'var(--z-toast)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
    }}>
      {toasts.map((toast) => {
        const bgColor = toast.type === 'success' ? 'var(--color-accent-success)' :
          toast.type === 'error' ? 'var(--color-accent-primary)' :
          'var(--color-text-primary)';

        return (
          <div
            key={toast.id}
            role="alert"
            style={{
              backgroundColor: bgColor,
              color: 'var(--color-text-inverse)',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              boxShadow: 'var(--shadow-md)',
              animation: 'toast-slide-in 200ms ease-out',
              maxWidth: 360,
            }}
          >
            {toast.message}
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
