import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
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

/* 本地模式（P3）：同名同签名切到 IndexedDB，页面组件零改动 */
export const focusApi = {
  start: (data: StartFocusInput) =>
    isLocalMode() ? localStore.focus.start(data) : api.post<ActiveSession>('/focus/start', data),

  complete: (id: string) =>
    isLocalMode() ? localStore.focus.complete(id) : api.post<void>(`/focus/${id}/complete`),

  cancel: (id: string) =>
    isLocalMode() ? localStore.focus.cancel(id) : api.post<void>(`/focus/${id}/cancel`),

  getActive: () =>
    isLocalMode() ? localStore.focus.getActive() : api.get<ActiveSession | null>('/focus/active'),
};
