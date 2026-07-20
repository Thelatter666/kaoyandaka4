import React from 'react';

interface LoadingStateProps {
  message?: string;
  /** 骨架条数量，默认 3 */
  rows?: number;
}

export function LoadingState({ message = '加载中...', rows = 3 }: LoadingStateProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-xl) var(--space-lg)',
        gap: 'var(--space-md)',
      }}
    >
      <span className="sr-only">{message}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          aria-hidden="true"
          style={{
            height: 20,
            width: `${100 - i * 18}%`,
            borderRadius: 'var(--radius-sm)',
          }}
        />
      ))}
    </div>
  );
}
