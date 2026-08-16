import { describe, it, expect } from 'vitest';
import { BackupFileSchema } from './backup.js';

const validPayload = {
  format: 'kaoyandaily-backup',
  schemaVersion: 1,
  exportedAt: '2026-08-16T08:00:00.000Z',
  account: { email: 'user@example.com', passwordHash: '$2b$10$abc', createdAt: '2026-07-20T05:00:00.000Z' },
  data: {
    presets: [],
    tasks: [{
      id: 'task-1',
      taskDate: '2026-08-16',
      content: '做高数题',
      subject: 'math',
      subSubject: null,
      isCompleted: false,
      isImportant: true,
      sortOrder: 0,
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    }],
    reviews: [],
    courses: [],
    episodes: [],
    focusSessions: [],
    studyRecords: [],
    settings: [{ key: 'pomodoro_sound_enabled', value: '1' }],
  },
};

describe('BackupFileSchema', () => {
  it('接受合法的导出文件 payload', () => {
    expect(BackupFileSchema.safeParse(validPayload).success).toBe(true);
  });

  it('拒绝错误的 format 字面量', () => {
    expect(BackupFileSchema.safeParse({ ...validPayload, format: 'other' }).success).toBe(false);
  });

  it('拒绝错误的 schemaVersion', () => {
    expect(BackupFileSchema.safeParse({ ...validPayload, schemaVersion: 2 }).success).toBe(false);
  });

  it('settings 条目必须有 key 与 value 字符串', () => {
    const bad = { ...validPayload, data: { ...validPayload.data, settings: [{ key: 'k' }] } };
    expect(BackupFileSchema.safeParse(bad).success).toBe(false);
  });
});
