import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = '加载中...' }: LoadingStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-2xl) var(--space-lg)',
      gap: 'var(--space-md)',
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: '3px solid var(--color-border)',
        borderTopColor: 'var(--color-accent-primary)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
