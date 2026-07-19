import React from 'react';
import { formatSeconds } from '../../utils/duration';

interface RingCountdownProps {
  totalSeconds: number;
  remainingSeconds: number;
  mode: 'focus' | 'short_break' | 'long_break';
  ariaLabel?: string;
}

const MODE_LABELS: Record<string, string> = {
  focus: '专注中',
  short_break: '短休息',
  long_break: '长休息',
};

const MODE_COLORS: Record<string, string> = {
  focus: 'var(--color-accent-primary)',
  short_break: 'var(--color-accent-success)',
  long_break: 'var(--color-accent-deep-green)',
};

export function RingCountdown({ totalSeconds, remainingSeconds, mode, ariaLabel }: RingCountdownProps) {
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const radius = 140;
  const strokeWidth = 10;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const strokeDashoffset = circumference * (1 - progress);
  const isLowTime = mode === 'focus' && remainingSeconds <= 300; // last 5 min

  const timeStr = formatSeconds(remainingSeconds);
  const label = ariaLabel || `${MODE_LABELS[mode]} 剩余 ${timeStr}`;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-lg)',
      }}
    >
      {/* SVG Ring */}
      <svg
        width={radius * 2}
        height={radius * 2}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Background ring */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="var(--color-border-light)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke={isLowTime ? 'var(--color-accent-primary)' : MODE_COLORS[mode]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease',
          }}
        />
      </svg>

      {/* Center text overlay */}
      <div style={{
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '3.5rem',
          fontWeight: 700,
          color: isLowTime ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
          lineHeight: 1,
        }}>
          {timeStr}
        </span>
        <span style={{
          fontSize: 'var(--text-sm)',
          color: isLowTime ? 'var(--color-accent-primary)' : MODE_COLORS[mode],
          fontWeight: 500,
        }}>
          {MODE_LABELS[mode]}
        </span>
      </div>

      {/* Visually hidden for screen readers */}
      <div className="sr-only" aria-live="polite">
        {label}
      </div>
    </div>
  );
}
