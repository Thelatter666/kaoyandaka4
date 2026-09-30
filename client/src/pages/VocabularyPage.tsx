/**
 * 单词本页（spec §4/§5/§6）——单页双视图：
 *
 * - 词库：三索引（乱序 / 顺序 / 掌握程度）+ 查询单词（LLM 浏览器直连）+ 卡片展开
 *   （完整详解、发音、手动调档 / 重置进度 / 删除）。
 * - 待补全：definitions 为空的暂存卡带「待补全」标记；「待补全 (N)」过滤模式下卡片带
 *   勾选框（默认全选），「补全选中（N）」由本页状态机串行逐卡 lookupWord → update({content})，
 *   逐卡展示 ✓/✗（失败含原因摘要），AbortController 支持中途取消，结束后汇总 Toast。
 * - 复习：`buildReviewQueue` 取今日队列（配额 5/10/20/30/全部，默认 10）→
 *   新词首学（正面即详解）→ 到期卡正面只露单词音标、翻面自评三键 →
 *   「不认识」追加队尾立刻重现（不占配额）→ 完成态计数。
 *   进度（队列 id 序列 / 下标 / 翻面相位 / 计数）写 sessionStorage，刷新回到同一张卡。
 *
 * 硬约束（C3 实测）：值导入只允许 `@shared/srs` 与 `@shared/constants`；
 * `normalizeWord` 走 `client/src/local/types`（zod-free 等价实现），
 * 词卡内容校验已内置在 `lookupWord` 内，本层不做任何 schema 校验。
 * 动效：翻面用 framer-motion rotateY，`useShouldReduceMotion()`（节能模式超集）下瞬时切换；
 * 全页无常驻（无限）动画。样式全部走 tokens，BEM `vocab-*`（见 VocabularyPage.css）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookMarked, Play, Search, Settings2 } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { showToast } from '../components/ui/Toast';
import {
  VocabCardItem,
  VocabDetail,
  isPendingVocabCard,
  type VocabCompletionState,
} from '../components/vocab/VocabCardItem';
import { VocabIndexSwitcher, type VocabIndexMode } from '../components/vocab/VocabIndexSwitcher';
import { VocabLlmConfigModal } from '../components/vocab/VocabLlmConfigModal';
import { VocabQueryModal } from '../components/vocab/VocabQueryModal';
import { VocabReviewCard } from '../components/vocab/VocabReviewCard';
import { VocabSpeakButton } from '../components/vocab/VocabSpeakButton';
import { vocabApi } from '../api/vocab';
import { loadLlmConfig, lookupWord } from '../utils/vocabLlm';
import { today } from '../utils/date';
import { buildReviewQueue } from '@shared/srs';
import type { ReviewGrade, VocabCard } from '@shared/types';
import './VocabularyPage.css';

type PageView = 'library' | 'review';
type QuotaChoice = 5 | 10 | 20 | 30 | 'all';

interface ReviewSession {
  queueIds: string[];
  index: number;
  phase: 'front' | 'back';
  /** 已首学张数 */
  learnedCount: number;
  /** 首次评分数（不含重现轮） */
  reviewedCount: number;
  /** 重现轮评分数 */
  relearnedCount: number;
  /** 供完成态展示的今日队列规模 */
  isNewTotal: number;
  dueTotal: number;
}

interface ReviewSummary {
  learned: number;
  reviewed: number;
  relearned: number;
}

/** 批量补全 run：串行逐卡执行，itemState/itemError 供卡片逐卡展示 ✓/✗ */
interface BatchRun {
  /** 本次运行的卡片 id 快照（补全成功后仍钉在过滤列表中，便于核对结果） */
  ids: string[];
  total: number;
  done: number;
  success: number;
  failed: number;
  itemState: Record<string, VocabCompletionState>;
  itemError: Record<string, string>;
  running: boolean;
  cancelled: boolean;
}

const SESSION_KEY = 'kaoyandaily-vocab-review';
const DEFAULT_QUOTA: QuotaChoice = 10;

const QUOTA_OPTIONS: Array<{ value: QuotaChoice; label: string }> = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 'all', label: '全部' },
];

