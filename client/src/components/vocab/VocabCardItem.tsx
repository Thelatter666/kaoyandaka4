/**
 * 词库卡片（spec §5）：收起态 = 单词 + 音标 + 首要释义 + 掌握档圆点；
 * 展开态 = 完整详解（definitions / examples / extra Markdown）+ 手动调档 / 重置 / 删除。
 *
 * 同时导出 `VocabDetail`：详情渲染被复习卡（背面、首学正面）与查询弹窗（预览）复用，
 * 保证三处词卡排版逐字一致。
 */
import React, { useState } from 'react';
import { ChevronDown, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dropdown } from '../ui/Dropdown';
import { showToast } from '../ui/Toast';
import { MarkdownText } from './markdown';
import { VocabMasteryDots } from './VocabMasteryDots';
import { VocabSpeakButton } from './VocabSpeakButton';
import { vocabApi } from '../../api/vocab';
import { VOCAB_MASTERY_MAX } from '@shared/constants';
import type { VocabCard, VocabContent, VocabDefinition, VocabExample } from '@shared/types';

/** 详情渲染所需的最小字段集：VocabCard 与 LLM 输出的 VocabContent 均结构兼容
 *  （VocabContent 的可选字段带 undefined，故此处写作可选 + null 联合） */
export interface VocabDetailData {
  phonetic?: string | null;
  definitions: VocabDefinition[];
  examples: VocabExample[];
  extra?: string | null;
  examFreq?: VocabContent['examFreq'];
}

/** 词卡详解（定义/例句/词根辨析）：词库展开、复习背面、查询预览三处共用 */
export function VocabDetail({ data, word }: { data: VocabDetailData; word?: string }) {
  return (
    <div className="vocab-detail">
      {(data.phonetic || data.examFreq || word) && (
        <div className="vocab-detail__meta">
          {data.phonetic && <span className="vocab-detail__phonetic">{data.phonetic}</span>}
          {word && <VocabSpeakButton word={word} size={15} />}
          {data.examFreq && <span className="vocab-detail__freq">考频 {data.examFreq}</span>}
        </div>
      )}

      <ol className="vocab-detail__defs">
        {data.definitions.map((definition, index) => (
          <li className="vocab-detail__def" key={index}>
            <span className="vocab-detail__pos">{definition.pos}</span>
            <span className="vocab-detail__meaning">{definition.meaning}</span>
          </li>
        ))}
      </ol>

      <ul className="vocab-detail__examples">
        {data.examples.map((example, index) => (
          <li className="vocab-detail__example" key={index}>
            <p className="vocab-detail__en">{example.en}</p>
            <p className="vocab-detail__zh">{example.zh}</p>
          </li>
        ))}
      </ul>

      {data.extra && (
        <div className="vocab-detail__extra">
          <span className="vocab-detail__extra-label">词根 · 辨析 · 记忆</span>
          <MarkdownText text={data.extra} />
        </div>
      )}
    </div>
  );
}

const MASTERY_OPTIONS = Array.from({ length: VOCAB_MASTERY_MAX + 1 }, (_, level) => ({
  value: String(level),
  label: level === VOCAB_MASTERY_MAX ? `${level} 档（毕业）` : `${level} 档`,
}));

interface VocabCardItemProps {
  card: VocabCard;
  /** 调档 / 重置后回传新卡（父级局部更新，不整表重取） */
  onUpdated: (card: VocabCard) => void;
  onDeleted: (id: string) => void;
}

export function VocabCardItem({ card, onUpdated, onDeleted }: VocabCardItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const firstMeaning = card.definitions[0]?.meaning ?? '';

  const handleMastery = async (value: string) => {
    const level = Number(value);
    if (level === card.masteryLevel) return;
    setBusy(true);
    try {
      const updated = await vocabApi.update(card.id, { masteryLevel: level });
      onUpdated(updated);
      showToast('success', `「${updated.word}」掌握档已调整为 ${level}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '调整掌握档失败');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      const updated = await vocabApi.update(card.id, { reset: true });
      onUpdated(updated);
      showToast('success', `「${updated.word}」进度已重置`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '重置失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    try {
      await vocabApi.remove(card.id);
      onDeleted(card.id);
      showToast('success', `已删除「${card.word}」`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <article className={expanded ? 'vocab-card vocab-card--expanded glass-1' : 'vocab-card glass-1'}>
      <div className="vocab-card__head">
        <button
          type="button"
          className="vocab-card__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span className="vocab-card__main">
            <span className="vocab-card__word">{card.word}</span>
            {card.phonetic && <span className="vocab-card__phonetic">{card.phonetic}</span>}
            <span className="vocab-card__meaning">{firstMeaning}</span>
          </span>
          <span className="vocab-card__meta">
            {card.isMastered && <span className="vocab-card__badge">已毕业</span>}
            <VocabMasteryDots level={card.masteryLevel} />
            <ChevronDown
              className={expanded ? 'vocab-card__chevron vocab-card__chevron--open' : 'vocab-card__chevron'}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
        </button>
        <VocabSpeakButton word={card.word} className="vocab-card__speak" />
      </div>

      {expanded && (
        <div className="vocab-card__body">
          <VocabDetail data={card} />

          <div className="vocab-card__stats">
            <span className="tabular-nums">对 {card.correctCount} · 错 {card.wrongCount}</span>
            <span>下次复习 {card.nextReviewDate}</span>
            <span>
              {card.firstLearnedAt ? `首学 ${card.firstLearnedAt.slice(0, 10)}` : '尚未首学'}
            </span>
          </div>

          <div className="vocab-card__actions">
            <Dropdown
              size="sm"
              value={String(card.masteryLevel)}
              options={MASTERY_OPTIONS}
              onChange={(value) => { void handleMastery(value); }}
              disabled={busy}
              ariaLabel="手动调整掌握档"
            />
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void handleReset(); }}>
              <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
              重置进度
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="vocab-card__delete"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
              删除
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="删除词卡"
        message={`确定要删除「${card.word}」吗？`}
        detail="删除后该词的掌握进度一并清除，不可恢复。"
        confirmLabel="删除词卡"
        destructive
      />
    </article>
  );
}
