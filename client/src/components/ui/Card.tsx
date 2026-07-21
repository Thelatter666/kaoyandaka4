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
  /** v2 主角卡变体（设计文档 12.2）：glass-2 材质 + 28px 圆角 + 32px 内边距 + 内嵌极光光斑 */
  hero?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({
  children,
  padding,
  paddingSize = 'md',
  onClick,
  hoverable = false,
  hero = false,
  className,
  style,
}: CardProps) {
  const classNames = [
    'card',
    hero ? 'glass-2' : 'glass-1',
    `card--pad-${paddingSize}`,
    hero ? 'card--hero' : '',
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
