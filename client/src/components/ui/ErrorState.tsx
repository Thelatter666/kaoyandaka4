import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
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
      {/* 96px 玻璃圆 + AlertCircle danger 色 */}
      <span
        className="glass-1"
        aria-hidden="true"
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent-danger)',
          marginBottom: 'var(--space-md)',
        }}
      >
        <AlertCircle size={40} strokeWidth={1.75} />
      </span>
      <p style={{
        color: 'var(--color-text-secondary)',
        marginBottom: onRetry ? 'var(--space-lg)' : 0,
        fontSize: 'var(--text-base)',
        maxWidth: 360,
      }}>
        {message}
      </p>
      {onRetry && (
        <Button variant="glass" onClick={onRetry}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          重试
        </Button>
      )}
    </div>
  );
}
