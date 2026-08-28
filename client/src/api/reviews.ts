import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { UpsertReviewInput, SetReviewLockInput, VerifyReviewLockInput } from '@shared/types';

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

/* 复盘锁（ADR-0005）：哈希存服务器 user_settings / 本地 IndexedDB settings */
export const reviewLockApi = {
  getStatus: () =>
    isLocalMode() ? localStore.reviewLock.getStatus() : api.get<{ hasLock: boolean }>('/review-lock'),

  set: (data: SetReviewLockInput) =>
    isLocalMode() ? localStore.reviewLock.set(data) : api.post<void>('/review-lock', data),

  verify: (data: VerifyReviewLockInput) =>
    isLocalMode() ? localStore.reviewLock.verify(data) : api.post<void>('/review-lock/verify', data),
};
