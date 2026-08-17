import { describe, it, expect } from 'vitest';
import { computeForest, computeTodaySummary, computeHeatmap, isEligibleRecord } from './localStatistics';
import { formatDate, formatDateTime } from './date';
import type { LocalStudyRecord } from '../local/types';

function rec(overrides: Partial<LocalStudyRecord>): LocalStudyRecord {
  return {
    id: 'r1',
    accountId: 'a1',
    presetNameSnapshot: '数学',
    subjectSnapshot: 'math',
    subSubjectSnapshot: null,
    actualDurationSeconds: 1800,
    focusSessionId: null,
    taskId: null,
    courseEpisodeId: null,
    courseNameSnapshot: null,
    episodeTitleSnapshot: null,
    source: 'focus_session',
    notes: null,
    createdAt: '2026-08-10 10:00:00',
    updatedAt: '2026-08-10 10:00:00',
    ...overrides,
  };
}

describe('isEligibleRecord（去重口径）', () => {
  it('focus_session 全计', () => {
    expect(isEligibleRecord(rec({}))).toBe(true);
  });
  it('course_video 且 focusSessionId 为空才计', () => {
    expect(isEligibleRecord(rec({ source: 'course_video', focusSessionId: null }))).toBe(true);
    expect(isEligibleRecord(rec({ source: 'course_video', focusSessionId: 'f1' }))).toBe(false);
  });
});

describe('computeForest', () => {
  const records = [
    rec({ id: '1', createdAt: '2026-08-10 09:00:00', actualDurationSeconds: 1800 }),
    rec({ id: '2', createdAt: '2026-08-10 10:00:00', actualDurationSeconds: 1800 }),
    rec({ id: '3', createdAt: '2026-08-10 11:00:00', source: 'course_video', focusSessionId: null, actualDurationSeconds: 1200 }),
    rec({ id: '4', createdAt: '2026-08-10 12:00:00', source: 'course_video', focusSessionId: 'f9', actualDurationSeconds: 9999 }),
  ];

  it('day 范围：去重后聚合，树 = floor(秒/3600)', () => {
    const res = computeForest(records, 'day', '2026-08-10');
    expect(res.mode).toBe('day');
    expect(res.rangeStart).toBe('2026-08-10');
    expect(res.rangeEnd).toBe('2026-08-10');
    expect(res.period.totalFocusSeconds).toBe(4800);
    expect(res.period.totalCompletedSessions).toBe(3);
    expect(res.period.totalTrees).toBe(1);
    expect(res.period.treesBySubject.math).toBe(1);
    expect(res.period.remainingSecondsBySubject.math).toBe(2400);
    expect(res.cumulative.totalFocusSeconds).toBe(4800);
    expect(res.cumulative.totalTrees).toBe(1);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].items).toHaveLength(3);
    expect(res.records[0].items[0].id).toBe('1');
  });

  it('week 范围：周一到周日', () => {
    const weekRecords = [
      ...records,
      rec({ id: '5', createdAt: '2026-08-09 10:00:00' }), // 上周日，排除
      rec({ id: '6', createdAt: '2026-08-16 10:00:00' }), // 本周日，包含
      rec({ id: '7', createdAt: '2026-08-17 10:00:00' }), // 下周一，排除
    ];
    // 2026-08-12 为周三
    const res = computeForest(weekRecords, 'week', '2026-08-12');
    expect(res.rangeStart).toBe('2026-08-10');
    expect(res.rangeEnd).toBe('2026-08-16');
    expect(res.period.totalCompletedSessions).toBe(4);
    expect(res.records.map((r) => r.date)).toEqual(['2026-08-16', '2026-08-10']);
  });

  it('month 范围：当月 1 号到月末', () => {
    const res = computeForest(records, 'month', '2026-08-15');
    expect(res.rangeStart).toBe('2026-08-01');
    expect(res.rangeEnd).toBe('2026-08-31');
  });

  it('按科目独立种树', () => {
    const multi = [
      rec({ id: 'a', subjectSnapshot: 'math', actualDurationSeconds: 7200 }),
      rec({ id: 'b', subjectSnapshot: 'english', actualDurationSeconds: 3600 }),
      rec({ id: 'c', subjectSnapshot: 'free', actualDurationSeconds: 1800 }),
    ];
    const res = computeForest(multi, 'day', '2026-08-10');
    expect(res.period.treesBySubject).toEqual({ math: 2, english: 1, '408': 0, free: 0 });
    expect(res.period.totalTrees).toBe(3);
  });

  it('未来日期抛错', () => {
    expect(() => computeForest(records, 'day', '2027-01-01')).toThrow('不能查询未来日期');
  });

  it('canGoForward：rangeEnd 早于今天为 true，含今天为 false', () => {
    const today = formatDate(new Date());
    const res = computeForest(records, 'month', '2026-08-15');
    expect(res.canGoBack).toBe(true);
    expect(res.canGoForward).toBe('2026-08-31' < today);
    const resToday = computeForest(records, 'day', today);
    expect(resToday.canGoForward).toBe(false);
  });
});

describe('computeTodaySummary', () => {
  it('只统计今日（本地日期）', () => {
    const today = formatDate(new Date());
    const nowTime = formatDateTime(new Date());
    const records = [
      rec({ id: '1', createdAt: `${today} 08:00:00`, actualDurationSeconds: 1500 }),
      rec({ id: '2', createdAt: `${today} 09:00:00`, subjectSnapshot: 'english', actualDurationSeconds: 2100 }),
      rec({ id: '3', createdAt: '2026-08-01 08:00:00', actualDurationSeconds: 9999 }),
    ];
    const res = computeTodaySummary(records);
    expect(res.completedSessions).toBe(2);
    expect(res.totalSeconds).toBe(3600);
    expect(res.bySubject.math).toBe(1500);
    expect(res.bySubject.english).toBe(2100);
    expect(nowTime.length).toBeGreaterThan(0);
  });
});

describe('computeHeatmap', () => {
  it('近 6 个月按日聚合，只含有效日期', () => {
    const today = formatDate(new Date());
    const records = [
      rec({ id: '1', createdAt: `${today} 08:00:00`, actualDurationSeconds: 1000 }),
      rec({ id: '2', createdAt: `${today} 09:00:00`, actualDurationSeconds: 2000 }),
      rec({ id: '3', createdAt: '2026-01-01 08:00:00', actualDurationSeconds: 9999 }),
    ];
    const res = computeHeatmap(records);
    expect(res.rangeEnd).toBe(today);
    expect(res.days).toHaveLength(1);
    expect(res.days[0]).toEqual({ date: today, seconds: 3000 });
  });
});