/**
 * 计划页（设计文档 8.2 / v2 12.4）
 *
 * v2 Bento 构图：任务区 span 8 主列（本页主角）+ 复盘卡 span 4 sticky
 * 侧栏（仅 ≥1024px 生效，窄屏自动转上下堆叠）；页签 / 新建任务条 /
 * 任务区块 / 复盘卡 .reveal 依次入场（≤8 个，任务列表内大量任务项不做
 * stagger）；CTA 按压回弹 --ease-spring。
 * 「今天/明天」玻璃分段控件（滑块指示器 240ms）；新建任务玻璃输入条
 * （聚焦描边主色辉光）；任务行卡 TaskItem（glass-1，完成/重要/拖拽/键盘
 * 排序语义不变）；复盘 glass-1 卡（保存状态 RefreshCw 转动 / Check / 重试）。
 * 任务 CRUD、排序、顺延、复盘保存与切换日期逻辑全部保持现状。
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Pin,
  Pencil,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { Dropdown } from '../components/ui/Dropdown';
import { TaskItem, TaskData } from '../components/tasks/TaskItem';
import { showToast } from '../components/ui/Toast';
import { tasksApi, Task } from '../api/tasks';
import { reviewsApi } from '../api/reviews';
import { today, tomorrow, formatDate, formatDateDisplay } from '../utils/date';
import type { Subject, SubSubject } from '@shared/types';
import './PlanPage.css';

type TabDate = 'today' | 'tomorrow';

const TAB_ORDER: TabDate[] = ['today', 'tomorrow'];

const SUB_SUBJECT_OPTIONS: { value: SubSubject; label: string }[] = [
  { value: 'data_structure', label: '数据结构' },
  { value: 'computer_organization', label: '计算机组成' },
  { value: 'operating_system', label: '操作系统' },
  { value: 'computer_network', label: '计算机网络' },
];

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // 复用本地时区的 formatDate：toISOString() 是 UTC，东八区 0-8 点会得到错误日期
  return formatDate(d);
}

export function PlanPage() {
  const [activeTab, setActiveTab] = useState<TabDate>('today');
  const dateStr = activeTab === 'today' ? today() : tomorrow();

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Review
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSaving, setReviewSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Add task form
  const [newContent, setNewContent] = useState('');
  const [newSubject, setNewSubject] = useState<Subject>('math');
  const [newSubSubject, setNewSubSubject] = useState<SubSubject | null>(null);
  const [newImportant, setNewImportant] = useState(false);
  const [adding, setAdding] = useState(false);

  // Unfinished tasks
  const [unfinishedTasks, setUnfinishedTasks] = useState<Task[]>([]);
  const [showUnfinished, setShowUnfinished] = useState(false);
  const [unfinishedProcessed, setUnfinishedProcessed] = useState(false);

  const fetchTasks = useCallback(async (opts?: { silent?: boolean }) => {
    // silent：不切 loading 态（列表保持挂载，节点复用，避免勾选后整表重挂载
    // 重播入场动画、以及 TaskItem 庆祝动画的 JS 驱动被重挂载打断）
    if (!opts?.silent) {
      setTasksLoading(true);
      setTasksError(null);
    }
    try {
      setTasks(await tasksApi.getByDate(dateStr));
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      if (!opts?.silent) setTasksLoading(false);
    }
  }, [dateStr]);

  const fetchReview = useCallback(async () => {
    try {
      const r = await reviewsApi.getByDate(dateStr);
      setReviewContent(r?.content || '');
    } catch {
      // ignore
    }
  }, [dateStr]);

  useEffect(() => {
    fetchTasks();
    fetchReview();
  }, [fetchTasks, fetchReview]);

  // Check for unfinished tasks from yesterday
  useEffect(() => {
    if (activeTab === 'today' && !unfinishedProcessed) {
      const yesterdayKey = `unfinished-done-${today()}`;
      if (localStorage.getItem(yesterdayKey)) return;

      tasksApi.getUnfinished(getYesterday()).then((items) => {
        if (items.length > 0) {
          setUnfinishedTasks(items);
          setShowUnfinished(true);
        }
      }).catch(() => {});
      setUnfinishedProcessed(true);
    }
  }, [activeTab, unfinishedProcessed]);

  const handleAddTask = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await tasksApi.create({
        date: dateStr,
        content: newContent.trim(),
        subject: newSubject,
        subSubject: newSubject === '408' ? (newSubSubject || undefined) : undefined,
        isImportant: newImportant,
      });
      setNewContent('');
      setNewImportant(false);
      showToast('success', '任务已添加');
      fetchTasks();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await tasksApi.toggle(id);
      // 静默刷新：勾选后列表不卸载重挂（否则庆祝动画 JS 驱动失效 + 全表重播入场）
      fetchTasks({ silent: true });
    } catch {
      showToast('error', '操作失败');
    }
  };

  const handlePin = async (id: string) => {
    try {
      await tasksApi.pin(id);
      fetchTasks();
    } catch {
      showToast('error', '操作失败');
    }
  };

  const handleEdit = async (id: string, content: string) => {
    try {
      await tasksApi.update(id, { content });
      fetchTasks();
    } catch {
      showToast('error', '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tasksApi.delete(id);
      showToast('success', '任务已删除');
      fetchTasks();
    } catch {
      showToast('error', '删除失败');
    }
  };

  const handleSaveReview = async () => {
    setReviewSaving('saving');
    try {
      await reviewsApi.upsert({ date: dateStr, content: reviewContent });
      setReviewSaving('saved');
      setTimeout(() => setReviewSaving('idle'), 2000);
    } catch {
      setReviewSaving('error');
    }
  };

  // Unfinished task actions
  const handleCarryOver = async (task: Task) => {
    try {
      await tasksApi.create({
        date: today(),
        content: task.content,
        subject: task.subject as Subject,
        subSubject: task.subSubject as SubSubject | undefined,
        isImportant: task.isImportant,
      });
      setUnfinishedTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      showToast('error', '顺延失败');
    }
  };

  const handleUnfinishedComplete = async (task: Task) => {
    try {
      await tasksApi.toggle(task.id);
      setUnfinishedTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      showToast('error', '操作失败');
    }
  };

  const handleUnfinishedDismiss = (task: Task) => {
    setUnfinishedTasks((prev) => prev.filter((t) => t.id !== task.id));
  };

  const handleCloseUnfinished = () => {
    setShowUnfinished(false);
    localStorage.setItem(`unfinished-done-${today()}`, 'true');
  };

  const importantTasks = tasks.filter((t) => t.isImportant);
  const normalTasks = tasks.filter((t) => !t.isImportant);

  return (
    <PageShell>
      {/* 标题区：宋体 30px + 引导文案 */}
      <header className="plan-header">
        <h2 className="plan-title">
          <ClipboardList size={26} strokeWidth={1.75} aria-hidden="true" />
          每日计划与复盘
        </h2>
        <p className="plan-subtitle">安排今天与明天的任务，睡前写一段复盘</p>
      </header>

      {/* 今天/明天：玻璃分段控件（滑块指示器 240ms 滑动） */}
      <div
        className="segmented glass-1 plan-tabs reveal"
        role="group"
        aria-label="选择计划日期"
        style={{ '--_segments': 2, '--i': 0 } as React.CSSProperties}
      >
        <span
          className="segmented__indicator"
          style={{ transform: `translateX(${TAB_ORDER.indexOf(activeTab) * 100}%)` }}
          aria-hidden="true"
        />
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`segmented__item${activeTab === tab ? ' segmented__item--active' : ''}`}
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'today' ? '今天' : '明天'}{' '}
            {formatDateDisplay(tab === 'today' ? today() : tomorrow()).split(' ')[1] || ''}
          </button>
        ))}
      </div>

      <div className="bento-grid plan-grid">
        {/* 任务区（span 8 主列，本页主角） */}
        <section className="bento-span-8 plan-grid__tasks" aria-label="任务列表">
          {/* 新建任务：玻璃输入条，聚焦时描边主色辉光 */}
          <div
            className="plan-add glass-1 reveal"
            style={{ '--i': 1 } as React.CSSProperties}
          >
            <input
              type="text"
              className="plan-add__input"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="任务内容..."
              aria-label="新任务内容"
              maxLength={500}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
            />
            <div className="plan-add__controls">
              <Dropdown
                value={newSubject}
                onChange={(v) => { setNewSubject(v as Subject); setNewSubSubject(null); }}
                options={[
                  { value: 'math', label: '数学' },
                  { value: 'english', label: '英语' },
                  { value: '408', label: '408' },
                ]}
                ariaLabel="科目"
              />
              {newSubject === '408' && (
                <Dropdown
                  value={newSubSubject ?? ''}
                  onChange={(v) => setNewSubSubject((v || null) as SubSubject | null)}
                  options={[
                    { value: '', label: '不限' },
                    ...SUB_SUBJECT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                  ]}
                  ariaLabel="子科目"
                />
              )}
              <label className={`plan-add__important${newImportant ? ' plan-add__important--active' : ''}`}>
                <input type="checkbox" checked={newImportant} onChange={(e) => setNewImportant(e.target.checked)} />
                <Pin size={14} strokeWidth={1.75} fill={newImportant ? 'currentColor' : 'none'} aria-hidden="true" />
                重要
              </label>
              <Button variant="primary" size="sm" onClick={handleAddTask} loading={adding}>
                添加
              </Button>
            </div>
          </div>

          {/* 任务列表（区块入场 reveal；列表内大量任务项不做 stagger） */}
          <div className="reveal" style={{ '--i': 2 } as React.CSSProperties}>
            {tasksLoading ? (
              <LoadingState message="加载任务中..." />
            ) : tasksError ? (
              <ErrorState message={tasksError} onRetry={fetchTasks} />
            ) : tasks.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<ClipboardList size={40} strokeWidth={1.75} />}
                  title="暂无任务"
                  description="在上方输入条添加第一个任务吧"
                />
              </Card>
            ) : (
              <div className="plan-task-groups">
                {/* 重要任务 */}
                {importantTasks.length > 0 && (
                  <section aria-label={`重要任务 ${importantTasks.length} 项`}>
                    <h3 className="plan-group-title">
                      <Pin size={14} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
                      重要 <span className="tabular-nums">({importantTasks.length})</span>
                    </h3>
                    <div className="plan-task-list">
                      {importantTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task as TaskData}
                          onToggle={handleToggle}
                          onPin={handlePin}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* 普通任务 */}
                {normalTasks.length > 0 && (
                  <section aria-label={`普通任务 ${normalTasks.length} 项`}>
                    <h3 className="plan-group-title">
                      普通 <span className="tabular-nums">({normalTasks.length})</span>
                    </h3>
                    <div className="plan-task-list">
                      {normalTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task as TaskData}
                          onToggle={handleToggle}
                          onPin={handlePin}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 复盘区（span 4 sticky 侧栏，仅 ≥1024px 生效）：glass-1 卡 + 保存状态图标 + 文字 */}
        <section
          className="bento-span-4 plan-grid__review reveal"
          style={{ '--i': 3 } as React.CSSProperties}
          aria-label="每日复盘"
        >
          <Card>
            <h3 className="plan-review__title">
              <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
              每日复盘
            </h3>
            <p className="plan-review__date">{formatDateDisplay(dateStr)}</p>
            <textarea
              className="plan-review__textarea"
              value={reviewContent}
              onChange={(e) => {
                setReviewContent(e.target.value);
                if (reviewSaving === 'saved') setReviewSaving('idle');
              }}
              placeholder="记录今天的学习心得、遇到的困难、明天的计划..."
              aria-label="每日复盘内容"
              rows={8}
            />
            <div className="plan-review__footer">
              <span className="plan-review__status-wrap" aria-live="polite">
                {reviewSaving === 'saving' && (
                  <span className="plan-review__status">
                    <RefreshCw size={14} strokeWidth={1.75} className="plan-spin" aria-hidden="true" />
                    保存中...
                  </span>
                )}
                {reviewSaving === 'saved' && (
                  <span className="plan-review__status plan-review__status--saved">
                    <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                    已保存
                  </span>
                )}
                {reviewSaving === 'error' && (
                  <span className="plan-review__status plan-review__status--error">
                    <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                    保存失败，点击重试
                  </span>
                )}
              </span>
              <Button variant="primary" size="sm" onClick={handleSaveReview} loading={reviewSaving === 'saving'}>
                保存复盘
              </Button>
            </div>
          </Card>
        </section>
      </div>

      {/* 次日处理弹窗（沿用 Modal 新材质） */}
      <Modal
        isOpen={showUnfinished && unfinishedTasks.length > 0}
        onClose={handleCloseUnfinished}
        title="昨天有未完成的任务"
        size="md"
      >
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)', fontSize: 'var(--text-sm)' }}>
          以下任务来自昨天，请选择处理方式：
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {unfinishedTasks.map((task) => (
            <div key={task.id} className="plan-unfinished glass-1">
              <div className="plan-unfinished__info">
                <p className="plan-unfinished__content">{task.content}</p>
                <SubjectBadge subject={task.subject as Subject} subSubject={task.subSubject as SubSubject | null} />
              </div>
              <div className="plan-unfinished__actions">
                <Button variant="primary" size="sm" onClick={() => handleCarryOver(task)}>顺延</Button>
                <Button variant="glass" size="sm" onClick={() => handleUnfinishedComplete(task)}>标记完成</Button>
                <Button variant="ghost" size="sm" onClick={() => handleUnfinishedDismiss(task)}>放弃</Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </PageShell>
  );
}
