import React from 'react';

interface CardProps {
  children: React.ReactNode;
  padding?: string | number;
  onClick?: () => void;
  hoverable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({
  children,
  padding = 'var(--space-card-padding)',
  onClick,
  hoverable = false,
  style,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        backgroundColor: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-card)',
        padding,
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border-light)',
        transition: 'all var(--transition-fast)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
