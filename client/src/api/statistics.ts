import { api } from './client';
import type { ForestResponse } from '@shared/types';

export const statisticsApi = {
  getForest: (mode: 'day' | 'week' | 'month', date: string) =>
    api.get<ForestResponse>(`/statistics/forest?mode=${mode}&date=${date}`),
};
