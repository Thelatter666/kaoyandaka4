import React from 'react';

interface ProgressBarProps {
  value: number; // 0 to 1 (or custom)
  max?: number;
  /** 填充渐变起始色（令牌引用） */
  color?: string;
  /** 填充渐变结束色，缺省与 color 相同（可配双色） */
  colorEnd?: string;
  label?: string;
  /** 标签图标：推荐传入 lucide 图标节点 */
  icon?: React.ReactNode;
  animated?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max = 1,
  color = 'var(--color-accent-success)',
  colorEnd,
  label,
  icon,
  animated = true,
  size = 'md',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const height = size === 'sm' ? 6 : 8;

  return (
    <div style={{ width: '100%' }}>
      {(label || icon) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xs)',
          marginBottom: 6,
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
        }}>
          {icon && <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
          {label && <span>{label}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        style={{
          width: '100%',
          height,
          backgroundColor: 'var(--color-border)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${colorEnd ?? color})`,
            borderRadius: 'var(--radius-full)',
            transition: animated ? 'width 300ms ease-out' : 'none',
          }}
        />
      </div>
    </div>
  );
}
