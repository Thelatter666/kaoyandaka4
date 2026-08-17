import { describe, it, expect } from 'vitest';
import type { BackupFile } from '@shared/types';
import {
  computeDiffCounts,
  computeDiffSummary,
  mapLocalBackupData,
  MappingError,
  resolveLocalImportTarget,
  type LocalExistingKeys,
} from './localImport';
import type { LocalAccount } from '../local/types';

const baseRow = { id: 'a', createdAt: '2026-08-01 00:00:00', updatedAt: '2026-08-01 00:00:00' };

const account: LocalAccount = {
  accountId: 'acct-1',
  email: 'test@example.com',
  createdAt: '2026-08-01 00:00:00',
};

function backupFile(data: Partial<BackupFile['data']> = {}): BackupFile {
  return {
    format: 'kaoyandaily-backup',
    schemaVersion: 1,
    exportedAt: '2026-08-17T00:00:00.000Z',
    account: { email: 'test@example.com', passwordHash: 'x', createdAt: '2026-08-01 00:00:00' },
    data: {
      presets: [],
      tasks: [],
      reviews: [],
      courses: [],
      episodes: [],
      focusSessions: [],
      studyRecords: [],
      settings: [],
      ...data,
    },
  };
}

describe('mapLocalBackupData', () => {
  it('映射合法条目并丢弃未知键', () => {
    const file = backupFile({
      presets: [
        { ...baseRow, name: '数学', subject: 'math', subSubject: null, durationMinutes: 25, lastUsedAt: null, extra: 'junk' },
      ],
    });
    const mapped = mapLocalBackupData(file.data);
    expect(mapped.presets).toHaveLength(1);
    expect(mapped.presets[0]).toMatchObject({
      id: 'a',
      name: '数学',
      subject: 'math',
      subSubject: null,
      durationMinutes: 25,
      lastUsedAt: null,
    });
    expect(mapped.presets[0]).not.toHaveProperty('extra');
  });

  it('布尔宽松：1/0/true/false 均归一为 boolean', () => {
    const file = backupFile({
      tasks: [
        { ...baseRow, taskDate: '2026-08-17', content: 't', subject: 'math', subSubject: null, isCompleted: 1, isImportant: '0', sortOrder: 0 },
      ],
      episodes: [
        { ...baseRow, courseId: 'c1', title: 'ep', durationSeconds: 60, durationText: '01:00', sortOrder: 0, isCompleted: '1', completedAt: null },
      ],
    });
    const mapped = mapLocalBackupData(file.data);
    expect(mapped.tasks[0].isCompleted).toBe(true);
    expect(mapped.tasks[0].isImportant).toBe(false);
    expect(mapped.episodes[0].isCompleted).toBe(true);
  });

  it('非法枚举抛 MappingError 且携带路径', () => {
    const file = backupFile({
      presets: [{ ...baseRow, name: 'x', subject: 'physics', subSubject: null, durationMinutes: 25, lastUsedAt: null }],
    });
    try {
      mapLocalBackupData(file.data);
      expect.unreachable('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(MappingError);
      expect((e as MappingError).issues[0].path).toBe('data.presets[0].subject');
    }
  });

  it('缺 id 抛 MappingError', () => {
    const file = backupFile({
      tasks: [{ taskDate: '2026-08-17', content: 't', subject: 'math', subSubject: null, isCompleted: false, isImportant: false, sortOrder: 0, createdAt: 'x', updatedAt: 'x' }] as unknown as BackupFile['data']['tasks'],
    });
    expect(() => mapLocalBackupData(file.data)).toThrow(MappingError);
  });
});

describe('computeDiffCounts（服务器口径）', () => {
  it('新增/更新/保留统计', () => {
    const res = computeDiffCounts(
      [['id1'], ['id2'], ['id1', 'alt2']], // id1/id2 与 alt2 命中已有 → updated；无候选行 → 不产生 added
      new Set(['id1', 'id2', 'existing-only'])
    );
    expect(res).toEqual({ added: 0, updated: 3, kept: 1 });
  });

  it('reviews 按 id 与日期双键', () => {
    const keys: LocalExistingKeys = {
      presets: [],
      tasks: [],
      reviews: { ids: ['r1'], dates: ['2026-08-17'] },
      courses: [],
      episodes: [],
      focusSessions: [],
      studyRecords: [],
      settings: [],
    };
    const diff = computeDiffSummary(
      {
        presets: [],
        tasks: [],
        reviews: [{ ...baseRow, reviewDate: '2026-08-17', content: 'x' }], // 日期冲突 → updated
        courses: [],
        episodes: [],
        focusSessions: [],
        studyRecords: [],
        settings: [],
      },
      keys
    );
    expect(diff.reviews).toEqual({ added: 0, updated: 1, kept: 1 });
  });

  it('空库全新增', () => {
    const empty: LocalExistingKeys = {
      presets: [],
      tasks: [],
      reviews: { ids: [], dates: [] },
      courses: [],
      episodes: [],
      focusSessions: [],
      studyRecords: [],
      settings: [],
    };
    const diff = computeDiffSummary(
      { presets: [{ ...baseRow, name: 'p', subject: 'math', subSubject: null, durationMinutes: 25, lastUsedAt: null }], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [] },
      empty
    );
    expect(diff.presets).toEqual({ added: 1, updated: 0, kept: 0 });
  });
});

describe('resolveLocalImportTarget', () => {
  it('未激活 + 邮箱空闲 → 建号', () => {
    const res = resolveLocalImportTarget({ activeAccount: null, existingByEmail: null, fileEmail: 'a@b.com' });
    expect(res.ok).toBe(true);
    expect(res.target).toEqual({ kind: 'create', email: 'a@b.com' });
    expect(res.existingAccount).toBe(false);
  });

  it('未激活 + 邮箱占用 → EMAIL_TAKEN', () => {
    const res = resolveLocalImportTarget({ activeAccount: null, existingByEmail: account, fileEmail: 'a@b.com' });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('EMAIL_TAKEN');
  });

  it('已激活 + 邮箱不符 → EMAIL_MISMATCH', () => {
    const res = resolveLocalImportTarget({ activeAccount: account, existingByEmail: null, fileEmail: 'other@b.com' });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('EMAIL_MISMATCH');
  });

  it('已激活 + 邮箱一致（大小写不敏感）→ 归入当前账户', () => {
    const res = resolveLocalImportTarget({ activeAccount: account, existingByEmail: account, fileEmail: 'TEST@Example.COM' });
    expect(res.ok).toBe(true);
    expect(res.target).toEqual({ kind: 'existing', accountId: 'acct-1' });
    expect(res.existingAccount).toBe(true);
  });
});