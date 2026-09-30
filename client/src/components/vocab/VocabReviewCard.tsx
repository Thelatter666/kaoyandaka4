/**
 * 复习卡（spec §4）：正面只有单词 + 音标 + 发音钮（遮全部释义），点击翻面看详解；
 * 翻面用 framer-motion rotateY，`useShouldReduceMotion()`（节能模式超集）下瞬时切换。
 *
 * 双面实现要点：
 * - 两面常驻 DOM（3D 翻转需要），`backface-visibility: hidden` 负责视觉遮挡；
 * - 当前朝下的一面整面不可交互：aria-hidden + 子控件 disabled/tabIndex=-1；
 * - 背面在流内、正面绝对定位（phase='back' 时互换），容器高度跟随可见面，不裁切长详解。
 */
import React from 'react';
import { motion } from 'framer-motion';
import { useShouldReduceMotion } from '../../hooks/usePowerSave';
import { VocabDetail } from './VocabCardItem';
import { VocabSpeakButton } from './VocabSpeakButton';
import type { ReviewGrade, VocabCard } from '@shared/types';

interface VocabReviewCardProps {
  card: VocabCard;
  phase: 'front' | 'back';
  /** 评分请求进行中：三键禁用，防止重复落库 */
  busy?: boolean;
  onFlip: () => void;
  onGrade: (grade: ReviewGrade) => void;
}

const GRADES: Array<{ grade: ReviewGrade; label: string; className: string }> = [
  { grade: 'known', label: '认识', className: 'vocab-grade--known' },
  { grade: 'fuzzy', label: '模糊', className: 'vocab-grade--fuzzy' },
  { grade: 'unknown', label: '不认识', className: 'vocab-grade--unknown' },
];

export function VocabReviewCard({ card, phase, busy = false, onFlip, onGrade }: VocabReviewCardProps) {
  const reducedMotion = useShouldReduceMotion();
  const flipped = phase === 'back';

  return (
    <div className="vocab-flip" data-phase={phase}>
      <div className="vocab-flip__scene">
        <motion.div
          className="vocab-flip__inner"
          initial={false}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* 正面：只露单词/音标/发音，整块可点翻面 */}
          <div
            className="vocab-flip__face vocab-flip__face--front glass-1"
            aria-hidden={flipped}
          >
            <button
              type="button"
              className="vocab-flip__tap"
              onClick={onFlip}
              tabIndex={flipped ? -1 : 0}
              aria-label={`翻面查看 ${card.word} 的详解`}
            >
              <span className="vocab-flip__word">{card.word}</span>
              {card.phonetic && <span className="vocab-flip__phonetic">{card.phonetic}</span>}
              <span className="vocab-flip__hint">点击翻面查看详解</span>
            </button>
            <div className="vocab-flip__tools">
              <VocabSpeakButton word={card.word} size={18} disabled={flipped} />
            </div>
          </div>

          {/* 背面：完整详解 + 自评三键。流内定位（phase='back'），撑起容器高度 */}
          <div
            className="vocab-flip__face vocab-flip__face--back glass-1"
            aria-hidden={!flipped}
          >
            <div className="vocab-flip__back-head">
              <span className="vocab-flip__word vocab-flip__word--sm">{card.word}</span>
              <VocabSpeakButton word={card.word} size={16} disabled={!flipped} />
            </div>
            <VocabDetail data={card} />
            <div className="vocab-review__grades">
              {GRADES.map(({ grade, label, className }) => (
                <button
                  key={grade}
                  type="button"
                  className={`vocab-grade ${className}`}
                  onClick={() => onGrade(grade)}
                  disabled={busy || !flipped}
                  tabIndex={flipped ? 0 : -1}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
