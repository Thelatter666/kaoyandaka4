import { api } from './client';
import type { UpsertReviewInput } from '@shared/types';

export interface Review {
  id: string;
  reviewDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const reviewsApi = {
  getByDate: (date: string) => api.get<Review | null>(`/reviews?date=${date}`),

  upsert: (data: UpsertReviewInput) => api.put<Review>('/reviews', data),
};
