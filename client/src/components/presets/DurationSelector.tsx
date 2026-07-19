import React from 'react';
import { Button } from '../ui/Button';
import { DURATION_QUICK_OPTIONS, DURATION_STEP, DURATION_MIN, DURATION_MAX } from '@shared/schemas/common';

interface DurationSelectorProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function DurationSelector({ value, onChange, disabled = false }: DurationSelectorProps) {
  const adjust = (delta: number) => {
    const newValue = value + delta;
    if (newValue >= DURATION_MIN && newValue <= DURATION_MAX) {
      onChange(newValue);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {/* Quick buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        {DURATION_QUICK_OPTIONS.map((opt) => (
          <Button
            key={opt}
            variant={value === opt ? 'primary' : 'secondary'}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(opt)}
          >
            {opt} 分钟
          </Button>
        ))}
      </div>

      {/* Step adjustor */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
      }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || value <= DURATION_MIN}
          onClick={() => adjust(-DURATION_STEP)}
          aria-label="减少 5 分钟"
        >
          −5
        </Button>

        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          minWidth: 100,
          textAlign: 'center',
        }}>
          {value} 分钟
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || value >= DURATION_MAX}
          onClick={() => adjust(DURATION_STEP)}
          aria-label="增加 5 分钟"
        >
          +5
        </Button>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={DURATION_MIN}
        max={DURATION_MAX}
        step={DURATION_STEP}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`专注时长：${value} 分钟`}
        style={{
          width: '100%',
          accentColor: 'var(--color-accent-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-muted)',
      }}>
        <span>{DURATION_MIN} 分钟</span>
        <span>{DURATION_MAX} 分钟</span>
      </div>
    </div>
  );
}
