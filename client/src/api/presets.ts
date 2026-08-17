import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { CreatePresetInput, UpdatePresetInput } from '@shared/types';

export interface Preset {
  id: string;
  name: string;
  subject: 'math' | 'english' | '408';
  subSubject: string | null;
  durationMinutes: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* 本地模式（P3）：同名同签名切到 IndexedDB，页面组件零改动 */
export const presetsApi = {
  getAll: () => (isLocalMode() ? localStore.presets.getAll() : api.get<Preset[]>('/presets')),

  create: (data: CreatePresetInput) =>
    isLocalMode() ? localStore.presets.create(data) : api.post<Preset>('/presets', data),

  update: (id: string, data: UpdatePresetInput) =>
    isLocalMode() ? localStore.presets.update(id, data) : api.put<Preset>(`/presets/${id}`, data),

  delete: (id: string) =>
    isLocalMode() ? localStore.presets.delete(id) : api.delete<void>(`/presets/${id}`),
};
