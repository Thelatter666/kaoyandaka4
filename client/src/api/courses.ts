import { api } from './client';
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

export const coursesApi = {
  getAll: () => api.get<Course[]>('/courses'),

  getById: (id: string) => api.get<CourseDetail>(`/courses/${id}`),

  parse: (data: ParseImportInput) => api.post<ParseResult>('/courses/parse', data),

  create: (data: CreateCourseInput) => api.post<Course>('/courses', data),

  delete: (id: string) => api.delete<void>(`/courses/${id}`),

  toggleEpisode: (courseId: string, episodeId: string) =>
    api.patch<Episode>(`/courses/${courseId}/episodes/${episodeId}/toggle`),
};
