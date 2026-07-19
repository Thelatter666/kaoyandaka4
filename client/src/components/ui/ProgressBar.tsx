import React from 'react';

interface ProgressBarProps {
  value: number; // 0 to 1 (or custom)
  max?: number;
  color?: string;
  label?: string;
  icon?: string;
  animated?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max = 1,
  color = 'var(--color-accent-success)',
  label,
  icon,
  animated = true,
  size = 'md',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const height = size === 'sm' ? 6 : 10;

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
          {icon && <span aria-hidden="true">{icon}</span>}
          {label && <span>{label}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: '100%',
          height,
          backgroundColor: 'var(--color-border-light)',
          borderRadius: height / 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: height / 2,
            transition: animated ? 'width 300ms ease-out' : 'none',
          }}
        />
      </div>
    </div>
  );
}
