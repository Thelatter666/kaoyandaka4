import { api } from './client';
import type { UpdateSettingsInput } from '@shared/types';

export interface Settings {
  pomodoroSoundEnabled: boolean;
}

export const settingsApi = {
  get: () => api.get<Settings>('/settings'),

  update: (data: UpdateSettingsInput) => api.put<Settings>('/settings', data),
};
