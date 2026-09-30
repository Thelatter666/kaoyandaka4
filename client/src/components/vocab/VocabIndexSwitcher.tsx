/**
 * 词库索引切换器（spec §5）：乱序 / 顺序 / 掌握程度，glass-1 分段控件。
 * 切换语义由父级实现（乱序 = 每次重选都重新洗牌），本组件只负责选择与无障碍状态。
 */
import React from 'react';

export type VocabIndexMode = 'random' | 'created' | 'mastery';

const OPTIONS: Array<{ value: VocabIndexMode; label: string; title: string }> = [
  { value: 'random', label: '乱序', title: '每次进入词库或重选都重新洗牌' },
  { value: 'created', label: '顺序', title: '按加入时间升序' },
  { value: 'mastery', label: '掌握程度', title: '掌握档升序，同级按字母序，毕业词沉底' },
];

interface VocabIndexSwitcherProps {
  value: VocabIndexMode;
  onChange: (mode: VocabIndexMode) => void;
}

export function VocabIndexSwitcher({ value, onChange }: VocabIndexSwitcherProps) {
  return (
    <div className="vocab-index glass-1" role="group" aria-label="词库索引">
      {OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? 'vocab-index__btn vocab-index__btn--active' : 'vocab-index__btn'}
            aria-pressed={isActive}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
