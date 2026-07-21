import { api } from './client';
import type { StartFocusInput } from '@shared/types';

export interface ActiveSession {
  id: string;
  presetNameSnapshot: string;
  subjectSnapshot: 'math' | 'english' | '408' | 'free';
  subSubjectSnapshot: string | null;
  plannedDurationSeconds: number;
  startedAt: string;
  plannedEndAt: string;
  status: 'in_progress';
  source: 'pomodoro' | 'plan' | 'course';
}

export const focusApi = {
  start: (data: StartFocusInput) => api.post<ActiveSession>('/focus/start', data),

  complete: (id: string) => api.post<void>(`/focus/${id}/complete`),

  cancel: (id: string) => api.post<void>(`/focus/${id}/cancel`),

  getActive: () => api.get<ActiveSession | null>('/focus/active'),
};
