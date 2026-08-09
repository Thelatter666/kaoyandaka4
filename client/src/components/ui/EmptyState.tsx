import React from 'react';
import { Sprout } from 'lucide-react';
import { Button } from './Button';
import './EmptyState.css';

interface EmptyStateProps {
  /** 图标：推荐传入 lucide 图标节点；缺省为 Sprout 新芽 */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 紧凑档：padding 由 48px 减为 24px（用于卡片内嵌的小空间空态，如首页摘要卡） */
  compact?: boolean;
}

export function EmptyState({ icon, title, description, actionLabel, onAction, compact = false }: EmptyStateProps) {
  return (
    <div
      className="empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? 'var(--space-lg)' : 'var(--space-2xl) var(--space-lg)',
        textAlign: 'center',
      }}
    >
      {/* 96px 玻璃圆 + 内图标 40px secondary */}
      <span
        className="glass-1 empty-state__icon"
        aria-hidden="true"
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: '2.5rem',
          marginBottom: 'var(--space-md)',
        }}
      >
        {icon ?? <Sprout size={40} strokeWidth={1.75} />}
      </span>
      <h3 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-xl)',
        fontWeight: 'var(--font-semibold)',
        color: 'var(--color-text-primary)',
        marginBottom: 'var(--space-sm)',
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
