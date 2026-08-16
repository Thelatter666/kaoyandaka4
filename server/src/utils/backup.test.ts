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
  focusSessions: [],
  studyRecords: [],
  settings: [{ setting_key: 'pomodoro_sound_enabled', setting_value: '1' }],
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
    const empty = { presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [] };
    const payload = buildBackupPayload(accountRow, empty);
    expect(payload.data.reviews).toEqual([]);
    expect(Object.keys(payload.data)).toEqual([
      'presets', 'tasks', 'reviews', 'courses', 'episodes', 'focusSessions', 'studyRecords', 'settings',
    ]);
  });

  it('产出通过 BackupFileSchema 校验', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(BackupFileSchema.safeParse(payload).success).toBe(true);
  });
});
