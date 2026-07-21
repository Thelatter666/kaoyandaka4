/**
 * 网课分区卡（设计文档 8.5）
 *
 * glass-1 分区卡：标题行（科目图标 + 名称 + 进度百分比）+ 双进度条 + 课程列表；
 * 空分区 = 虚线描边玻璃卡 +「导入 [分区名] 课程」次按钮（Plus 图标）。
 */
import React from 'react';
import { Plus, Trash2, ChevronRight, Sigma, BookA, Cpu, type LucideProps } from 'lucide-react';
import { Button } from '../ui/Button';
import { DualProgressBars } from './DualProgressBars';
import { Course } from '../../api/courses';
import { formatDurationHuman } from '../../utils/duration';
import type { Subject } from '@shared/types';
import './CourseZoneCard.css';

export const ZONE_ICONS: Record<Subject, React.ComponentType<LucideProps>> = {
  math: Sigma,
  english: BookA,
  '408': Cpu,
};

interface CourseZoneCardProps {
  label: string;
  subject: Subject;
  courses: Course[];
  onImport: () => void;
  onNavigate: (hash: string) => void;
  onDelete: (course: Course) => void;
  /** v2 bento 跨度/入场编排由父级注入（设计文档 12.4） */
  className?: string;
  style?: React.CSSProperties;
}

export function CourseZoneCard({ label, subject, courses, onImport, onNavigate, onDelete, className, style }: CourseZoneCardProps) {
  const ZoneIcon = ZONE_ICONS[subject];

  // 分区聚合双进度（集数 / 时长，口径与各课程累加一致）
  const totalEpisodes = courses.reduce((sum, c) => sum + c.episodeCount, 0);
  const completedEpisodes = courses.reduce((sum, c) => sum + c.completedEpisodeCount, 0);
  const totalSeconds = courses.reduce((sum, c) => sum + c.totalDurationSeconds, 0);
  const watchedSeconds = courses.reduce((sum, c) => sum + c.watchedDurationSeconds, 0);
  const pct = totalEpisodes > 0 ? Math.round((completedEpisodes / totalEpisodes) * 100) : 0;

  /* 空分区：虚线描边玻璃卡 + 导入次按钮 */
  if (courses.length === 0) {
    return (
      <div className={`zone-card zone-card--${subject} zone-card--empty glass-1${className ? ` ${className}` : ''}`} style={style}>
        <div className="zone-card__head">
          <span className="zone-card__icon" aria-hidden="true">
            <ZoneIcon size={18} strokeWidth={1.75} />
          </span>
          <h3 className="zone-card__label">{label}</h3>
        </div>
        <p className="zone-card__empty-hint">这个分区还没有课程</p>
        <Button variant="glass" onClick={onImport}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          导入{label}课程
        </Button>
      </div>
    );
  }

  return (
    <div className={`zone-card zone-card--${subject} glass-1 sheen-hover${className ? ` ${className}` : ''}`} style={style}>
      {/* 标题行：科目图标 + 名称 + 进度百分比 */}
      <div className="zone-card__head">
        <span className="zone-card__icon" aria-hidden="true">
          <ZoneIcon size={18} strokeWidth={1.75} />
        </span>
        <h3 className="zone-card__label">{label}</h3>
        <span className="zone-card__pct tabular-nums">{pct}%</span>
      </div>

      {/* 双进度条：集数（松绿系）/ 时长（珊瑚系） */}
      <DualProgressBars
        completedEpisodes={completedEpisodes}
        totalEpisodes={totalEpisodes}
        watchedSeconds={watchedSeconds}
        totalSeconds={totalSeconds}
        size="sm"
      />

      {/* 课程列表 */}
      <ul className="zone-card__courses">
        {courses.map((course) => (
          <li key={course.id} className="zone-card__course-row">
            <button
              type="button"
              className="zone-card__course"
              onClick={() => onNavigate(`#/courses/${course.id}`)}
              aria-label={`查看课程 ${course.name}`}
            >
              <span className="zone-card__course-name truncate">{course.name}</span>
              <span className="zone-card__course-meta tabular-nums">
                {course.completedEpisodeCount}/{course.episodeCount} 集 · {formatDurationHuman(course.totalDurationSeconds)}
              </span>
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="zone-card__course-chevron" />
            </button>
            <button
              type="button"
              className="zone-card__course-delete"
              onClick={() => onDelete(course)}
              aria-label={`删除 ${course.name}`}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
