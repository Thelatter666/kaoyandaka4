/**
 * 掌握档圆点（5 点）：filled = 主色 token，空点 = 边框色。
 * 纯展示组件：语义交给 aria-label（role="img"），点本身 aria-hidden。
 */
import React from 'react';
import { VOCAB_MASTERY_MAX } from '@shared/constants';

interface VocabMasteryDotsProps {
  level: number;
  /** 覆盖默认 aria-label（如「掌握档 3 / 5」） */
  label?: string;
}

export function VocabMasteryDots({ level, label }: VocabMasteryDotsProps) {
  const capped = Math.max(0, Math.min(VOCAB_MASTERY_MAX, Math.trunc(level)));
  return (
    <span
      className="vocab-dots"
      role="img"
      aria-label={label ?? `掌握档 ${capped} / ${VOCAB_MASTERY_MAX}`}
    >
      {Array.from({ length: VOCAB_MASTERY_MAX }, (_, i) => (
        <span
          key={i}
          className={i < capped ? 'vocab-dots__dot vocab-dots__dot--filled' : 'vocab-dots__dot'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
