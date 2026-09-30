/**
 * 查询单词弹窗（spec §3.4）：
 * 归一 → 先查页面已加载的词库（命中即展示已有卡 + Toast，不重复调 LLM）
 * → 未配置 LLM 则引导打开配置弹窗 → 调 LLM 出预览（结构化渲染）→「加入单词本」。
 *
 * 错误：LlmError 各 kind 的文案已含在 message 中（C3 定稿），本层只按 kind 追加
 * CORS 的「换服务商」提示；弹窗内联展示 + Toast + 重试按钮；提交时传 AbortSignal，
 * 弹窗关闭即 abort 在途请求。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { ApiError } from '../../api/client';
import { vocabApi } from '../../api/vocab';
import { normalizeWord } from '../../local/types';
import { LlmError, loadLlmConfig, lookupWord, type LlmErrorKind } from '../../utils/vocabLlm';
import { VocabDetail } from './VocabCardItem';
import type { VocabCard, VocabContent } from '@shared/types';

type QueryStatus = 'idle' | 'loading' | 'preview' | 'existing' | 'error';

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
  const abortRef = useRef<AbortController | null>(null);

  const normalized = normalizeWord(word);
  const isNotConfigured = errorKind === 'not_configured';

  /* 关闭（含 Modal 240ms 退场窗口）后中止在途请求并清态：下次打开不残留上次结果 */
  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setWord('');
    setStatus('idle');
    setContent(null);
    setExistingCard(null);
    setErrorMessage('');
    setErrorKind(null);
    setCreating(false);
  }, [isOpen]);

  const runLookup = async (raw: string) => {
    const target = normalizeWord(raw);
    if (!target) return;

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
            void runLookup(word);
          }}
        >
          <input
            className="vocab-field vocab-query__input"
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="输入单词或短语"
            maxLength={100}
            aria-label="要查询的单词或短语"
            autoFocus
          />
          <Button type="submit" variant="primary" loading={status === 'loading'} disabled={!normalized}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            查询
          </Button>
        </form>

        {status === 'idle' && (
          <p className="vocab-query__hint">
            输入单词后由 LLM 生成考研向词卡（音标 / 释义 / 例句 / 词根辨析）。
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
                <Button variant="primary" disabled={!normalized} onClick={() => { void runLookup(word); }}>
                  重试
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
