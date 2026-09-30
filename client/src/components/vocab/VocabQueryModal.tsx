/**
 * 查询单词弹窗（spec §3.4 / §14）：
 * 单查：归一 → 先查页面已加载的词库（命中即展示已有卡 + Toast，不重复调 LLM）
 *      → 未配置 LLM 则引导打开配置弹窗 → 调 LLM 出预览（结构化渲染）→「加入单词本」。
 * 批量（spec §14）：输入框为 textarea，`parseWordList` 实时解析；≥2 个词走批量流程——
 *      串行逐词 lookupWord → vocabApi.create 立即入库（失败自动暂存空内容卡），
 *      AbortController 支持取消，逐词状态行 + 顶部 `生成中 x/y` + 结束汇总 Toast。
 *
 * 错误：LlmError 各 kind 的文案已含在 message 中（C3 定稿），本层只按 kind 追加
 * CORS 的「换服务商」提示；弹窗内联展示 + Toast + 重试按钮；提交时传 AbortSignal，
 * 弹窗关闭即 abort 在途请求（批量的收尾回写与 Toast 一并作废）。
 *
 * 暂存：LLM 查词失败（任何 LlmError，非「未配置」）时错误区出现「暂存单词」；
 * 批量中单词语义相同：失败即自动暂存并标「已暂存」。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Search } from 'lucide-react';
import { VOCAB_BATCH_MAX } from '@shared/constants';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { ApiError } from '../../api/client';
import { vocabApi } from '../../api/vocab';
import { normalizeWord } from '../../local/types';
import {
  LlmError,
  loadLlmConfig,
  lookupWord,
  parseWordList,
  type LlmErrorKind,
} from '../../utils/vocabLlm';
import { VocabDetail } from './VocabCardItem';
import type { VocabCard, VocabContent } from '@shared/types';

type QueryStatus = 'idle' | 'loading' | 'preview' | 'existing' | 'error';

/** 批量逐词状态（spec §14.2）；staged = LLM 失败但已暂存空内容卡 */
type BatchItemState = 'queued' | 'running' | 'success' | 'duplicate' | 'staged' | 'error' | 'cancelled';

interface BatchItem {
  word: string;
  state: BatchItemState;
  /** 失败原因摘要（state === 'error' 时展示） */
  message?: string;
}

interface BatchRun {
  items: BatchItem[];
  running: boolean;
  cancelled: boolean;
}

const BATCH_LABEL: Record<BatchItemState, string> = {
  queued: '排队中',
  running: '生成中…',
  success: '已加入',
  duplicate: '已存在',
  staged: '已暂存',
  error: '失败',
  cancelled: '已取消',
};

/** 批量与单查共用的输入上限（20 词 × 100 字符 + 分隔符，留足余量） */
const INPUT_MAX_LENGTH = 2400;

interface VocabQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 页面已加载的全量词卡：查重口径与词库一致 */
  cards: VocabCard[];
  /** 加入成功：回传新卡（父级插入列表） */
  onCreated: (card: VocabCard) => void;
  /** 未配置 LLM：引导打开配置弹窗（父级负责关本窗开配置窗） */
  onOpenLlmConfig: () => void;
}

