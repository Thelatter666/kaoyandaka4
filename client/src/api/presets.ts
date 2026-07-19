import { api } from './client';
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

export const presetsApi = {
  getAll: () => api.get<Preset[]>('/presets'),

  create: (data: CreatePresetInput) => api.post<Preset>('/presets', data),

  update: (id: string, data: UpdatePresetInput) => api.put<Preset>(`/presets/${id}`, data),

  delete: (id: string) => api.delete<void>(`/presets/${id}`),
};
