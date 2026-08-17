import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { ParseImportInput, CreateCourseInput } from '@shared/types';

export interface Course {
  id: string;
  name: string;
  subject: 'math' | 'english' | '408';
  subSubject: string | null;
  episodeCount: number;
  completedEpisodeCount: number;
  totalDurationSeconds: number;
  watchedDurationSeconds: number;
  lastStudiedEpisode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseDetail extends Course {
  episodes: Episode[];
}

export interface Episode {
  id: string;
  courseId: string;
  title: string;
  durationSeconds: number;
  durationText: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface ParseResult {
  episodes: Array<{
    title: string;
    durationText: string;
    durationSeconds: number;
  }>;
  totalEpisodes: number;
  totalDurationSeconds: number;
  unrecognizedLines: string[];
}

/* 本地模式（P3）：同名同签名切到 IndexedDB，页面组件零改动 */
export const coursesApi = {
  getAll: () => (isLocalMode() ? localStore.courses.getAll() : api.get<Course[]>('/courses')),

  getById: (id: string) =>
    isLocalMode() ? localStore.courses.getById(id) : api.get<CourseDetail>(`/courses/${id}`),

  parse: (data: ParseImportInput) =>
    isLocalMode() ? localStore.courses.parse(data) : api.post<ParseResult>('/courses/parse', data),

  create: (data: CreateCourseInput) =>
    isLocalMode() ? localStore.courses.create(data) : api.post<Course>('/courses', data),

  delete: (id: string) =>
    isLocalMode() ? localStore.courses.delete(id) : api.delete<void>(`/courses/${id}`),

  toggleEpisode: (courseId: string, episodeId: string) =>
    isLocalMode()
      ? localStore.courses.toggleEpisode(courseId, episodeId)
      : api.patch<Episode>(`/courses/${courseId}/episodes/${episodeId}/toggle`),
};