export function VocabQueryModal({
  isOpen,
  onClose,
  cards,
  onCreated,
  onOpenLlmConfig,
}: VocabQueryModalProps) {
  const [word, setWord] = useState('');
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [content, setContent] = useState<VocabContent | null>(null);
  const [existingCard, setExistingCard] = useState<VocabCard | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorKind, setErrorKind] = useState<LlmErrorKind | null>(null);
  const [creating, setCreating] = useState(false);
  const [stashing, setStashing] = useState(false);
  const [batch, setBatch] = useState<BatchRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  /** 批量运行代次：关闭弹窗即自增，作废在途批量的收尾回写与 Toast */
  const batchRunIdRef = useRef(0);

  const normalized = normalizeWord(word);
  const isNotConfigured = errorKind === 'not_configured';
  /* 查词失败（LLM 侧）才提供暂存；未配置走「去配置」引导，重复词等非 LLM 错误不提供 */
  const canStage = errorKind !== null && errorKind !== 'not_configured';

  /* 实时解析：1 个词走单查，≥2 个走批量（spec §14.1） */
  const parsed = useMemo(() => parseWordList(word), [word]);
  const isBatchInput = parsed.words.length > 1;
  const batchRunning = batch?.running === true;
  const batchDone = batch ? batch.items.filter((item) => item.state !== 'queued' && item.state !== 'running').length : 0;

  /* 关闭（含 Modal 240ms 退场窗口）后中止在途请求并清态：下次打开不残留上次结果 */
  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    abortRef.current = null;
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    batchRunIdRef.current += 1;
    setWord('');
    setStatus('idle');
    setContent(null);
    setExistingCard(null);
    setErrorMessage('');
    setErrorKind(null);
    setCreating(false);
    setStashing(false);
    setBatch(null);
  }, [isOpen]);

  const runLookup = async (raw: string) => {
    const target = normalizeWord(raw);
    if (!target) return;
    setBatch(null);

    /* 查重：词库全量已在页面状态中（spec §3.4），命中不调 LLM */
    const duplicate = cards.find((card) => card.word === target);
    if (duplicate) {
      setExistingCard(duplicate);
      setContent(null);
      setStatus('existing');
      showToast('info', '该单词已在词库中');
      return;
    }

    const config = loadLlmConfig();
    if (!config) {
      setStatus('error');
      setErrorKind('not_configured');
      setErrorMessage('尚未配置 LLM 服务：请先填写地址、API Key 与模型名');
      return;
    }

    setStatus('loading');
    setErrorMessage('');
    setErrorKind(null);
    setExistingCard(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await lookupWord(config, target, controller.signal);
      setContent(result);
      setStatus('preview');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const kind = err instanceof LlmError ? err.kind : 'network';
      const base = err instanceof Error ? err.message : '查询失败，请稍后重试';
      /* kind 文案已在 message 内；仅 CORS 额外提示换服务商（spec §3.2 第 5 条） */
      const message = kind === 'cors' ? `${base}；可改用支持浏览器直连的服务商` : base;
      setErrorMessage(message);
      setErrorKind(kind);
      setStatus('error');
      showToast('error', message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  /**
   * 批量生成（spec §14.2）：串行 async for + AbortController。
   * 执行序：词库已有（页面 cards + 本批已成功/已暂存集合）→ duplicate 跳过；
   * lookupWord 成功 → create({word, content}) → onCreated → success；
   * LlmError（非 not_configured）→ create({word}) 暂存 → staged（暂存失败 → error）；
   * 非 LLM 错误 → error + message；not_configured → 中断全批并引导去配置。
   */
  const startBatch = async (words: string[]) => {
    const config = loadLlmConfig();
    if (!config) {
      setBatch(null);
      setStatus('error');
      setErrorKind('not_configured');
      setErrorMessage('尚未配置 LLM 服务：请先填写地址、API Key 与模型名');
      return;
    }

    const runId = batchRunIdRef.current + 1;
    batchRunIdRef.current = runId;
    const alive = () => batchRunIdRef.current === runId;
    const controller = new AbortController();
    batchAbortRef.current = controller;

    /* 查重：页面已加载词库 + 本批已入库（success/staged）的词 */
    const existingWords = new Set(cards.map((card) => card.word));
    const createdWords = new Set<string>();

    setBatch({
      items: words.map((item) => ({ word: item, state: 'queued' as BatchItemState })),
      running: true,
      cancelled: false,
    });
    setStatus('idle');
    setContent(null);
    setExistingCard(null);
    setErrorMessage('');
    setErrorKind(null);

    const counts = { success: 0, duplicate: 0, staged: 0, failed: 0 };
    const patchItem = (target: string, patch: Partial<BatchItem>) => {
      setBatch((prev) =>
        prev
          ? { ...prev, items: prev.items.map((item) => (item.word === target ? { ...item, ...patch } : item)) }
          : prev
      );
    };
    const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
    let interruptedForConfig = false;

    for (const target of words) {
      if (controller.signal.aborted || !alive()) break;

      if (existingWords.has(target) || createdWords.has(target)) {
        counts.duplicate += 1;
        patchItem(target, { state: 'duplicate' });
        continue;
      }

      patchItem(target, { state: 'running' });
      let result: VocabContent | null = null;
      try {
        result = await lookupWord(config, target, controller.signal);
      } catch (err) {
        if (!alive()) return;
        if ((err as Error).name === 'AbortError') break;
        if (err instanceof LlmError && err.kind === 'not_configured') {
          counts.failed += 1;
          patchItem(target, { state: 'error', message: err.message });
          interruptedForConfig = true;
          controller.abort();
          break;
        }
        if (err instanceof LlmError) {
          /* 任何 LLM 失败 → 自动暂存空内容卡（spec §14.2 / §12） */
          try {
            const card = await vocabApi.create({ word: target });
            if (!alive()) return;
            createdWords.add(target);
            onCreated(card);
            counts.staged += 1;
            patchItem(target, { state: 'staged' });
          } catch (stageErr) {
            if (!alive()) return;
            counts.failed += 1;
            patchItem(target, { state: 'error', message: messageOf(stageErr, '暂存失败') });
          }
        } else {
          counts.failed += 1;
          patchItem(target, { state: 'error', message: messageOf(err, '生成失败') });
        }
        continue;
      }

      /* lookupWord 成功必返回内容；此判断仅为类型收窄 */
      if (!result) continue;
      try {
        const card = await vocabApi.create({ word: target, content: result });
        if (!alive()) return;
        createdWords.add(target);
        onCreated(card);
        counts.success += 1;
        patchItem(target, { state: 'success' });
      } catch (err) {
        if (!alive()) return;
        counts.failed += 1;
        patchItem(target, { state: 'error', message: messageOf(err, '加入单词本失败') });
      }
    }

    if (!alive()) return;
    const cancelled = controller.signal.aborted;
    batchAbortRef.current = null;
    setBatch((prev) =>
      prev
        ? {
            ...prev,
            running: false,
            cancelled,
            /* 取消/中断时：未处理项标「已取消」，已完成项（success/duplicate/staged/error）保留 */
            items: cancelled
              ? prev.items.map((item) =>
                  item.state === 'queued' || item.state === 'running'
                    ? { ...item, state: 'cancelled' as BatchItemState }
                    : item
                )
              : prev.items,
          }
        : prev
    );
    /* 完成后输入态清理 */
    setWord('');
    setStatus('idle');
    setContent(null);
    setExistingCard(null);
    setErrorMessage('');
    setErrorKind(null);

    const summary = `成功 ${counts.success} · 已存在 ${counts.duplicate} · 已暂存 ${counts.staged} · 失败 ${counts.failed}`;
    if (interruptedForConfig) {
      showToast('info', `LLM 未配置，批量生成已中断：${summary}`);
      onOpenLlmConfig();
    } else if (cancelled) {
      showToast('info', `已取消批量生成：${summary}`);
    } else if (counts.failed > 0) {
      showToast('error', `批量生成完成：${summary}`);
    } else {
      showToast('success', `批量生成完成：${summary}`);
    }
  };

  const handleSubmit = () => {
    if (batchRunning || parsed.words.length === 0) return;
    if (parsed.words.length === 1) void runLookup(parsed.words[0]);
    else void startBatch(parsed.words);
  };

  const cancelBatch = () => {
    batchAbortRef.current?.abort();
  };

  /** 暂存：LLM 不可用时先落一张空内容卡（服务器/本地均只传 word），恢复后补全 */
  const handleStage = async () => {
    if (!normalized) return;
    setStashing(true);
    try {
      const card = await vocabApi.create({ word: normalized });
      onCreated(card);
      showToast('success', '已暂存，LLM 恢复后可补全');
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'WORD_EXISTS'
          ? '该单词已在词库中'
          : err instanceof Error
            ? err.message
            : '暂存失败';
      showToast('error', message);
      setErrorMessage(message);
    } finally {
      setStashing(false);
    }
  };

  const handleCreate = async () => {
    if (!content || !normalized) return;
    setCreating(true);
    try {
      const card = await vocabApi.create({ word: normalized, content });
      onCreated(card);
      showToast('success', `已加入单词本：${card.word}`);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'WORD_EXISTS'
          ? '该单词已在词库中'
          : err instanceof Error
            ? err.message
            : '加入单词本失败';
      showToast('error', message);
      setErrorMessage(message);
      setStatus('error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="查询单词" size="lg">
      <div className="vocab-query">
        <form
          className="vocab-query__form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <textarea
            className="vocab-field vocab-query__input"
            rows={2}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="输入单词或短语；多个词用空格 / 逗号 / 换行分隔"
            maxLength={INPUT_MAX_LENGTH}
            aria-label="要查询的单词或短语，可一次输入多个"
            autoFocus
            disabled={batchRunning}
          />
          <Button
            type="submit"
            variant="primary"
            loading={status === 'loading'}
            disabled={parsed.words.length === 0 || batchRunning}
          >
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            {isBatchInput ? `批量生成（${parsed.words.length}）` : '查询'}
          </Button>
        </form>

        {isBatchInput && !batchRunning && (
          <p className="vocab-query__batch-hint">
            将处理 {parsed.words.length} 个词
            {parsed.truncated > 0 && (
              <span className="vocab-query__batch-limit">
                （最多一次 {VOCAB_BATCH_MAX} 个词，已截取前 {VOCAB_BATCH_MAX} 个）
              </span>
            )}
          </p>
        )}

        {batch && (
          <div className="vocab-query__batch">
            <div className="vocab-query__batch-head">
              <span className="vocab-query__batch-progress tabular-nums" role="status">
                {batch.running
                  ? `生成中 ${batchDone}/${batch.items.length}`
                  : batch.cancelled
                    ? `已取消 · 完成 ${batchDone}/${batch.items.length}`
                    : `已完成 ${batchDone}/${batch.items.length}`}
              </span>
              {batch.running && (
                <Button size="sm" variant="ghost" onClick={cancelBatch}>
                  取消
                </Button>
              )}
            </div>
            <ul className="vocab-query__batch-list">
              {batch.items.map((item) => (
                <li
                  key={item.word}
                  className={`vocab-query__batch-item vocab-query__batch-item--${item.state}`}
                >
                  <span className="vocab-query__batch-word">{item.word}</span>
                  <span className={`vocab-query__batch-badge vocab-query__batch-badge--${item.state}`}>
                    {BATCH_LABEL[item.state]}
                  </span>
                  {item.state === 'error' && item.message && (
                    <span className="vocab-query__batch-message" title={item.message}>
                      {item.message}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === 'idle' && !batch && (
          <p className="vocab-query__hint">
            输入单词后由 LLM 生成考研向词卡（音标 / 释义 / 例句 / 词根辨析）；
            多个词用逗号或换行分隔可一次批量生成并入库。
          </p>
        )}

        {status === 'loading' && (
          <p className="vocab-query__hint" role="status">
            正在生成词卡…（首次约数秒，超时上限 30 秒）
          </p>
        )}

        {status === 'existing' && existingCard && (
          <div className="vocab-query__result glass-1">
            <p className="vocab-query__result-title">
              已在词库中：<strong>{existingCard.word}</strong>（未重复调用 LLM）
            </p>
            <VocabDetail data={existingCard} word={existingCard.word} />
          </div>
        )}

        {status === 'preview' && content && (
          <div className="vocab-query__result glass-1">
            <p className="vocab-query__result-title">
              预览：<strong>{normalized}</strong>
            </p>
            <VocabDetail data={content} word={normalized} />
            <div className="vocab-query__actions">
              <Button variant="primary" loading={creating} onClick={() => { void handleCreate(); }}>
                加入单词本
              </Button>
              <Button
                variant="ghost"
                disabled={creating}
                onClick={() => { setStatus('idle'); setContent(null); }}
              >
                重新查询
              </Button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="vocab-query__error" role="alert">
            <p className="vocab-query__error-text">{errorMessage}</p>
            <div className="vocab-query__actions">
              {isNotConfigured ? (
                <Button variant="primary" onClick={onOpenLlmConfig}>
                  去配置 LLM
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    disabled={parsed.words.length === 0 || stashing}
                    onClick={handleSubmit}
                  >
                    重试
                  </Button>
                  {canStage && (
                    <Button
                      variant="glass"
                      loading={stashing}
                      disabled={!normalized}
                      onClick={() => { void handleStage(); }}
                    >
                      <BookmarkPlus size={16} strokeWidth={1.75} aria-hidden="true" />
                      暂存单词
                    </Button>
                  )}
                </>
              )}
            </div>
            {canStage && (
              <p className="vocab-query__stage-hint">
                也可先暂存该词（空词卡），LLM 恢复后在词库的「待补全」里补全内容。
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
