/**
 * 学习预设卡（设计文档 8.3 / 8.4）
 *
 * glass-1 卡：顶部 3px 科目色渐变条 + 左侧科目 lucide 图标（形状+颜色双通道），
 * 名称宋体 18px，时长等宽大数字 + 分钟小字，hover 上浮，「最近」玻璃胶囊标签。
 * 选中态（番茄钟等选择场景）：主色 2px 描边 + 辉光 + 左上 CheckCircle2。
 */
import React from 'react';
import { CheckCircle2, Pencil, Trash2, Sigma, BookA, Cpu, type LucideProps } from 'lucide-react';
import { Card } from '../ui/Card';
import { SubjectBadge } from '../ui/SubjectBadge';
import type { Subject, SubSubject } from '@shared/types';
import './PresetCard.css';

const SUBJECT_ICONS: Record<Subject, React.ComponentType<LucideProps>> = {
  math: Sigma,
  english: BookA,
  '408': Cpu,
};

interface PresetCardProps {
  id: string;
  name: string;
  subject: Subject;
  subSubject: SubSubject | null;
  durationMinutes: number;
  isSelected?: boolean;
  isRecentlyUsed?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  compact?: boolean;
}

export function PresetCard({
  name,
  subject,
  subSubject,
  durationMinutes,
  isSelected = false,
  isRecentlyUsed = false,
  onClick,
  onDelete,
  onEdit,
  compact = false,
}: PresetCardProps) {
  const SubjectIcon = SUBJECT_ICONS[subject];

  const classNames = [
    'preset-card',
    `preset-card--${subject}`,
    isSelected ? 'preset-card--selected' : '',
    compact ? 'preset-card--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card
      className={classNames}
      padding={compact ? 'var(--space-md)' : 'var(--space-lg)'}
      onClick={onClick}
      hoverable
    >
      {isSelected && (
        <span className="preset-card__selected-badge" aria-hidden="true">
          <CheckCircle2 size={20} strokeWidth={2} />
        </span>
      )}
      {isSelected && <span className="sr-only">已选择</span>}

      <div className="preset-card__body">
        {/* 头部：科目图标（形状+颜色双通道）+ 宋体名称 + 「最近」玻璃胶囊 */}
        <div className="preset-card__head">
          <span className="preset-card__icon" aria-hidden="true">
            <SubjectIcon size={18} strokeWidth={1.75} />
          </span>
          <h4 className="preset-card__name truncate">{name}</h4>
          {isRecentlyUsed && (
            <span className="preset-card__recent">
              <span className="preset-card__recent-dot" aria-hidden="true" />
              最近
            </span>
          )}
        </div>

        {/* 时长：等宽大数字 + 分钟小字 */}
        <p className="preset-card__duration">
          <span className="preset-card__duration-num tabular-nums">{durationMinutes}</span>
          <span className="preset-card__duration-unit">分钟</span>
        </p>

        {/* 底部：科目徽章 + 编辑/删除（44px 图标按钮） */}
        <div className="preset-card__foot">
          <SubjectBadge subject={subject} subSubject={subSubject} />
          {(onEdit || onDelete) && (
            <div className="preset-card__actions">
              {onEdit && (
                <button
                  type="button"
                  className="preset-card__action"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  aria-label={`编辑 ${name}`}
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="preset-card__action preset-card__action--danger"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  aria-label={`删除 ${name}`}
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
