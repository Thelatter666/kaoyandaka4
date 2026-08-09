/**
 * 学习趋势热力图（GitHub / 洛谷贡献图风格）
 *
 * 7 行（周一~周日）× 近 6 个月周数列 的方格矩阵，每格代表一天的专注学习时长，
 * 颜色深浅按固定阈值分 5 档：0 / <1h / 1-2h / 2-4h / ≥4h。
 * 纯 CSS grid 渲染（约 190 格），无动画、无逐格重渲染；
 * 悬停通过原生 <title> 提示日期与时长（无障碍兜底 aria-label 同步）。
 * 月标签：仅当该列进入新月份时显示「N月」；星期标签：一/三/五。
 */
import { useMemo } from 'react';
import type { HeatmapResponse } from '@shared/types';
import { formatDurationHuman } from '../../utils/duration';
import './StudyHeatmap.css';

/** 颜色档位阈值（秒）：level 0=无记录，1=<1h，2=1-2h，3=2-4h，4=≥4h */
const LEVELS = [1, 3600, 7200, 14400] as const;

export function getHeatLevel(seconds: number): number {
  let level = 0;
  for (const threshold of LEVELS) {
    if (seconds >= threshold) level += 1;
  }
  return Math.min(level, 4);
}

interface StudyHeatmapProps {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

interface Cell {
  date: string;
  seconds: number;
  level: number;
}

interface WeekColumn {
  /** 该列周一日期 YYYY-MM-DD */
  monday: string;
  /** 该列当月标签（仅首列或新月份列非空） */
  monthLabel: string | null;
  cells: Cell[];
}

const WEEKDAY_LABELS: Array<{ index: number; label: string }> = [
  { index: 1, label: '一' },
  { index: 3, label: '三' },
  { index: 5, label: '五' },
];

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildColumns(data: HeatmapResponse): WeekColumn[] {
  const secondsByDate = new Map<string, number>();
  for (const day of data.days) secondsByDate.set(day.date, day.seconds);

  const start = new Date(data.rangeStart + 'T00:00:00');
  const end = new Date(data.rangeEnd + 'T00:00:00');

  // 对齐到起始日所在周的周一（周一为一周起点）
  const mondayOffset = (start.getDay() + 6) % 7;
  const firstMonday = new Date(start);
  firstMonday.setDate(start.getDate() - mondayOffset);

  // 对齐到结束日所在周的周日
  const sundayOffset = (end.getDay() + 6) % 7;
  const lastSunday = new Date(end);
  lastSunday.setDate(end.getDate() + (6 - sundayOffset));

  const columns: WeekColumn[] = [];
  let prevMonth: number | null = null;
  const cursor = new Date(firstMonday);

  while (cursor <= lastSunday) {
    const colMonday = new Date(cursor);
    const monthLabel =
      cursor.getMonth() !== prevMonth ? `${cursor.getMonth() + 1}月` : null;
    prevMonth = cursor.getMonth();

    const cells: Cell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const day = new Date(cursor);
      day.setDate(cursor.getDate() + dayIndex);
      const dateStr = formatDate(day);
      const seconds = day > end ? 0 : secondsByDate.get(dateStr) ?? 0;
      cells.push({ date: dateStr, seconds, level: getHeatLevel(seconds) });
    }

    columns.push({ monday: formatDate(colMonday), monthLabel, cells });
    cursor.setDate(cursor.getDate() + 7);
  }

  return columns;
}

export function StudyHeatmap({ data, loading, error, onRetry }: StudyHeatmapProps) {
  const columns = useMemo(() => (data ? buildColumns(data) : []), [data]);

  const hasAnyActivity = columns.some((col) => col.cells.some((c) => c.seconds > 0));

  if (loading && !data) {
    return (
      <div className="heatmap heatmap--loading" role="status">
        <span className="sr-only">加载学习趋势中...</span>
        <div className="skeleton heatmap-skeleton" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="heatmap-error" role="alert">
        <span className="heatmap-error__text">{error}</span>
        <button type="button" className="heatmap-error__retry" onClick={onRetry}>
          重试
        </button>
      </div>
    );
  }

  if (!data || !hasAnyActivity) {
    return (
      <div className="heatmap-empty">
        <p>最近 6 个月还没有学习记录，完成一次专注或网课学习后会出现在这里</p>
      </div>
    );
  }

  return (
    <div className="heatmap">
      <div
        className="heatmap__grid"
        style={{ '--cols': columns.length } as React.CSSProperties}
        role="img"
        aria-label="近 6 个月每日学习趋势热力图"
      >
        {/* 星期标签列 */}
        <div className="heatmap__weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((w) => (
            <span key={w.index} className="heatmap__weekday">
              {w.label}
            </span>
          ))}
        </div>

        {/* 月标签行 */}
        <div className="heatmap__months" aria-hidden="true">
          {columns.map((col) => (
            <span key={col.monday} className="heatmap__month">
              {col.monthLabel}
            </span>
          ))}
        </div>

        {/* 周列 */}
        {columns.map((col) => (
          <div key={col.monday} className="heatmap__col">
            {col.cells.map((cell) => (
              <span
                key={cell.date}
                className={`heatmap-cell heatmap-cell--l${cell.level}`}
                title={`${cell.date} · ${formatDurationHuman(cell.seconds)}`}
                aria-label={`${cell.date}，专注 ${formatDurationHuman(cell.seconds)}`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 图例：由浅到深 */}
      <div className="heatmap__legend" aria-hidden="true">
        <span className="heatmap__legend-label">少</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`heatmap-cell heatmap-cell--l${level}`} />
        ))}
        <span className="heatmap__legend-label">多</span>
      </div>
    </div>
  );
}
