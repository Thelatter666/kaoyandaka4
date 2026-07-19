import React from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = '加载失败，请稍后重试', onRetry }: ErrorStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-2xl) var(--space-lg)',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }} aria-hidden="true">⚠️</span>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: onRetry ? 'var(--space-lg)' : 0, fontSize: 'var(--text-base)' }}>
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>重试</Button>
      )}
    </div>
  );
}