/** 以 seed 为种子的确定性洗牌（同一版本内顺序稳定；换种子即重洗） */
function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = (seed + 1) * 1103515245 + 12345;
  const nextRandom = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type SessionPatch = Partial<
  Pick<ReviewSession, 'queueIds' | 'learnedCount' | 'reviewedCount' | 'relearnedCount'>
>;

/** 推进到下一张（相位复位为正面）；队列取尽返回 null，由调用方写完成态并清存档 */
function nextSession(session: ReviewSession, patch: SessionPatch): ReviewSession | null {
  const queueIds = patch.queueIds ?? session.queueIds;
  const index = session.index + 1;
  if (index >= queueIds.length) return null;
  return { ...session, ...patch, queueIds, index, phase: 'front' };
}

export function VocabularyPage() {
  const [view, setView] = useState<PageView>('library');
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [queryOpen, setQueryOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(() => loadLlmConfig() !== null);

  const [indexMode, setIndexMode] = useState<VocabIndexMode>('random');
  /** 乱序种子：每次进入词库视图 / 重选「乱序」自增，触发重洗 */
  const [shuffleVersion, setShuffleVersion] = useState(0);

  /* 待补全过滤 + 批量补全 */
  const [filterPending, setFilterPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<BatchRun | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  const [quota, setQuota] = useState<QuotaChoice>(DEFAULT_QUOTA);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const restoredRef = useRef(false);

  const todayStr = today();

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCards(await vocabApi.list());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载词库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCards(); }, [fetchCards]);

  /** 清理某卡的批量补全标记（补全完成 / 删除后不再展示「已取消 / 补全失败」旧状态） */
  const clearBatchMark = useCallback((id: string) => {
    setBatch((prev) => {
      if (!prev || !(id in prev.itemState)) return prev;
      return {
        ...prev,
        itemState: Object.fromEntries(
          Object.entries(prev.itemState).filter(([key]) => key !== id)
        ) as Record<string, VocabCompletionState>,
        itemError: Object.fromEntries(
          Object.entries(prev.itemError).filter(([key]) => key !== id)
        ),
      };
    });
  }, []);

  const upsertCard = useCallback(
    (card: VocabCard) => {
      setCards((prev) => {
        const exists = prev.some((item) => item.id === card.id);
        return exists ? prev.map((item) => (item.id === card.id ? card : item)) : [...prev, card];
      });
      if (!isPendingVocabCard(card)) clearBatchMark(card.id);
    },
    [clearBatchMark]
  );

  const removeCard = useCallback(
    (id: string) => {
      setCards((prev) => prev.filter((item) => item.id !== id));
      clearBatchMark(id);
    },
    [clearBatchMark]
  );

  /* ---- 复习 session：sessionStorage 恢复与持久化 ---- */

  /* 刷新恢复：等词库就绪后校验存档（队列里的卡必须都还在），找不到就丢弃 */
  useEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<ReviewSession>;
      const queueIds = Array.isArray(parsed.queueIds)
        ? parsed.queueIds.filter((id): id is string => typeof id === 'string')
        : [];
      const index = typeof parsed.index === 'number' ? parsed.index : 0;
      const total = queueIds.length;
      if (total === 0 || index >= total) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      if (!queueIds.every((id) => cards.some((card) => card.id === id))) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      setSession({
        queueIds,
        index,
        phase: parsed.phase === 'back' ? 'back' : 'front',
        learnedCount: Number(parsed.learnedCount) || 0,
        reviewedCount: Number(parsed.reviewedCount) || 0,
        relearnedCount: Number(parsed.relearnedCount) || 0,
        isNewTotal: Number(parsed.isNewTotal) || 0,
        dueTotal: Number(parsed.dueTotal) || 0,
      });
      setSummary(null);
      setView('review');
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [loading, cards]);

  /* 每次状态变更写存档（中途「退出复习」不清档，刷新可回到同一张卡） */
  useEffect(() => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [session]);

  const currentCard = useMemo(() => {
    if (!session) return null;
    return cards.find((card) => card.id === session.queueIds[session.index]) ?? null;
  }, [session, cards]);

  /* 存档里的卡被删除（或数据被清空）→ 丢弃存档回到空闲态 */
  useEffect(() => {
    if (session && !currentCard) {
      setSession(null);
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [session, currentCard]);

  const todayQueue = useMemo(() => buildReviewQueue(cards, todayStr, null), [cards, todayStr]);
  const dueTotalToday = todayQueue.newCards.length + todayQueue.dueCards.length;

  /* ---- 词库排序：乱序（种子重洗）/ 顺序（createdAt 升序）/ 掌握程度（档升序、同级字母序，毕业沉底） ---- */
  const orderedCards = useMemo(() => {
    if (indexMode === 'created') {
      return [...cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    if (indexMode === 'mastery') {
      return [...cards].sort(
        (a, b) => a.masteryLevel - b.masteryLevel || a.word.localeCompare(b.word)
      );
    }
    return shuffleWithSeed(cards, shuffleVersion + cards.length);
  }, [cards, indexMode, shuffleVersion]);

  const handleIndexChange = useCallback((mode: VocabIndexMode) => {
    /* 重选「乱序」也重洗（spec §5：每次进入重新洗牌） */
    if (mode === 'random') setShuffleVersion((prev) => prev + 1);
    setIndexMode(mode);
  }, []);

  /* ---- 待补全过滤与批量补全 ---- */

  const pendingCards = useMemo(() => cards.filter(isPendingVocabCard), [cards]);

  const selectedPendingCount = useMemo(
    () => pendingCards.reduce((count, card) => (selectedIds.has(card.id) ? count + 1 : count), 0),
    [pendingCards, selectedIds]
  );

  /* 过滤列表 = 待补全卡 + 本批次已处理的卡（补全成功后仍留在列表中展示 ✓ 与完整内容） */
  const visibleCards = useMemo(() => {
    if (!filterPending) return orderedCards;
    const pinned = new Set(batch?.ids ?? []);
    return orderedCards.filter((card) => isPendingVocabCard(card) || pinned.has(card.id));
  }, [filterPending, orderedCards, batch]);

  /* 勾选集合与待补全集合同步：剔除已补全 / 已删除的 id；
     过滤模式下新出现的待补全卡（如刚暂存）默认勾选，保证「补全选中」不落空 */
  const prevPendingIdsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(pendingCards.map((card) => card.id));
    const known = prevPendingIdsRef.current;
    prevPendingIdsRef.current = currentIds;
    setSelectedIds((prev) => {
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      }
      if (filterPending) {
        for (const id of currentIds) {
          if (!known.has(id) && !next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [pendingCards, filterPending]);

  /* 离开页面时中止在途的批量补全请求 */
  useEffect(() => () => batchAbortRef.current?.abort(), []);

  const handleFilterToggle = useCallback(() => {
    if (filterPending) {
      setFilterPending(false);
      setSelectedIds(new Set());
      setBatch(null);
      return;
    }
    /* 进入过滤：默认全选当前待补全卡 */
    setFilterPending(true);
    setSelectedIds(new Set(cards.filter(isPendingVocabCard).map((card) => card.id)));
  }, [filterPending, cards]);

  const handleSelectChange = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const cancelBatch = useCallback(() => {
    batchAbortRef.current?.abort();
  }, []);

  /** 批量补全：串行 for + AbortController（不引并发库），逐卡回写结果与失败原因 */
  const startBatch = useCallback(
    async (ids: string[]) => {
      const config = loadLlmConfig();
      if (!config) {
        setLlmOpen(true);
        return;
      }
      const idSet = new Set(ids);
      const queue = cards.filter((card) => idSet.has(card.id) && isPendingVocabCard(card));
      if (queue.length === 0) return;

      const controller = new AbortController();
      batchAbortRef.current = controller;
      setBatch({
        ids: queue.map((card) => card.id),
        total: queue.length,
        done: 0,
        success: 0,
        failed: 0,
        itemState: Object.fromEntries(
          queue.map((card) => [card.id, 'queued' as VocabCompletionState])
        ),
        itemError: {},
        running: true,
        cancelled: false,
      });

      let success = 0;
      let failed = 0;
      for (const card of queue) {
        if (controller.signal.aborted) break;
        setBatch((prev) => (prev ? { ...prev, itemState: { ...prev.itemState, [card.id]: 'running' } } : prev));
        try {
          const content = await lookupWord(config, card.word, controller.signal);
          const updated = await vocabApi.update(card.id, { content });
          upsertCard(updated);
          success += 1;
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  done: prev.done + 1,
                  success,
                  itemState: { ...prev.itemState, [card.id]: 'success' },
                }
              : prev
          );
        } catch (err) {
          if ((err as Error).name === 'AbortError') break;
          failed += 1;
          const message = err instanceof Error ? err.message : '补全失败';
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  done: prev.done + 1,
                  failed,
                  itemState: { ...prev.itemState, [card.id]: 'error' },
                  itemError: { ...prev.itemError, [card.id]: message },
                }
              : prev
          );
        }
      }

      batchAbortRef.current = null;
      const cancelled = controller.signal.aborted;
      if (cancelled) {
        /* 取消：在途与未处理的卡标记「已取消」，不残留「补全中/排队中」 */
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                running: false,
                cancelled: true,
                itemState: Object.fromEntries(
                  Object.entries(prev.itemState).map(([id, state]) =>
                    state === 'queued' || state === 'running'
                      ? [id, 'cancelled' as VocabCompletionState]
                      : [id, state]
                  )
                ),
              }
            : prev
        );
      } else {
        setBatch((prev) => (prev ? { ...prev, running: false, cancelled: false } : prev));
      }
      if (cancelled) {
        showToast('info', `已取消补全：成功 ${success} · 失败 ${failed}`);
      } else if (failed > 0) {
        showToast('error', `补全完成：成功 ${success} · 失败 ${failed}`);
      } else {
        showToast('success', `补全完成：成功 ${success} · 失败 ${failed}`);
      }
    },
    [cards, upsertCard]
  );

  /* ---- 复习流程 ---- */

  const finishSession = useCallback((next: ReviewSummary) => {
    setSummary(next);
    setSession(null);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const startReview = useCallback(() => {
    const queue = buildReviewQueue(cards, todayStr, quota === 'all' ? null : quota);
    const queueIds = [...queue.newCards, ...queue.dueCards].map((card) => card.id);
    if (queueIds.length === 0) return;
    setSummary(null);
    setSession({
      queueIds,
      index: 0,
      phase: 'front',
      learnedCount: 0,
      reviewedCount: 0,
      relearnedCount: 0,
      isNewTotal: queue.newCards.length,
      dueTotal: queue.dueCards.length,
    });
    setView('review');
  }, [cards, todayStr, quota]);

  const handleLearn = async () => {
    if (!session || !currentCard) return;
    setBusy(true);
    try {
      const updated = await vocabApi.learn(currentCard.id);
      upsertCard(updated);
      const learnedCount = session.learnedCount + 1;
      const next = nextSession(session, { learnedCount });
      if (next) {
        setSession(next);
      } else {
        finishSession({
          learned: learnedCount,
          reviewed: session.reviewedCount,
          relearned: session.relearnedCount,
        });
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '首学记录失败');
    } finally {
      setBusy(false);
    }
  };

  const handleFlip = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, phase: 'back' } : prev));
  }, []);

  const handleGrade = async (grade: ReviewGrade) => {
    if (!session || !currentCard) return;
    const card = currentCard;
    /* 本轮已出现过（队尾重现）：该 id 在队列中位于当前下标之前 */
    const isRelearn = session.queueIds.indexOf(card.id) < session.index;
    setBusy(true);
    try {
      const updated = await vocabApi.review(card.id, grade);
      upsertCard(updated);
      const queueIds = grade === 'unknown' ? [...session.queueIds, card.id] : session.queueIds;
      const reviewedCount = session.reviewedCount + (isRelearn ? 0 : 1);
      const relearnedCount = session.relearnedCount + (isRelearn ? 1 : 0);
      const next = nextSession(session, { queueIds, reviewedCount, relearnedCount });
      if (next) {
        setSession(next);
      } else {
        finishSession({ learned: session.learnedCount, reviewed: reviewedCount, relearned: relearnedCount });
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '评分失败');
    } finally {
      setBusy(false);
    }
  };

  /* ---- 视图 ---- */

  const renderLibraryView = () => {
    if (loading) return <LoadingState message="加载词库中..." />;
    if (loadError) return <ErrorState message={loadError} onRetry={() => { void fetchCards(); }} />;

    return (
      <>
        <div className="vocab-toolbar">
          <Button variant="primary" onClick={() => setQueryOpen(true)}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            查询单词
          </Button>
          {cards.length > 0 && (
            <>
              <VocabIndexSwitcher value={indexMode} onChange={handleIndexChange} />
              <button
                type="button"
                className={
                  filterPending
                    ? 'vocab-pending glass-1 vocab-pending--active'
                    : 'vocab-pending glass-1'
                }
                aria-pressed={filterPending}
                disabled={batch?.running || (!filterPending && pendingCards.length === 0)}
                title={
                  pendingCards.length > 0
                    ? `只看待补全词卡（${pendingCards.length}）`
                    : '没有待补全的词卡'
                }
                onClick={handleFilterToggle}
              >
                待补全 ({pendingCards.length})
              </button>
              {filterPending &&
                (batch?.running ? (
                  <div className="vocab-batch">
                    <span className="vocab-batch__progress tabular-nums" role="status">
                      补全中 {batch.done}/{batch.total}
                    </span>
                    <Button size="sm" variant="ghost" onClick={cancelBatch}>
                      取消补全
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={selectedPendingCount === 0}
                    onClick={() => { void startBatch([...selectedIds]); }}
                  >
                    补全选中（{selectedPendingCount}）
                  </Button>
                ))}
              <span className="vocab-toolbar__count tabular-nums">{cards.length} 词</span>
            </>
          )}
        </div>

        {cards.length === 0 ? (
          <EmptyState
            icon={<BookMarked size={40} strokeWidth={1.75} />}
            title="词库还是空的"
            description="查一个单词开始吧"
            actionLabel="查询单词"
            onAction={() => setQueryOpen(true)}
          />
        ) : filterPending && visibleCards.length === 0 ? (
          <p className="vocab-batch__empty">没有待补全的词卡。</p>
        ) : (
          <div className="vocab-list">
            {visibleCards.map((card) => (
              <VocabCardItem
                key={card.id}
                card={card}
                onUpdated={upsertCard}
                onDeleted={removeCard}
                onOpenLlmConfig={() => setLlmOpen(true)}
                selectable={filterPending}
                selected={selectedIds.has(card.id)}
                onSelectedChange={handleSelectChange}
                completionState={batch?.itemState[card.id] ?? null}
                completionMessage={batch?.itemError[card.id]}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  const renderCompletion = () => (
    <div className="vocab-review__panel glass-1">
      <p className="vocab-review__panel-title">本轮复习完成</p>
      <p className="vocab-review__panel-count tabular-nums">
        今日新学 {summary?.learned ?? 0} · 复习 {summary?.reviewed ?? 0} · 重练{' '}
        {summary?.relearned ?? 0}
      </p>
      <div className="vocab-review__panel-actions">
        <Button
          variant="primary"
          onClick={() => {
            setSummary(null);
            setView('library');
          }}
        >
          返回词库
        </Button>
        {dueTotalToday > 0 && (
          <Button
            variant="glass"
            onClick={() => {
              setSummary(null);
              startReview();
            }}
          >
            再来一轮
          </Button>
        )}
      </div>
    </div>
  );

  const renderIdle = () => (
    <div className="vocab-review__panel glass-1">
      <p className="vocab-review__panel-title">今日复习</p>
      <p className="vocab-review__panel-count tabular-nums">
        {todayQueue.newCards.length} 新词 · {todayQueue.dueCards.length} 到期
      </p>

      <div className="vocab-quota">
        <span className="vocab-quota__label">今日配额</span>
        <div className="vocab-quota__group" role="group" aria-label="今日配额">
          {QUOTA_OPTIONS.map((option) => {
            const isActive = option.value === quota;
            return (
              <button
                key={String(option.value)}
                type="button"
                className={isActive ? 'vocab-quota__btn vocab-quota__btn--active' : 'vocab-quota__btn'}
                aria-pressed={isActive}
                onClick={() => setQuota(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="vocab-review__panel-actions">
        <Button variant="primary" disabled={dueTotalToday === 0} onClick={startReview}>
          <Play size={16} strokeWidth={1.75} aria-hidden="true" />
          开始复习
        </Button>
      </div>

      {dueTotalToday === 0 && (
        <p className="vocab-review__done">
          今日已完成：没有待学新词，也没有到期单词。到期安排由掌握档决定，明天再来。
        </p>
      )}
    </div>
  );

  const renderActiveSession = () => {
    if (!currentCard || !session) return <LoadingState message="正在恢复复习进度..." />;
    const isNewCard = currentCard.firstLearnedAt === null;

    return (
      <div className="vocab-review">
        <div className="vocab-review__bar">
          <div className="vocab-review__progress">
            <ProgressBar
              value={session.index}
              max={session.queueIds.length}
              size="sm"
              label={`已完成 ${session.index} / ${session.queueIds.length}`}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSession(null)}>
            退出复习
          </Button>
        </div>

        <p className="vocab-review__stats tabular-nums">
          新学 {session.learnedCount} · 复习 {session.reviewedCount} · 重练{' '}
          {session.relearnedCount}
        </p>

        {isNewCard ? (
          /* 新词首学：正面即完整详解（不遮答案），「知道了」只置 firstLearnedAt */
          <div className="vocab-first glass-1">
            <div className="vocab-first__head">
              <span className="vocab-flip__word">{currentCard.word}</span>
              <VocabSpeakButton word={currentCard.word} size={18} />
            </div>
            <span className="vocab-first__badge">新词首学</span>
            <VocabDetail data={currentCard} />
            <div className="vocab-review__panel-actions">
              <Button variant="primary" loading={busy} onClick={() => { void handleLearn(); }}>
                知道了
              </Button>
            </div>
          </div>
        ) : (
          <VocabReviewCard
            card={currentCard}
            phase={session.phase}
            busy={busy}
            onFlip={handleFlip}
            onGrade={(grade) => { void handleGrade(grade); }}
          />
        )}
      </div>
    );
  };

  const renderReviewView = () => {
    if (loading) return <LoadingState message="加载词库中..." />;
    if (loadError) return <ErrorState message={loadError} onRetry={() => { void fetchCards(); }} />;
    if (summary) return renderCompletion();
    if (!session) return renderIdle();
    return renderActiveSession();
  };

  return (
    <PageShell
      title="单词本"
      subtitle="LLM 查词生成考研向词卡，按掌握程度安排每日复习"
      actions={
        <button
          type="button"
          className="vocab-settings glass-1"
          onClick={() => setLlmOpen(true)}
          aria-label={llmConfigured ? 'LLM 配置（已配置）' : 'LLM 配置（未配置）'}
          title="LLM 配置"
        >
          <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
          {llmConfigured ? 'LLM 已配置' : 'LLM 未配置'}
          <span
            className={llmConfigured ? 'vocab-settings__dot vocab-settings__dot--on' : 'vocab-settings__dot'}
            aria-hidden="true"
          />
        </button>
      }
    >
      <div className="vocab-page">
        <div className="vocab-tabs" role="tablist" aria-label="单词本视图">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'library'}
            className={view === 'library' ? 'vocab-tabs__tab vocab-tabs__tab--active' : 'vocab-tabs__tab'}
            onClick={() => {
              setView('library');
              /* 每次进入词库视图：乱序重新洗牌（spec §5） */
              setShuffleVersion((prev) => prev + 1);
            }}
          >
            词库
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'review'}
            className={view === 'review' ? 'vocab-tabs__tab vocab-tabs__tab--active' : 'vocab-tabs__tab'}
            onClick={() => setView('review')}
          >
            复习
          </button>
        </div>

        <div className="vocab-view" role="tabpanel">
          {view === 'library' ? renderLibraryView() : renderReviewView()}
        </div>
      </div>

      <VocabQueryModal
        isOpen={queryOpen}
        onClose={() => setQueryOpen(false)}
        cards={cards}
        onCreated={upsertCard}
        onOpenLlmConfig={() => {
          setQueryOpen(false);
          setLlmOpen(true);
        }}
      />

      <VocabLlmConfigModal
        isOpen={llmOpen}
        onClose={() => setLlmOpen(false)}
        onSaved={() => setLlmConfigured(true)}
      />
    </PageShell>
  );
}
