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

  it('vocabCards：word 归一为小写、白名单丢弃未知键、缺失可选字段归 null', () => {
    const file = backupFile({
      vocabCards: [
        {
          id: 'v1',
          word: '  Abandon ',
          phonetic: '/əˈbændən/',
          definitions: [{ pos: 'v.', meaning: '放弃', junk: 1 }],
          examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。', junk: 'x' }],
          extra: null,
          examFreq: '高',
          masteryLevel: 2,
          intervalDays: 2,
          nextReviewDate: '2026-10-02',
          isMastered: false,
          firstLearnedAt: '2026-09-29T02:00:00.000Z',
          correctCount: 3,
          wrongCount: 1,
          lastReviewedAt: '2026-09-30T02:00:00.000Z',
          createdAt: '2026-09-28T02:00:00.000Z',
          updatedAt: '2026-09-30T02:00:00.000Z',
          hacker: 'should be dropped',
          user_id: 'server-user',
        },
      ],
    });
    const mapped = mapLocalBackupData(file.data);
    expect(mapped.vocabCards).toHaveLength(1);
    expect(mapped.vocabCards[0]).toMatchObject({
      id: 'v1',
      word: 'abandon',
      phonetic: '/əˈbændən/',
      definitions: [{ pos: 'v.', meaning: '放弃' }],
      examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }],
      examFreq: '高',
      masteryLevel: 2,
      intervalDays: 2,
      nextReviewDate: '2026-10-02',
      isMastered: false,
      firstLearnedAt: '2026-09-29T02:00:00.000Z',
      correctCount: 3,
      wrongCount: 1,
    });
    expect(mapped.vocabCards[0].definitions[0]).not.toHaveProperty('junk');
    expect(mapped.vocabCards[0]).not.toHaveProperty('hacker');
    expect(mapped.vocabCards[0]).not.toHaveProperty('user_id');
    expect(mapped.vocabCards[0]).not.toHaveProperty('accountId');
  });

  it('vocabCards：服务器备份缺 updatedAt → 回落 createdAt；masteryLevel 越界抛 MappingError 带路径', () => {
    const base = {
      id: 'v1',
      word: 'abandon',
      definitions: [{ pos: 'v.', meaning: '放弃' }],
      examples: [{ en: 'a', zh: 'b' }],
      masteryLevel: 0,
      intervalDays: 0,
      nextReviewDate: '2026-10-01',
      isMastered: false,
      firstLearnedAt: null,
      correctCount: 0,
      wrongCount: 0,
      lastReviewedAt: null,
      createdAt: '2026-09-30T02:00:00.000Z',
    };
    const mapped = mapLocalBackupData(backupFile({ vocabCards: [base] }).data);
    expect(mapped.vocabCards[0].updatedAt).toBe('2026-09-30T02:00:00.000Z');

    try {
      mapLocalBackupData(backupFile({ vocabCards: [{ ...base, masteryLevel: 9 }] }).data);
      expect.unreachable('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(MappingError);
      expect((e as MappingError).issues[0].path).toBe('data.vocabCards[0].masteryLevel');
    }
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
      vocabCards: { ids: [], words: [] },
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
        vocabCards: [],
      },
      keys
    );
    expect(diff.reviews).toEqual({ added: 0, updated: 1, kept: 1 });
  });

  it('vocabCards 按 id 与 word: 复合候选键（word 命中即 updated）', () => {
    const keys: LocalExistingKeys = {
      presets: [],
      tasks: [],
      reviews: { ids: [], dates: [] },
      courses: [],
      episodes: [],
      focusSessions: [],
      studyRecords: [],
      settings: [],
      vocabCards: { ids: ['v-id'], words: ['abandon', 'legacy'] },
    };
    const vocabCard = {
      id: 'x',
      word: 'w',
      phonetic: null,
      definitions: [{ pos: 'v.', meaning: 'm' }],
      examples: [{ en: 'a', zh: 'b' }],
      extra: null,
      examFreq: null,
      masteryLevel: 0,
      intervalDays: 0,
      nextReviewDate: '2026-10-01',
      isMastered: false,
      firstLearnedAt: null,
      correctCount: 0,
      wrongCount: 0,
      lastReviewedAt: null,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    };
    const diff = computeDiffSummary(
      {
        presets: [],
        tasks: [],
        reviews: [],
        courses: [],
        episodes: [],
        focusSessions: [],
        studyRecords: [],
        settings: [],
        vocabCards: [
          { ...vocabCard, id: 'v-id', word: 'other' }, // id 命中 → updated
          { ...vocabCard, id: 'new-id', word: 'abandon' }, // word 命中 → updated
          { ...vocabCard, id: 'added-id', word: 'benefit' }, // 均未命中 → added
        ],
      },
      keys
    );
    expect(diff.vocabCards).toEqual({ added: 1, updated: 2, kept: 1 });
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
      vocabCards: { ids: [], words: [] },
    };
    const diff = computeDiffSummary(
      { presets: [{ ...baseRow, name: 'p', subject: 'math', subSubject: null, durationMinutes: 25, lastUsedAt: null }], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [], vocabCards: [] },
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