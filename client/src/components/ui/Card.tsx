import React from 'react';
import './Card.css';

interface CardProps {
  children: React.ReactNode;
  /** 自定义 padding（优先级高于 paddingSize），保留向后兼容 */
  padding?: string | number;
  /** padding 档位：sm 16 / md 24 / lg 32 */
  paddingSize?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  hoverable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({
  children,
  padding,
  paddingSize = 'md',
  onClick,
  hoverable = false,
  className,
  style,
}: CardProps) {
  const classNames = [
    'card',
    'glass-1',
    `card--pad-${paddingSize}`,
    hoverable || onClick ? 'card--hoverable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        ...(padding !== undefined ? { padding } : {}),
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
