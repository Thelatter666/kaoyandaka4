import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { TaskItem, TaskData } from '../components/tasks/TaskItem';
import { showToast } from '../components/ui/Toast';
import { tasksApi, Task } from '../api/tasks';
import { reviewsApi, Review } from '../api/reviews';
import { today, tomorrow, formatDateDisplay } from '../utils/date';
import type { Subject, SubSubject } from '@shared/types';
import { SubjectEnum } from '@shared/schemas/common';

type TabDate = 'today' | 'tomorrow';

const SUB_SUBJECT_OPTIONS: { value: SubSubject; label: string }[] = [
  { value: 'data_structure', label: '数据结构' },
  { value: 'computer_organization', label: '计算机组成' },
  { value: 'operating_system', label: '操作系统' },
  { value: 'computer_network', label: '计算机网络' },
];

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function PlanPage() {
  const [activeTab, setActiveTab] = useState<TabDate>('today');
  const dateStr = activeTab === 'today' ? today() : tomorrow();

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Review
  const [review, setReview] = useState<Review | null>(null);
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

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      setTasks(await tasksApi.getByDate(dateStr));
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      setTasksLoading(false);
    }
  }, [dateStr]);

  const fetchReview = useCallback(async () => {
    try {
      const r = await reviewsApi.getByDate(dateStr);
      setReview(r);
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
      fetchTasks();
    } catch (err) {
      showToast('error', '操作失败');
    }
  };

  const handlePin = async (id: string) => {
    try {
      await tasksApi.pin(id);
      fetchTasks();
    } catch (err) {
      showToast('error', '操作失败');
    }
  };

  const handleEdit = async (id: string, content: string) => {
    try {
      await tasksApi.update(id, { content });
      fetchTasks();
    } catch (err) {
      showToast('error', '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tasksApi.delete(id);
      showToast('success', '任务已删除');
      fetchTasks();
    } catch (err) {
      showToast('error', '删除失败');
    }
  };

  const handleSaveReview = async () => {
    setReviewSaving('saving');
    try {
      const result = await reviewsApi.upsert({ date: dateStr, content: reviewContent });
      setReview(result);
      setReviewSaving('saved');
      setTimeout(() => setReviewSaving('idle'), 2000);
    } catch (err) {
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
    } catch (err) {
      showToast('error', '顺延失败');
    }
  };

  const handleUnfinishedComplete = async (task: Task) => {
    try {
      await tasksApi.toggle(task.id);
      setUnfinishedTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
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

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  };

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-base)',
    width: '100%',
    outline: 'none',
  };

  return (
    <PageShell>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-lg)' }}>
        📋 每日计划与复盘
      </h2>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-xl)',
        borderBottom: '2px solid var(--color-border-light)',
        paddingBottom: 'var(--space-sm)',
      }}>
        {(['today', 'tomorrow'] as TabDate[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              fontSize: 'var(--text-base)',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              marginBottom: -10,
            }}
          >
            {tab === 'today' ? `今天 ${formatDateDisplay(dateStr).split(' ')[1] || ''}` : `明天 ${formatDateDisplay(dateStr).split(' ')[1] || ''}`}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: 'var(--space-xl)',
      }}>
        {/* Tasks Section */}
        <div style={{ gridColumn: 'span 7' }}>
          {/* Add Task Form */}
          <Card style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-md)' }}>
              添加任务
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="任务内容..."
                maxLength={500}
                style={inputStyle}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={newSubject} onChange={(e) => { setNewSubject(e.target.value as Subject); setNewSubSubject(null); }} style={selectStyle}>
                  <option value="math">数学</option>
                  <option value="english">英语</option>
                  <option value="408">408</option>
                </select>
                {newSubject === '408' && (
                  <select value={newSubSubject || ''} onChange={(e) => setNewSubSubject((e.target.value || null) as SubSubject | null)} style={selectStyle}>
                    <option value="">不限</option>
                    {SUB_SUBJECT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newImportant} onChange={(e) => setNewImportant(e.target.checked)} />
                  重要
                </label>
                <Button variant="primary" size="sm" onClick={handleAddTask} loading={adding}>
                  添加
                </Button>
              </div>
            </div>
          </Card>

          {/* Task List */}
          {tasksLoading ? (
            <LoadingState message="加载任务中..." />
          ) : tasksError ? (
            <ErrorState message={tasksError} onRetry={fetchTasks} />
          ) : tasks.length === 0 ? (
            <Card>
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-lg)' }}>
                暂无任务，添加第一个吧
              </p>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {/* Important tasks */}
              {importantTasks.length > 0 && (
                <div>
                  <h4 style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--color-accent-warning)',
                    marginBottom: 'var(--space-sm)',
                  }}>
                    📌 重要 ({importantTasks.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                </div>
              )}

              {/* Normal tasks */}
              {normalTasks.length > 0 && (
                <div>
                  <h4 style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--space-sm)',
                  }}>
                    普通 ({normalTasks.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Daily Review Section */}
        <div style={{ gridColumn: 'span 5' }}>
          <Card>
            <h3 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-lg)',
              marginBottom: 'var(--space-md)',
            }}>
              📝 每日复盘
            </h3>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-md)',
            }}>
              {formatDateDisplay(dateStr)}
            </p>
            <textarea
              value={reviewContent}
              onChange={(e) => {
                setReviewContent(e.target.value);
                if (reviewSaving === 'saved') setReviewSaving('idle');
              }}
              placeholder="记录今天的学习心得、遇到的困难、明天的计划..."
              rows={8}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                resize: 'vertical',
                fontFamily: 'inherit',
                outline: 'none',
                lineHeight: 1.6,
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-sm)',
              marginTop: 'var(--space-md)',
            }}>
              {reviewSaving === 'saving' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>保存中...</span>
              )}
              {reviewSaving === 'saved' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-success)' }}>已保存 ✓</span>
              )}
              {reviewSaving === 'error' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-primary)' }}>
                  保存失败，点击重试
                </span>
              )}
              <Button variant="primary" size="sm" onClick={handleSaveReview} loading={reviewSaving === 'saving'}>
                保存复盘
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Unfinished Tasks Modal */}
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
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-md)',
                backgroundColor: 'var(--color-border-light)',
                borderRadius: 'var(--radius-md)',
                gap: 'var(--space-sm)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.content}
                </p>
                <SubjectBadge subject={task.subject as Subject} subSubject={task.subSubject as SubSubject | null} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexShrink: 0 }}>
                <Button variant="primary" size="sm" onClick={() => handleCarryOver(task)}>顺延</Button>
                <Button variant="secondary" size="sm" onClick={() => handleUnfinishedComplete(task)}>标记完成</Button>
                <Button variant="ghost" size="sm" onClick={() => handleUnfinishedDismiss(task)}>放弃</Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </PageShell>
  );
}
