/**
 * 网课双进度条（设计文档 8.5）
 *
 * 玻璃槽 + 渐变填充：集数 = 松绿系，时长 = 珊瑚系；
 * 各带 lucide 图标 + 文字标签，不只用颜色区分。
 */
import React from 'react';
import { ListVideo, Clock } from 'lucide-react';
import { ProgressBar } from '../ui/ProgressBar';
import { formatDurationHuman } from '../../utils/duration';
import './DualProgressBars.css';

interface DualProgressBarsProps {
  completedEpisodes: number;
  totalEpisodes: number;
  watchedSeconds: number;
  totalSeconds: number;
  size?: 'sm' | 'md';
}

export function DualProgressBars({
  completedEpisodes,
  totalEpisodes,
  watchedSeconds,
  totalSeconds,
  size = 'md',
}: DualProgressBarsProps) {
  return (
    <div className="dual-progress">
      {/* 集数进度：松绿系渐变 */}
      <ProgressBar
        value={completedEpisodes}
        max={totalEpisodes || 1}
        color="var(--color-accent-success)"
        colorEnd="var(--color-accent-deep-green)"
        label={`集数 ${completedEpisodes}/${totalEpisodes}`}
        icon={<ListVideo size={14} strokeWidth={1.75} />}
        size={size}
      />
      {/* 时长进度：珊瑚系渐变 */}
      <ProgressBar
        value={watchedSeconds}
        max={totalSeconds || 1}
        color="var(--color-accent-primary-strong)"
        colorEnd="var(--color-accent-primary)"
        label={`时长 ${formatDurationHuman(watchedSeconds)}/${formatDurationHuman(totalSeconds)}`}
        icon={<Clock size={14} strokeWidth={1.75} />}
        size={size}
      />
    </div>
  );
}
