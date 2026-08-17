import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { ForestResponse, HeatmapResponse } from '@shared/types';

/** 今日完成概要（轻量端点，去重口径与 /forest 一致） */
export interface TodaySummary {
  completedSessions: number;
  totalSeconds: number;
  /** 每科目今日累计秒数（math/english/408/free；free 漫游独立累计种树） */
  bySubject: Record<string, number>;
}

/* 本地模式（P3）：同名同签名切到 IndexedDB 前端等价实现 */
export const statisticsApi = {
  getForest: (mode: 'day' | 'week' | 'month', date: string) =>
    isLocalMode()
      ? localStore.statistics.getForest(mode, date)
      : api.get<ForestResponse>(`/statistics/forest?mode=${mode}&date=${date}`),

  /** 学习趋势热力图：近 6 个月每日专注秒数 */
  getHeatmap: () =>
    isLocalMode() ? localStore.statistics.getHeatmap() : api.get<HeatmapResponse>('/statistics/heatmap'),

  getTodaySummary: () =>
    isLocalMode()
      ? localStore.statistics.getTodaySummary()
      : api.get<TodaySummary>('/statistics/today-summary'),
};
