import { api } from './client';
import type { ForestResponse } from '@shared/types';

/** 今日完成概要（轻量端点，去重口径与 /forest 一致） */
export interface TodaySummary {
  completedSessions: number;
  totalSeconds: number;
}

export const statisticsApi = {
  getForest: (mode: 'day' | 'week' | 'month', date: string) =>
    api.get<ForestResponse>(`/statistics/forest?mode=${mode}&date=${date}`),

  getTodaySummary: () => api.get<TodaySummary>('/statistics/today-summary'),
};
