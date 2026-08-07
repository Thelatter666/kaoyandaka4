/**
 * 集数行（课程详情页 8.6）
 *
 * 从 CourseDetailPage 内联 JSX 抽取为独立子组件（性能优化 2026-08）：
 * 集数列表启用 window 滚动虚拟化后仅渲染可见行，稳定的子组件避免
 * 每帧虚拟行重建的开销；props 最小化（episode/index/回调），
 * 完成状态变化只重渲染受影响的行。
 */
import React from 'react';
import { Check, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Episode } from '../../api/courses';

interface EpisodeRowProps {
  episode: Episode;
  index: number;
  onToggle: (episodeId: string) => void;
  onStart: () => void;
}

export function EpisodeRow({ episode, index, onToggle, onStart }: EpisodeRowProps) {
  return (
    <div className={`episode-row glass-1${episode.isCompleted ? ' episode-row--done' : ''}`}>
      {/* 28px 完成圆点（44px 触控区），Check 填充松绿 */}
      <button
        type="button"
        className="episode-row__toggle"
        onClick={() => onToggle(episode.id)}
        aria-label={`${episode.isCompleted ? '标记为未完成' : '标记为已完成'}：${episode.title}`}
        aria-pressed={episode.isCompleted}
      >
        <span className="episode-row__dot" aria-hidden="true">
          {episode.isCompleted && <Check size={16} strokeWidth={2.5} />}
        </span>
      </button>
      <span className="episode-row__index tabular-nums" aria-hidden="true">{index + 1}</span>
      <span className="episode-row__title truncate">{episode.title}</span>
      <span className="episode-row__duration tabular-nums">{episode.durationText}</span>
      <Button
        variant="glass"
        className="episode-row__play"
        onClick={onStart}
        aria-label={`开始学习：${episode.title}`}
      >
        <Play size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="episode-row__play-text">开始学习</span>
      </Button>
    </div>
  );
}
