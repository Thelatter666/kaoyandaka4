/**
 * 词库卡片（spec §5）：收起态 = 单词 + 音标 + 首要释义 + 掌握档圆点；
 * 展开态 = 完整详解（definitions / examples / extra Markdown）+ 手动调档 / 重置 / 删除。
 *
 * 待补全（暂存卡，definitions 为空）：收起态带「待补全」徽标，详解区不渲染释义/例句
 * 而显示「内容待补全」占位；详情里有单个「AI 补全」（查词 → update({content})），
 * 未配置 LLM 时点击交由父级打开配置弹窗。批量补全的逐卡进度（排队/进行中/成功/失败）
 * 由页面状态机的 completionState/completionMessage 下发，本组件只负责展示。
 *
 * 同时导出 `VocabDetail`：详情渲染被复习卡（背面、首学正面）与查询弹窗（预览）复用，
 * 保证三处词卡排版逐字一致。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dropdown } from '../ui/Dropdown';
import { showToast } from '../ui/Toast';
import { MarkdownText } from './markdown';
import { VocabMasteryDots } from './VocabMasteryDots';
import { VocabSpeakButton } from './VocabSpeakButton';
import { vocabApi } from '../../api/vocab';
import { loadLlmConfig, lookupWord } from '../../utils/vocabLlm';
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

/** 待补全判据（spec：definitions 为空即暂存卡；buildReviewQueue 同样以此排除复习） */
export function isPendingVocabCard(card: VocabCard): boolean {
  return card.definitions.length === 0;
}

/** 批量补全逐卡进度（由页面状态机维护）；cancelled = 取消时尚未完成的卡 */
export type VocabCompletionState = 'queued' | 'running' | 'success' | 'error' | 'cancelled';

const COMPLETION_LABEL: Record<VocabCompletionState, string> = {
  queued: '排队中…',
  running: '补全中…',
  success: '已补全',
  error: '补全失败',
  cancelled: '已取消',
};

/** 词卡详解（定义/例句/词根辨析）：词库展开、复习背面、查询预览三处共用 */
export function VocabDetail({ data, word }: { data: VocabDetailData; word?: string }) {
  const isEmpty = data.definitions.length === 0;

  return (
    <div className="vocab-detail">
      {(data.phonetic || data.examFreq || word) && (
        <div className="vocab-detail__meta">
          {data.phonetic && <span className="vocab-detail__phonetic">{data.phonetic}</span>}
          {word && <VocabSpeakButton word={word} size={15} />}
          {data.examFreq && <span className="vocab-detail__freq">考频 {data.examFreq}</span>}
        </div>
      )}

      {isEmpty ? (
        <div className="vocab-detail__empty" role="note">
          <span className="vocab-detail__empty-title">内容待补全</span>
          <span className="vocab-detail__empty-text">
            该词为暂存卡，尚未生成释义与例句；LLM 恢复后可用「AI 补全」补齐。
          </span>
        </div>
      ) : (
        <>
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
        </>
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
  /** 调档 / 重置 / 补全后回传新卡（父级局部更新，不整表重取） */
  onUpdated: (card: VocabCard) => void;
  onDeleted: (id: string) => void;
  /** 未配置 LLM 时点「AI 补全」：引导打开配置弹窗（父级负责开窗） */
  onOpenLlmConfig: () => void;
  /** 批量补全过滤模式：头部显示勾选框（仅待补全卡） */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (id: string, selected: boolean) => void;
  /** 批量补全进度标记（页面状态机下发；null/undefined 表示不在本批次） */
  completionState?: VocabCompletionState | null;
  /** 失败原因摘要（completionState === 'error' 时展示） */
  completionMessage?: string;
}

export function VocabCardItem({
  card,
  onUpdated,
  onDeleted,
  onOpenLlmConfig,
  selectable = false,
  selected = false,
  onSelectedChange,
  completionState = null,
  completionMessage,
}: VocabCardItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const completeAbortRef = useRef<AbortController | null>(null);

  const isPending = isPendingVocabCard(card);
  const firstMeaning = card.definitions[0]?.meaning ?? '';

  /* 卸载（如删除当前卡 / 切换视图）时中止在途补全请求 */
  useEffect(() => () => completeAbortRef.current?.abort(), []);

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

  /** 单卡 AI 补全：查词 → 只写内容字段（SRS 进度不动） */
  const handleComplete = async () => {
    const config = loadLlmConfig();
    if (!config) {
      onOpenLlmConfig();
      return;
    }
    setCompleting(true);
    const controller = new AbortController();
    completeAbortRef.current = controller;
    try {
      const content = await lookupWord(config, card.word, controller.signal);
      const updated = await vocabApi.update(card.id, { content });
      onUpdated(updated);
      showToast('success', `「${updated.word}」内容已补全`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      showToast('error', err instanceof Error ? err.message : '补全失败');
    } finally {
      completeAbortRef.current = null;
      setCompleting(false);
    }
  };

  return (
    <article className={expanded ? 'vocab-card vocab-card--expanded glass-1' : 'vocab-card glass-1'}>
      <div className="vocab-card__head">
        {selectable && isPending && (
          <input
            type="checkbox"
            className="vocab-card__check"
            checked={selected}
            onChange={(e) => onSelectedChange?.(card.id, e.target.checked)}
            aria-label={`选中「${card.word}」加入批量补全`}
          />
        )}
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
            {isPending && (
              <span className="vocab-card__badge vocab-card__badge--pending">待补全</span>
            )}
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

      {completionState && (
        <p
          className={`vocab-card__completion vocab-card__completion--${completionState}`}
          role="status"
          title={completionState === 'error' ? completionMessage : undefined}
        >
          {completionState === 'running' && (
            <Loader2 className="btn__spinner" size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
          {completionState === 'success' && <Check size={13} strokeWidth={2.25} aria-hidden="true" />}
          {completionState === 'error' && <X size={13} strokeWidth={2.25} aria-hidden="true" />}
          <span className="vocab-card__completion-text">
            {COMPLETION_LABEL[completionState]}
            {completionState === 'error' && completionMessage ? `：${completionMessage}` : ''}
          </span>
        </p>
      )}

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
            {isPending && (
              <Button
                size="sm"
                variant="primary"
                loading={completing}
                disabled={busy || completing}
                onClick={() => { void handleComplete(); }}
              >
                <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" />
                AI 补全
              </Button>
            )}
            <Dropdown
              size="sm"
              value={String(card.masteryLevel)}
              options={MASTERY_OPTIONS}
              onChange={(value) => { void handleMastery(value); }}
              disabled={busy || completing}
              ariaLabel="手动调整掌握档"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || completing}
              onClick={() => { void handleReset(); }}
            >
              <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
              重置进度
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="vocab-card__delete"
              disabled={busy || completing}
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
