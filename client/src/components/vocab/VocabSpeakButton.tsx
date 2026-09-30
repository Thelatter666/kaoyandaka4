/**
 * 发音钮（词库卡 / 复习卡 / 详情共用）：speechSynthesis en-US，见 speak.ts。
 * disabled 用于翻面场景——背面朝上的那一面整面不可交互、不进 Tab 序。
 */
import React from 'react';
import { Volume2 } from 'lucide-react';
import { speakWord } from './speak';

interface VocabSpeakButtonProps {
  word: string;
  size?: number;
  disabled?: boolean;
  className?: string;
}

export function VocabSpeakButton({ word, size = 16, disabled = false, className }: VocabSpeakButtonProps) {
  return (
    <button
      type="button"
      className={`vocab-speak${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        /* 阻断冒泡：词库卡的头部整块可点开合，发音不应连带展开/收起 */
        e.stopPropagation();
        speakWord(word);
      }}
      disabled={disabled}
      aria-label={`朗读 ${word}`}
      title="朗读（en-US）"
    >
      <Volume2 size={size} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
