/**
 * 任务行卡 TaskItem（设计文档 8.2）
 *
 * glass-1 行卡；完成态＝松绿 CheckCircle2 + 文字删除线 + 整卡 opacity 0.62
 * （颜色 + 图标 + 删除线多通道表达）；重要＝Pin 填充主色；拖拽手柄
 * GripVertical 44px 触控区；键盘排序（Enter/空格进入，方向键移动）与
 * sr-only 上移/下移按钮保留；删除 Trash2。业务回调与排序逻辑不变。
 */
import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Circle, GripVertical, Pin, Trash2 } from 'lucide-react';
import { SubjectBadge } from '../ui/SubjectBadge';
import type { Subject, SubSubject } from '@shared/types';
import './TaskItem.css';

export interface TaskData {
  id: string;
  taskDate: string;
  content: string;
  subject: Subject;
  subSubject: SubSubject | null;
  isCompleted: boolean;
  isImportant: boolean;
  sortOrder: number;
}

interface TaskItemProps {
  task: TaskData;
  onToggle: (id: string) => void;
  onPin: (id: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  isSortMode?: boolean;
  onSortKeyDown?: (e: React.KeyboardEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** 额外样式（如列表项入场延迟 transitionDelay） */
  style?: React.CSSProperties;
}

export function TaskItem({
  task,
  onToggle,
  onPin,
  onEdit,
  onDelete,
  isSortMode,
  onSortKeyDown,
  onMoveUp,
  onMoveDown,
  style,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(task.content);
  const inputRef = useRef<HTMLInputElement>(null);

  // 庆祝动画 JS 驱动：仅「未完成 → 完成」切换瞬间播放（挂载时初始已完成不播）
  const [celebrating, setCelebrating] = useState(false);
  const prevCompletedRef = useRef(task.isCompleted);
  useEffect(() => {
    const prev = prevCompletedRef.current;
    prevCompletedRef.current = task.isCompleted;
    if (task.isCompleted && !prev) {
      setCelebrating(true);
      const timer = setTimeout(() => setCelebrating(false), 200);
      return () => clearTimeout(timer);
    }
  }, [task.isCompleted]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    if (editContent.trim() && editContent !== task.content) {
      onEdit(task.id, editContent.trim());
    }
    setEditing(false);
  };

  const classNames = [
    'task-item',
    'glass-1',
    task.isCompleted ? 'task-item--done' : '',
    isSortMode ? 'task-item--sorting' : '',
    celebrating ? 'task-item--celebrating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} style={style}>
      {/* 拖拽手柄：44px 触控区，键盘排序（Enter/空格 + 方向键） */}
      <button
        type="button"
        className="task-item__handle"
        tabIndex={0}
        aria-label={`排序：${task.content}`}
        aria-grabbed={isSortMode}
        onKeyDown={onSortKeyDown}
      >
        <GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {/* 完成切换：完成态松绿 CheckCircle2 / 未完成空心圆 */}
      <button
        type="button"
        className="task-item__toggle"
        onClick={() => onToggle(task.id)}
        aria-label={task.isCompleted ? `标记为未完成：${task.content}` : `标记为已完成：${task.content}`}
        aria-pressed={task.isCompleted}
      >
        {task.isCompleted ? (
          <CheckCircle2 size={22} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Circle size={22} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>

      {/* 内容（未完成时点击进入行内编辑） */}
      <div className="task-item__content">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            className="task-item__edit-input"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="编辑任务内容"
          />
        ) : (
          <span
            className="task-item__text"
            onClick={() => !task.isCompleted && setEditing(true)}
            title={task.content}
          >
            {task.content}
          </span>
        )}
      </div>

      {/* 科目徽章 */}
      <SubjectBadge subject={task.subject} subSubject={task.subSubject} />

      {/* 重要切换：重要时 Pin 填充主色 */}
      <button
        type="button"
        className={`task-item__pin${task.isImportant ? ' task-item__pin--active' : ''}`}
        onClick={() => onPin(task.id)}
        aria-label={task.isImportant ? `取消重要：${task.content}` : `标记为重要：${task.content}`}
        aria-pressed={task.isImportant}
        title={task.isImportant ? '取消重要' : '标记为重要'}
      >
        <Pin size={16} strokeWidth={1.75} fill={task.isImportant ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>

      {/* 上移/下移（仅屏幕阅读器，键盘排序等价物保留） */}
      {onMoveUp && (
        <button type="button" className="sr-only" onClick={onMoveUp} aria-label={`上移：${task.content}`}>
          上移
        </button>
      )}
      {onMoveDown && (
        <button type="button" className="sr-only" onClick={onMoveDown} aria-label={`下移：${task.content}`}>
          下移
        </button>
      )}

      {/* 删除 */}
      <button
        type="button"
        className="task-item__delete"
        onClick={() => onDelete(task.id)}
        aria-label={`删除：${task.content}`}
        title="删除任务"
      >
        <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
