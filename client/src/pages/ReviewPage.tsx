import React, { useState, useEffect, useCallback } from 'react';
import { NotebookPen, RefreshCw, Check, AlertCircle, CalendarDays, BookOpen, Lock } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Calendar } from '../components/ui/Calendar';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { showToast } from '../components/ui/Toast';
import { reviewsApi, Review } from '../api/reviews';
import { useReviewLock } from '../components/review/ReviewLockContext';
import { today, formatDate, formatDateDisplay } from '../utils/date';
import './ReviewPage.css';

/**
 * 复盘页（设计文档 2026-08-10）：单页双栏
 * - 左栏：有复盘记录的日期倒序列表 + 日期选择器（可补写无复盘的日子）
 * - 右栏：所选日期的复盘详情，可编辑/保存（复用 upsert，最后写赢）
 * - 未保存修改切换日期 → ConfirmDialog 确认，防丢字
 * - 解锁态页头提供「上锁」（由 ReviewGate 经 context 下发）：就近重新锁上，不必退出系统
 */
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatListDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${DAY_NAMES[d.getDay()]}`;
}

export function ReviewPage() {
  const [history, setHistory] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** 未保存确认中的待切换日期（null = 无待确认） */
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  /** 有未保存修改时的待上锁确认 */
  const [pendingLock, setPendingLock] = useState(false);

  /** 上锁入口由复盘门禁下发；不在门禁内（未设锁/未解锁）时为 null，不渲染按钮 */
  const lock = useReviewLock();

  const dirty = content !== savedContent;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await reviewsApi.getHistory();
      setHistory(list);
      if (list.length > 0) {
        const latest = list[0].reviewDate;
        setSelectedDate(latest);
        setContent(list[0].content);
        setSavedContent(list[0].content);
      } else {
        setSelectedDate(today());
        setContent('');
        setSavedContent('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载复盘失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const applyDate = useCallback((date: string) => {
    setSelectedDate(date);
    const review = history.find((r) => r.reviewDate === date);
    setContent(review?.content ?? '');
    setSavedContent(review?.content ?? '');
    setSaving('idle');
  }, [history]);

  const handleSelectDate = (date: string) => {
    if (date === selectedDate) return;
    if (dirty) {
      setPendingDate(date);
      return;
    }
    applyDate(date);
  };

  const handleConfirmSwitch = () => {
    if (pendingDate) applyDate(pendingDate);
    setPendingDate(null);
  };

  /** 上锁会卸载本页（门禁切回验证态），未保存的修改随之丢失——先确认再锁 */
  const handleLockClick = () => {
    if (!lock) return;
    if (dirty) {
      setPendingLock(true);
      return;
    }
    lock();
  };

  const handleConfirmLock = () => {
    setPendingLock(false);
    lock?.();
  };

  const handleSave = async () => {
    // 服务器 UpsertReviewSchema 要求内容非空；本地模式不经 Zod 校验，故在此统一拦截，
    // 否则同一操作服务器报「保存失败」而本地能存进一条空白复盘（口径不一）
    if (content.length === 0) {
      showToast('error', '复盘内容不能为空');
      return;
    }
    setSaving('saving');
    try {
      await reviewsApi.upsert({ date: selectedDate, content });
      setSavedContent(content);
      setSaving('saved');
      showToast('success', '复盘已保存');
      // 更新列表缓存：新增或更新对应日期的摘要
      setHistory((prev) => {
        const exists = prev.some((r) => r.reviewDate === selectedDate);
        const updated: Review = {
          id: prev.find((r) => r.reviewDate === selectedDate)?.id ?? '',
          reviewDate: selectedDate,
          content,
          createdAt: prev.find((r) => r.reviewDate === selectedDate)?.createdAt ?? '',
          updatedAt: new Date().toISOString(),
        };
        return exists
          ? prev.map((r) => (r.reviewDate === selectedDate ? updated : r))
          : [updated, ...prev].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
      });
      setTimeout(() => setSaving('idle'), 2000);
    } catch {
      setSaving('error');
      showToast('error', '保存失败，请重试');
    }
  };

  return (
    <PageShell
      title="复盘"
      subtitle="回顾每一段学习的痕迹"
      actions={
        lock ? (
          <Button
            variant="glass"
            size="sm"
            onClick={handleLockClick}
            title="立即上锁，下次进入需重新输入复盘锁密码"
          >
            <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
            上锁
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <LoadingState message="加载复盘记录中..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchHistory} />
      ) : (
        <div className="review-grid">
          {/* 左栏：日期列表 + 日期选择器 */}
          <aside className="review-list-wrap reveal" style={{ '--i': 0 } as React.CSSProperties} aria-label="复盘日期列表">
            <Card>
              <h2 className="review-list__title">
                <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
                日期
              </h2>
              <Calendar
                className="review-calendar"
                mode="single"
                selected={new Date(selectedDate + 'T00:00:00')}
                onSelect={(d) => {
                  if (d) handleSelectDate(formatDate(d));
                }}
              />
              {history.length === 0 ? (
                <EmptyState
                  icon={<BookOpen size={36} strokeWidth={1.75} />}
                  title="还没有复盘"
                  description="在日历中选择日期，写下第一篇复盘吧"
                />
              ) : (
                <ul className="review-list">
                  {history.map((r) => (
                    <li key={r.reviewDate}>
                      <button
                        type="button"
                        className={`review-list__item${r.reviewDate === selectedDate ? ' review-list__item--active' : ''}`}
                        onClick={() => handleSelectDate(r.reviewDate)}
                        aria-pressed={r.reviewDate === selectedDate}
                      >
                        <span className="review-list__date">{formatListDate(r.reviewDate)}</span>
                        <span className="review-list__summary truncate">
                          {r.content.split('\n')[0] || '（空白）'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>

          {/* 右栏：详情编辑 */}
          <section className="review-detail-wrap reveal" style={{ '--i': 1 } as React.CSSProperties} aria-label="复盘详情">
            <Card key={selectedDate}>
              <h2 className="review-detail__title">
                <NotebookPen size={18} strokeWidth={1.75} aria-hidden="true" />
                每日复盘
              </h2>
              <p className="review-detail__date">{formatDateDisplay(selectedDate)}</p>
              <textarea
                className="review-detail__textarea"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (saving === 'saved') setSaving('idle');
                }}
                placeholder="记录学习心得、遇到的困难、明天的计划..."
                aria-label="复盘内容"
                rows={14}
              />
              <div className="review-detail__footer">
                <span className="review-detail__status-wrap" aria-live="polite">
                  {dirty && saving !== 'saving' && (
                    <span className="review-detail__status">有未保存的修改</span>
                  )}
                  {saving === 'saving' && (
                    <span className="review-detail__status">
                      <RefreshCw size={14} strokeWidth={1.75} className="review-spin" aria-hidden="true" />
                      保存中...
                    </span>
                  )}
                  {saving === 'saved' && (
                    <span className="review-detail__status review-detail__status--saved">
                      <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                      已保存
                    </span>
                  )}
                  {saving === 'error' && (
                    <span className="review-detail__status review-detail__status--error">
                      <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                      保存失败，点击重试
                    </span>
                  )}
                </span>
                <Button variant="primary" size="sm" onClick={handleSave} loading={saving === 'saving'}>
                  保存复盘
                </Button>
              </div>
            </Card>
          </section>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDate !== null}
        onClose={() => setPendingDate(null)}
        onConfirm={handleConfirmSwitch}
        title="有未保存的修改"
        message="当前复盘内容尚未保存，切换日期将丢失这些修改。确定切换吗？"
        confirmLabel="放弃修改，切换"
        cancelLabel="留在当前日期"
        destructive={false}
      />

      <ConfirmDialog
        isOpen={pendingLock}
        onClose={() => setPendingLock(false)}
        onConfirm={handleConfirmLock}
        title="有未保存的修改"
        message="当前复盘内容尚未保存，上锁后这些修改会丢失。确定上锁吗？"
        confirmLabel="放弃修改，上锁"
        cancelLabel="留在当前页面"
        destructive={false}
      />
    </PageShell>
  );
}
