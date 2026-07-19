import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = '📭', title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-2xl) var(--space-lg)',
        textAlign: 'center',
        border: '2px dashed var(--color-border)',
        borderRadius: 'var(--radius-card)',
        backgroundColor: 'var(--color-bg-card)',
      }}
    >
      <span style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }} aria-hidden="true">{icon}</span>
      <h3 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-lg)',
        color: 'var(--color-text-primary)',
        marginBottom: 'var(--space-sm)',
        fontWeight: 500,
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-sm)',
          marginBottom: actionLabel ? 'var(--space-lg)' : 0,
          maxWidth: 360,
        }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
