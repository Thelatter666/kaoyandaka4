/**
 * 统计聚合纯函数（P3-B）：移植 server/src/routes/statistics.ts 的 forest /
 * today-summary / heatmap 三类计算，语义与服务器完全一致：
 * - 去重口径：source='focus_session' 全计；course_video 仅计 focus_session_id 为空者
 * - 树 = 每满 3600 秒一棵，按科目独立（free 漫游独立累计）
 * - 日期全部用本地日期（YYYY-MM-DD），与服务器 formatDate 一致
 * 输入为该账户 studyRecords 全量（含 accountId），输出与服务器响应同构。
 */

import { formatDate } from './date';
import type { ForestResponse, HeatmapResponse, SubSubject } from '@shared/types';
import type { LocalStudyRecord } from '../local/types';

export interface TodaySummary {
  completedSessions: number;
  totalSeconds: number;
  bySubject: Record<string, number>;
}

const SUBJECTS = ['math', 'english', '408', 'free'] as const;

/** 去重口径（与服务器 WHERE 条件一致） */
export function isEligibleRecord(rec: LocalStudyRecord): boolean {
  return rec.source === 'focus_session' || (rec.source === 'course_video' && rec.focusSessionId === null);
}

function getNextDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

function getRange(mode: 'day' | 'week' | 'month', date: string): { rangeStart: string; rangeEnd: string } {
  const now = new Date(date + 'T00:00:00');
  switch (mode) {
    case 'day':
      return { rangeStart: date, rangeEnd: date };
    case 'week': {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { rangeStart: formatDate(monday), rangeEnd: formatDate(sunday) };
    }
    case 'month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { rangeStart: formatDate(firstDay), rangeEnd: formatDate(lastDay) };
    }
  }
}

/* ---- forest ---- */

export function computeForest(
  records: LocalStudyRecord[],
  mode: 'day' | 'week' | 'month',
  date: string
): ForestResponse {
  const { rangeStart, rangeEnd } = getRange(mode, date);
  const todayStr = formatDate(new Date());
  if (date > todayStr) throw new Error('不能查询未来日期');

  const eligible = records.filter(isEligibleRecord);
  const startBound = `${rangeStart} 00:00:00`;
  const endBound = `${getNextDate(rangeEnd)} 00:00:00`;
  const inRange = eligible.filter((r) => r.createdAt >= startBound && r.createdAt < endBound);

  let totalFocusSeconds = 0;
  let totalCompletedSessions = 0;
  const subjectSeconds: Record<string, number> = { math: 0, english: 0, '408': 0, free: 0 };
  const dateMap = new Map<
    string,
    Array<{
      id: string;
      title: string;
      subject: LocalStudyRecord['subjectSnapshot'];
      subSubject: SubSubject | null;
      durationSeconds: number;
      time: string;
      source: LocalStudyRecord['source'];
    }>
  >();

  for (const rec of inRange) {
    totalFocusSeconds += rec.actualDurationSeconds;
    totalCompletedSessions += 1;
    subjectSeconds[rec.subjectSnapshot] = (subjectSeconds[rec.subjectSnapshot] || 0) + rec.actualDurationSeconds;

    const recDate = rec.createdAt.slice(0, 10);
    if (!dateMap.has(recDate)) dateMap.set(recDate, []);
    dateMap.get(recDate)!.push({
      id: rec.id,
      title: rec.presetNameSnapshot,
      subject: rec.subjectSnapshot,
      subSubject: rec.subSubjectSnapshot as SubSubject | null,
      durationSeconds: rec.actualDurationSeconds,
      time: rec.createdAt,
      source: rec.source,
    });
  }

  const treesBySubject: Record<string, number> = { math: 0, english: 0, '408': 0, free: 0 };
  const remainingSecondsBySubject: Record<string, number> = { math: 3600, english: 3600, '408': 3600, free: 3600 };
  for (const subject of SUBJECTS) {
    treesBySubject[subject] = Math.floor(subjectSeconds[subject] / 3600);
    remainingSecondsBySubject[subject] = 3600 - (subjectSeconds[subject] % 3600);
  }
  const totalTrees = SUBJECTS.reduce((acc, s) => acc + treesBySubject[s], 0);

  // 累计（全时段，同去重口径）
  const cumulativeTotalSeconds = eligible.reduce((acc, r) => acc + r.actualDurationSeconds, 0);
  const bySubjectAll = new Map<string, number>();
  for (const rec of eligible) {
    bySubjectAll.set(rec.subjectSnapshot, (bySubjectAll.get(rec.subjectSnapshot) || 0) + rec.actualDurationSeconds);
  }
  let cumulativeTotalTrees = 0;
  for (const [, total] of bySubjectAll) {
    cumulativeTotalTrees += Math.floor(total / 3600);
  }

  return {
    mode,
    rangeStart,
    rangeEnd,
    canGoBack: true,
    canGoForward: rangeEnd < todayStr,
    period: {
      totalFocusSeconds,
      totalCompletedSessions,
      totalTrees,
      treesBySubject,
      remainingSecondsBySubject,
    },
    cumulative: {
      totalFocusSeconds: cumulativeTotalSeconds,
      totalTrees: cumulativeTotalTrees,
    },
    records: Array.from(dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, items]) => ({ date: dateKey, items })),
  };
}

/* ---- today-summary ---- */

export function computeTodaySummary(records: LocalStudyRecord[]): TodaySummary {
  const todayStr = formatDate(new Date());
  const startBound = `${todayStr} 00:00:00`;
  const endBound = `${getNextDate(todayStr)} 00:00:00`;
  const todayRecords = records.filter((r) => isEligibleRecord(r) && r.createdAt >= startBound && r.createdAt < endBound);

  const bySubject: Record<string, number> = { math: 0, english: 0, '408': 0, free: 0 };
  let totalSeconds = 0;
  for (const rec of todayRecords) {
    totalSeconds += rec.actualDurationSeconds;
    if (bySubject[rec.subjectSnapshot] !== undefined) {
      bySubject[rec.subjectSnapshot] += rec.actualDurationSeconds;
    }
  }
  return {
    completedSessions: todayRecords.length,
    totalSeconds,
    bySubject,
  };
}

/* ---- heatmap ---- */

export function computeHeatmap(records: LocalStudyRecord[]): HeatmapResponse {
  const todayStr = formatDate(new Date());
  const rangeStartDate = new Date();
  rangeStartDate.setMonth(rangeStartDate.getMonth() - 6);
  const rangeStart = formatDate(rangeStartDate);

  const startBound = `${rangeStart} 00:00:00`;
  const endBound = `${getNextDate(todayStr)} 00:00:00`;
  const eligible = records.filter((r) => isEligibleRecord(r) && r.createdAt >= startBound && r.createdAt < endBound);

  const secondsByDate = new Map<string, number>();
  for (const rec of eligible) {
    const dateKey = rec.createdAt.slice(0, 10);
    secondsByDate.set(dateKey, (secondsByDate.get(dateKey) || 0) + rec.actualDurationSeconds);
  }

  const days = Array.from(secondsByDate.entries())
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { rangeStart, rangeEnd: todayStr, days };
}