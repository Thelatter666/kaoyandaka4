/**
 * 本地数据模型（camelCase，与前端 API 模型/备份文件格式一致）。
 * 业务记录均含 accountId 归属字段（user_id 概念本地化，绝不复用服务器 user_id）。
 */

import type { VocabCard } from '@shared/types';

export interface LocalAccount {
  accountId: string;
  email: string;
  createdAt: string;
}

export interface LocalPreset {
  id: string;
  accountId: string;
  name: string;
  subject: 'math' | 'english' | '408';
  subSubject: string | null;
  durationMinutes: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTask {
  id: string;
  accountId: string;
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

export interface LocalReview {
  id: string;
  accountId: string;
  reviewDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCourse {
  id: string;
  accountId: string;
  name: string;
  subject: 'math' | 'english' | '408';
  subSubject: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalEpisode {
  id: string;
  accountId: string;
  courseId: string;
  title: string;
  durationSeconds: number;
  durationText: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalFocusSession {
  id: string;
  accountId: string;
  presetId: string | null;
  presetNameSnapshot: string;
  subjectSnapshot: 'math' | 'english' | '408' | 'free';
  subSubjectSnapshot: string | null;
  plannedDurationSeconds: number;
  actualDurationSeconds: number | null;
  startedAt: string;
  plannedEndAt: string;
  completedAt: string | null;
  status: 'in_progress' | 'completed' | 'cancelled';
  pausedAt: string | null;
  pausedTotalSeconds: number;
  source: 'pomodoro' | 'plan' | 'course';
  courseEpisodeId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalStudyRecord {
  id: string;
  accountId: string;
  presetNameSnapshot: string;
  subjectSnapshot: 'math' | 'english' | '408' | 'free';
  subSubjectSnapshot: string | null;
  actualDurationSeconds: number;
  focusSessionId: string | null;
  taskId: string | null;
  courseEpisodeId: string | null;
  courseNameSnapshot: string | null;
  episodeTitleSnapshot: string | null;
  source: 'focus_session' | 'course_video';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSetting {
  accountId: string;
  key: string;
  value: string;
}

/** 本地词卡行：词卡字段 + accountId 归属（与其余本地 store 同惯例，对外返回前 strip） */
export type LocalVocabCard = VocabCard & { accountId: string };

/**
 * 词归一（trim + lowercase），语义与 shared 的 normalizeWord 逐字一致。
 * 客户端特意不直接值导入 `@shared/schemas/vocab`：该模块顶层构造 Zod schema，
 * 值导入会把 zod 运行时拖进前端产物，而 `e2e/check-perf-budget.mjs` 断言全部
 * assets/*.js 不得含 "invalid_type"（zod 不得泄漏进前端包）。全客户端只此一份实现。
 */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

/** 对外返回时剔除归属字段（与服务器响应一致，不暴露 user_id/accountId） */
export type Accountless<T> = Omit<T, 'accountId'>;