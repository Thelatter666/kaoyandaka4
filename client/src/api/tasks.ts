import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import type { CreateTaskInput, UpdateTaskInput, ReorderItemsInput } from '@shared/types';

export interface Task {
  id: string;
  taskDate: string;
  content: string;
  subject: 'math' | 'english' | '408';
  subSubject: string | null;
  isCompleted: boolean;
  isImportant: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/* 本地模式（P3）：同名同签名切到 IndexedDB，页面组件零改动 */
export const tasksApi = {
  getByDate: (date: string) =>
    isLocalMode() ? localStore.tasks.getByDate(date) : api.get<Task[]>(`/tasks?date=${date}`),

  create: (data: CreateTaskInput) =>
    isLocalMode() ? localStore.tasks.create(data) : api.post<Task>('/tasks', data),

  update: (id: string, data: UpdateTaskInput) =>
    isLocalMode() ? localStore.tasks.update(id, data) : api.put<Task>(`/tasks/${id}`, data),

  toggle: (id: string) =>
    isLocalMode() ? localStore.tasks.toggle(id) : api.patch<Task>(`/tasks/${id}/toggle`),

  pin: (id: string) =>
    isLocalMode() ? localStore.tasks.pin(id) : api.patch<Task>(`/tasks/${id}/pin`),

  reorder: (data: ReorderItemsInput) =>
    isLocalMode() ? localStore.tasks.reorder(data) : api.patch<void>('/tasks/reorder', data),

  delete: (id: string) =>
    isLocalMode() ? localStore.tasks.delete(id) : api.delete<void>(`/tasks/${id}`),

  getUnfinished: (fromDate: string) =>
    isLocalMode()
      ? localStore.tasks.getUnfinished(fromDate)
      : api.get<Task[]>(`/tasks/unfinished?from=${fromDate}`),
};
