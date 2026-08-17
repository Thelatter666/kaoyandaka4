import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { UpsertReviewInput } from '@shared/types';

export interface Review {
  id: string;
  reviewDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/* 本地模式（P3）：同名同签名切到 IndexedDB，页面组件零改动 */
export const reviewsApi = {
  getByDate: (date: string) =>
    isLocalMode() ? localStore.reviews.getByDate(date) : api.get<Review | null>(`/reviews?date=${date}`),

  upsert: (data: UpsertReviewInput) =>
    isLocalMode() ? localStore.reviews.upsert(data) : api.put<Review>('/reviews', data),

  getHistory: () =>
    isLocalMode() ? localStore.reviews.getHistory() : api.get<Review[]>('/reviews/history'),
};
