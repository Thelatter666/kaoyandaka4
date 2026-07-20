/**
 * 专注时长选择器（设计文档 8.3）
 *
 * 快捷钮（25/45/60）玻璃胶囊组；-5/+5 为 44px 圆钮（Minus/Plus 图标）；
 * 当前值等宽 36px；5–120 分钟、5 分钟倍数规则不变。
 */
import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { DURATION_QUICK_OPTIONS, DURATION_STEP, DURATION_MIN, DURATION_MAX } from '@shared/schemas/common';
import './DurationSelector.css';

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
    <div className="duration-selector">
      {/* 快捷钮：玻璃胶囊组 */}
      <div className="duration-selector__quick glass-1" role="group" aria-label="快捷时长">
        {DURATION_QUICK_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`duration-selector__pill${value === opt ? ' duration-selector__pill--active' : ''}`}
            aria-pressed={value === opt}
            disabled={disabled}
            onClick={() => onChange(opt)}
          >
            {opt} 分钟
          </button>
        ))}
      </div>

      {/* 步进：-5/+5 44px 圆钮 + 当前值等宽 36px */}
      <div className="duration-selector__stepper">
        <button
          type="button"
          className="duration-selector__round glass-1"
          disabled={disabled || value <= DURATION_MIN}
          onClick={() => adjust(-DURATION_STEP)}
          aria-label="减少 5 分钟"
        >
          <Minus size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>

        <span className="duration-selector__value" aria-live="polite">
          <span className="duration-selector__num tabular-nums">{value}</span>
          <span className="duration-selector__unit">分钟</span>
        </span>

        <button
          type="button"
          className="duration-selector__round glass-1"
          disabled={disabled || value >= DURATION_MAX}
          onClick={() => adjust(DURATION_STEP)}
          aria-label="增加 5 分钟"
        >
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* 滑杆（5–120 分钟、5 分钟倍数，规则不变） */}
      <input
        type="range"
        className="duration-selector__range"
        min={DURATION_MIN}
        max={DURATION_MAX}
        step={DURATION_STEP}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`专注时长：${value} 分钟`}
      />
      <div className="duration-selector__bounds">
        <span>{DURATION_MIN} 分钟</span>
        <span>{DURATION_MAX} 分钟</span>
      </div>
    </div>
  );
}
