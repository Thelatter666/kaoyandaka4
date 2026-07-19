import { api } from './client';
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

export const tasksApi = {
  getByDate: (date: string) => api.get<Task[]>(`/tasks?date=${date}`),

  create: (data: CreateTaskInput) => api.post<Task>('/tasks', data),

  update: (id: string, data: UpdateTaskInput) => api.put<Task>(`/tasks/${id}`, data),

  toggle: (id: string) => api.patch<Task>(`/tasks/${id}/toggle`),

  pin: (id: string) => api.patch<Task>(`/tasks/${id}/pin`),

  reorder: (data: ReorderItemsInput) => api.patch<void>('/tasks/reorder', data),

  delete: (id: string) => api.delete<void>(`/tasks/${id}`),

  getUnfinished: (fromDate: string) => api.get<Task[]>(`/tasks/unfinished?from=${fromDate}`),
};
