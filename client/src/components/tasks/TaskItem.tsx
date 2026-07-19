import React, { useState, useRef, useEffect } from 'react';
import { SubjectBadge } from '../ui/SubjectBadge';
import type { Subject, SubSubject } from '@shared/types';

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
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(task.content);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: isSortMode ? 'var(--color-accent-primary-light)' : 'transparent',
        border: isSortMode ? '2px dashed var(--color-accent-primary)' : '1px solid transparent',
        transition: 'all var(--transition-fast)',
      }}
    >
      {/* Sort handle */}
      <button
        tabIndex={0}
        aria-label={`排序：${task.content}`}
        aria-grabbed={isSortMode}
        onKeyDown={onSortKeyDown}
        onClick={() => isSortMode ? undefined : undefined}
        style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          border: 'none',
          background: 'none',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-base)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        ⠿
      </button>

      {/* Complete checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.isCompleted ? '标记为未完成' : '标记为已完成'}
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: `2px solid ${task.isCompleted ? 'var(--color-accent-success)' : 'var(--color-border)'}`,
          backgroundColor: task.isCompleted ? 'var(--color-accent-success)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all var(--transition-fast)',
          color: 'white',
          fontSize: 14,
        }}
      >
        {task.isCompleted && '✓'}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid var(--color-border-focus)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-base)',
              backgroundColor: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={() => !task.isCompleted && setEditing(true)}
            style={{
              textDecoration: task.isCompleted ? 'line-through' : 'none',
              color: task.isCompleted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
              cursor: task.isCompleted ? 'default' : 'pointer',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {task.content}
          </span>
        )}
      </div>

      {/* Subject badge */}
      <SubjectBadge subject={task.subject} subSubject={task.subSubject} />

      {/* Pin button */}
      <button
        onClick={() => onPin(task.id)}
        aria-label={task.isImportant ? '取消重要' : '标记为重要'}
        title={task.isImportant ? '取消重要' : '标记为重要'}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          color: task.isImportant ? 'var(--color-accent-warning)' : 'var(--color-text-muted)',
          transition: 'all var(--transition-fast)',
        }}
      >
        📌
      </button>

      {/* Move up/down (screen reader only) */}
      {onMoveUp && (
        <button className="sr-only" onClick={onMoveUp} aria-label={`上移：${task.content}`}>上移</button>
      )}
      {onMoveDown && (
        <button className="sr-only" onClick={onMoveDown} aria-label={`下移：${task.content}`}>下移</button>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        aria-label={`删除：${task.content}`}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          color: 'var(--color-text-muted)',
          opacity: 0.5,
          transition: 'all var(--transition-fast)',
        }}
      >
        ✕
      </button>
    </div>
  );
}
