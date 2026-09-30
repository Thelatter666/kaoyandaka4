import { describe, it, expect } from 'vitest';
import { buildBackupPayload } from './backup.js';
import { BackupFileSchema } from '../../../shared/src/schemas/backup.js';

const accountRow = { email: 'user@example.com', password_hash: '$2b$10$abc', created_at: '2026-07-20 05:00:00' };

const rows = {
  presets: [],
  tasks: [{
    id: 'task-1',
    task_date: '2026-08-16',
    content: '做高数题',
    subject: 'math',
    sub_subject: null,
    is_completed: 0,
    is_important: 1,
    sort_order: 2,
    created_at: '2026-08-16 08:00:00',
    updated_at: '2026-08-16 09:00:00',
  }],
  reviews: [],
  courses: [],
  episodes: [],
  focusSessions: [
    {
      id: 'focus-1',
      preset_id: 'preset-1',
      preset_name_snapshot: '学习',
      subject_snapshot: 'math',
      sub_subject_snapshot: null,
      planned_duration_seconds: 1500,
      actual_duration_seconds: null,
      started_at: '2026-08-16 09:00:00',
      planned_end_at: '2026-08-16 09:25:00',
      completed_at: null,
      status: 'in_progress',
      source: 'preset',
      course_episode_id: null,
      task_id: null,
      created_at: '2026-08-16 09:00:00',
      updated_at: '2026-08-16 09:00:00',
    },
    {
      id: 'focus-2',
      preset_id: 'preset-1',
      preset_name_snapshot: '学习',
      subject_snapshot: 'math',
      sub_subject_snapshot: null,
      planned_duration_seconds: 1500,
      actual_duration_seconds: 1500,
      started_at: '2026-08-16 10:00:00',
      planned_end_at: '2026-08-16 10:25:00',
      completed_at: '2026-08-16 10:25:00',
      status: 'completed',
      source: 'preset',
      course_episode_id: null,
      task_id: null,
      created_at: '2026-08-16 10:00:00',
      updated_at: '2026-08-16 10:25:00',
    },
  ],
  studyRecords: [],
  settings: [{ setting_key: 'pomodoro_sound_enabled', setting_value: '1' }],
  vocabCards: [{
    id: 'v1',
    word: 'abandon',
    phonetic: '/əˈbændən/',
    definitions: JSON.stringify([{ pos: 'v.', meaning: '放弃' }, { pos: 'n.', meaning: '放任' }]),
    examples: JSON.stringify([{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }]),
    extra: '**词根**：a- + band（禁令）→ 放弃',
    exam_freq: '高',
    mastery_level: 3,
    interval_days: 4,
    next_review_date: '2026-10-04',
    is_mastered: 0,
    first_learned_at: '2026-09-30 08:00:00',
    correct_count: 3,
    wrong_count: 1,
    last_reviewed_at: '2026-09-30 08:00:00',
    created_at: '2026-09-29 07:00:00',
    updated_at: '2026-09-30 08:00:00',
  }],
};

describe('buildBackupPayload', () => {
  it('字段映射 snake_case → camelCase 且不含 user_id', () => {
    const payload = buildBackupPayload(accountRow, rows);
    const task = payload.data.tasks[0]!;
    expect(task.taskDate).toBe('2026-08-16');
    expect(task.sortOrder).toBe(2);
    expect(JSON.stringify(payload)).not.toContain('user_id');
    expect(JSON.stringify(payload)).not.toContain('task_date');
  });

  it('布尔字段归一化为 boolean', () => {
    const payload = buildBackupPayload(accountRow, rows);
    const task = payload.data.tasks[0]!;
    expect(task.isCompleted).toBe(false);
    expect(task.isImportant).toBe(true);
  });

  it('account 映射为 { email, passwordHash, createdAt }', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(payload.account).toEqual({
      email: 'user@example.com',
      passwordHash: '$2b$10$abc',
      createdAt: '2026-07-20 05:00:00',
    });
  });

  it('settings 映射为 { key, value }', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(payload.data.settings).toEqual([{ key: 'pomodoro_sound_enabled', value: '1' }]);
  });

  it('空资源导出为空数组且结构键齐全', () => {
    const empty = { presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [], vocabCards: [] };
    const payload = buildBackupPayload(accountRow, empty);
    expect(payload.data.reviews).toEqual([]);
    expect(payload.data.vocabCards).toEqual([]);
    expect(Object.keys(payload.data)).toEqual([
      'presets', 'tasks', 'reviews', 'courses', 'episodes', 'focusSessions', 'studyRecords', 'settings', 'vocabCards',
    ]);
  });

  it('vocabCards：camelCase 产出、无 user_id / snake_case 键、JSON 反序列化为数组', () => {
    const payload = buildBackupPayload(accountRow, rows);
    const card = payload.data.vocabCards![0]!;
    expect(card).toEqual({
      id: 'v1',
      word: 'abandon',
      phonetic: '/əˈbændən/',
      definitions: [{ pos: 'v.', meaning: '放弃' }, { pos: 'n.', meaning: '放任' }],
      examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }],
      extra: '**词根**：a- + band（禁令）→ 放弃',
      examFreq: '高',
      masteryLevel: 3,
      intervalDays: 4,
      nextReviewDate: '2026-10-04',
      isMastered: false,
      firstLearnedAt: '2026-09-30 08:00:00',
      correctCount: 3,
      wrongCount: 1,
      lastReviewedAt: '2026-09-30 08:00:00',
      createdAt: '2026-09-29 07:00:00',
      updatedAt: '2026-09-30 08:00:00',
    });
    expect(Array.isArray(card.definitions)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('user_id');
    expect(JSON.stringify(payload)).not.toContain('mastery_level');
    expect(JSON.stringify(payload)).not.toContain('next_review_date');
  });

  it('vocabCards：mysql2 已解析为 JS 值的 JSON 列同样原样导出', () => {
    const parsedRows = {
      ...rows,
      vocabCards: [{ ...rows.vocabCards[0]!, definitions: [{ pos: 'v.', meaning: '放弃' }], examples: [{ en: 'a', zh: 'b' }] }],
    };
    const payload = buildBackupPayload(accountRow, parsedRows);
    expect(payload.data.vocabCards![0]!.definitions).toEqual([{ pos: 'v.', meaning: '放弃' }]);
  });

  it('focus 会话可空 actual_duration_seconds 原样导出为 null / 数值', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(payload.data.focusSessions[0]!.actualDurationSeconds).toBe(null);
    expect(payload.data.focusSessions[1]!.actualDurationSeconds).toBe(1500);
  });

  it('产出通过 BackupFileSchema 校验', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(BackupFileSchema.safeParse(payload).success).toBe(true);
  });
});
