import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { UpdateSettingsInput } from '@shared/types';

export interface Settings {
  pomodoroSoundEnabled: boolean;
}

/* 本地模式（P3）：同名同签名切到 IndexedDB，页面组件零改动 */
export const settingsApi = {
  get: () => (isLocalMode() ? localStore.settings.get() : api.get<Settings>('/settings')),

  update: (data: UpdateSettingsInput) =>
    isLocalMode() ? localStore.settings.update(data) : api.put<Settings>('/settings', data),
};
