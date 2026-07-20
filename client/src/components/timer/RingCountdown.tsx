import React, { useId } from 'react';
import { formatSeconds } from '../../utils/duration';
import './RingCountdown.css';

/**
 * 番茄钟「光晕核心」（设计文档 5.1 / 5.2）
 *
 * 由外向内：glass-2 玻璃圆盘 → 外环进度环（r=160，12 点起笔顺时针消减，
 * 同色辉光 drop-shadow + 同色 8% 底环）→ 中环 24 颗轮次刻度珠（r=136，
 * 前 completedRoundsToday 颗点亮）→ 内环装饰细环（r=112）→ 中心 HTML
 * 覆盖层（渐变等宽数字 / 模式文字 / 预设名+科目）。
 *
 * 低时警示：专注模式剩余 ≤300s，环变金红渐变并呼吸脉动，数字同步渐变；
 * prefers-reduced-motion 下仅变色（全局 0.01ms 规则 + 组件级降级）。
 *
 * variant="mini"：120px 简化版，无刻度珠与装饰环，数字 20px（供首页迷你进度环）。
 */

type TimerMode = 'focus' | 'short_break' | 'long_break';

interface RingCountdownProps {
  totalSeconds: number;
  remainingSeconds: number;
  mode: TimerMode;
  ariaLabel?: string;
  /** 今日已完成轮次：点亮中环刻度珠，超过 24 颗全亮 */
  completedRoundsToday?: number;
  /** 中心副标题（预设名 + 科目），一行省略 */
  subtitle?: string;
  /** full＝完整光晕核心；mini＝120px 简化版（无刻度珠/装饰环/模式与副标题文本） */
  variant?: 'full' | 'mini';
}

const MODE_LABELS: Record<TimerMode, string> = {
  focus: '专注中',
  short_break: '短休息',
  long_break: '长休息',
};

/** 中环刻度珠数量上限（设计文档 5.1.3） */
const MAX_BEADS = 24;
/** 低时警示阈值：专注模式剩余 ≤300s（最后 5 分钟） */
const LOW_TIME_THRESHOLD_SECONDS = 300;

const CENTER = 180;
const PROGRESS_RADIUS = 160;
const BEAD_RADIUS = 136;
const INNER_RING_RADIUS = 112;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;

/**
 * 默认 aria-label：分钟粒度更新（秒数向下取整到整分钟），
 * 避免 aria-live 每秒播报；格式如「专注中 剩余 32 分 0 秒」。
 */
function buildDefaultAriaLabel(mode: TimerMode, remainingSeconds: number): string {
  if (remainingSeconds > 0 && remainingSeconds < 60) {
    return `${MODE_LABELS[mode]} 剩余不到 1 分钟`;
  }
  const snappedSeconds = Math.floor(remainingSeconds / 60) * 60;
  const minutes = Math.floor(snappedSeconds / 60);
  const seconds = snappedSeconds % 60;
  return `${MODE_LABELS[mode]} 剩余 ${minutes} 分 ${seconds} 秒`;
}

export function RingCountdown({
  totalSeconds,
  remainingSeconds,
  mode,
  ariaLabel,
  completedRoundsToday = 0,
  subtitle,
  variant = 'full',
}: RingCountdownProps) {
  const isMini = variant === 'mini';
  // useId 含冒号，不能直接用于 CSS url(#...)，清洗后作为渐变 id
  const lowTimeGradientId = `ring-low-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;
  const strokeDashoffset = PROGRESS_CIRCUMFERENCE * (1 - progress);
  const isLowTime = mode === 'focus' && remainingSeconds <= LOW_TIME_THRESHOLD_SECONDS;
  const litBeads = Math.min(Math.max(0, Math.floor(completedRoundsToday)), MAX_BEADS);

  const timeStr = formatSeconds(remainingSeconds);
  const label = ariaLabel ?? buildDefaultAriaLabel(mode, remainingSeconds);

  const classNames = [
    'ring-countdown',
    `ring-countdown--${mode}`,
    isLowTime ? 'ring-countdown--lowtime' : '',
    isMini ? 'ring-countdown--mini' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} role="timer" aria-live="polite" aria-label={label}>
      <div className="ring-countdown__disc glass-2">
        <svg
          className="ring-countdown__svg"
          viewBox="0 0 360 360"
          aria-hidden="true"
          focusable="false"
        >
          {isLowTime && (
            <defs>
              {/* 低时警示：金红渐变（--color-accent-primary → --color-timer-low） */}
              <linearGradient
                id={lowTimeGradientId}
                gradientUnits="userSpaceOnUse"
                x1="40"
                y1="40"
                x2="320"
                y2="320"
              >
                <stop offset="0%" stopColor="var(--color-accent-primary)" />
                <stop offset="100%" stopColor="var(--color-timer-low)" />
              </linearGradient>
            </defs>
          )}

          {/* 外环·底环：同色 8% 透明 */}
          <circle
            className="ring-countdown__base"
            cx={CENTER}
            cy={CENTER}
            r={PROGRESS_RADIUS}
            fill="none"
            strokeWidth={12}
          />
          {/* 外环·进度环：12 点起笔顺时针消减，辉光由 CSS drop-shadow(currentColor) 提供 */}
          <circle
            className="ring-countdown__progress"
            cx={CENTER}
            cy={CENTER}
            r={PROGRESS_RADIUS}
            fill="none"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={PROGRESS_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            style={{ stroke: isLowTime ? `url(#${lowTimeGradientId})` : 'var(--_rc-c1)' }}
          />

          {/* 中环·轮次刻度珠：24 颗均布，前 n 颗点亮（mini 不渲染） */}
          {!isMini &&
            Array.from({ length: MAX_BEADS }, (_, i) => {
              const angle = ((-90 + i * (360 / MAX_BEADS)) * Math.PI) / 180;
              return (
                <circle
                  key={i}
                  className={`ring-countdown__bead${i < litBeads ? ' ring-countdown__bead--lit' : ''}`}
                  cx={CENTER + BEAD_RADIUS * Math.cos(angle)}
                  cy={CENTER + BEAD_RADIUS * Math.sin(angle)}
                  r={3}
                />
              );
            })}

          {/* 内环·装饰细环（mini 不渲染） */}
          {!isMini && (
            <circle
              className="ring-countdown__inner"
              cx={CENTER}
              cy={CENTER}
              r={INNER_RING_RADIUS}
              fill="none"
              strokeWidth={1.5}
            />
          )}
        </svg>

        {/* 中心 HTML 覆盖层：剩余时间 / 模式文字 / 预设名+科目 */}
        <div className="ring-countdown__center">
          <span className="ring-countdown__time">{timeStr}</span>
          {!isMini && <span className="ring-countdown__mode">{MODE_LABELS[mode]}</span>}
          {!isMini && subtitle && (
            <span className="ring-countdown__subtitle" title={subtitle}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
