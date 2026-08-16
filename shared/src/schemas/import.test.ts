import { describe, it, expect } from 'vitest';
import { ImportModeSchema, DiffSummarySchema, ImportPreviewResponseSchema, ImportRequestSchema } from './import.js';

const diff = {
  presets: { added: 1, updated: 0, kept: 0 },
  tasks: { added: 10, updated: 2, kept: 3 },
  reviews: { added: 1, updated: 1, kept: 0 },
  courses: { added: 1, updated: 0, kept: 0 },
  episodes: { added: 5, updated: 0, kept: 0 },
  focusSessions: { added: 8, updated: 0, kept: 0 },
  studyRecords: { added: 20, updated: 0, kept: 0 },
  settings: { added: 1, updated: 0, kept: 0 },
};

const validFile = {
  format: 'kaoyandaily-backup',
  schemaVersion: 1,
  exportedAt: '2026-08-16T08:00:00.000Z',
  account: { email: 'user@example.com', passwordHash: '$2b$10$OiyuEDFLLscTo1RkMg.86Ouwt4/H2eCII0k4rcVqBeqrgCNLTXQ0G', createdAt: '2026-07-20T05:00:00.000Z' },
  data: { presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [] },
};

describe('ImportModeSchema', () => {
  it('接受 overwrite / merge', () => {
    expect(ImportModeSchema.safeParse('overwrite').success).toBe(true);
    expect(ImportModeSchema.safeParse('merge').success).toBe(true);
  });
  it('拒绝其他值', () => {
    expect(ImportModeSchema.safeParse('delete').success).toBe(false);
  });
});

describe('DiffSummarySchema', () => {
  it('接受完整 diff', () => {
    expect(DiffSummarySchema.safeParse(diff).success).toBe(true);
  });
  it('拒绝负计数', () => {
    expect(DiffSummarySchema.safeParse({ ...diff, presets: { added: -1, updated: 0, kept: 0 } }).success).toBe(false);
  });
});

describe('ImportPreviewResponseSchema', () => {
  it('接受合法响应', () => {
    const res = { accountEmail: 'user@example.com', modeOptions: ['overwrite', 'merge'], diff, existingAccount: false };
    expect(ImportPreviewResponseSchema.safeParse(res).success).toBe(true);
  });
  it('未登录时 modeOptions 可仅含 merge', () => {
    const res = { accountEmail: 'user@example.com', modeOptions: ['merge'], diff, existingAccount: false };
    expect(ImportPreviewResponseSchema.safeParse(res).success).toBe(true);
  });
});

describe('ImportRequestSchema', () => {
  it('mode 可省略（未登录场景）', () => {
    expect(ImportRequestSchema.safeParse(validFile).success).toBe(true);
  });
  it('mode 可选 overwrite/merge', () => {
    expect(ImportRequestSchema.safeParse({ ...validFile, mode: 'overwrite' }).success).toBe(true);
    expect(ImportRequestSchema.safeParse({ ...validFile, mode: 'merge' }).success).toBe(true);
    expect(ImportRequestSchema.safeParse({ ...validFile, mode: 'other' }).success).toBe(false);
  });
});
