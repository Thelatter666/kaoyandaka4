import { describe, it, expect } from 'vitest';
import {
  computeDiffCounts, computeDiffSummary, resolveImportTarget, buildUpsertSql, TABLE_DEFS,
} from './import.js';
import type { MappedData } from './import-mapping.js';

const emptyMapped: MappedData = {
  presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [],
};

describe('computeDiffCounts', () => {
  it('added/updated/kept 统计正确（普通表：按 id）', () => {
    const fileKeys = [['a'], ['b'], ['c']];
    const existing = new Set(['b', 'c', 'd']);
    expect(computeDiffCounts(fileKeys, existing)).toEqual({ added: 1, updated: 2, kept: 1 });
  });

  it('reviews 复合键：id 或 reviewDate 任一冲突即 updated', () => {
    const fileKeys = [['r1', 'date:2026-08-16'], ['r2', 'date:2026-08-17']];
    const existing = new Set(['r9', 'date:2026-08-16']);
    // r1：id 不冲突但 date 冲突 → updated；r2：全不冲突 → added；kept：r9 不在文件键 → 1
    expect(computeDiffCounts(fileKeys, existing)).toEqual({ added: 1, updated: 1, kept: 1 });
  });
});

describe('computeDiffSummary', () => {
  it('汇总 8 资源（reviews 用复合键、settings 用 key）', () => {
    const fileData: MappedData = {
      ...emptyMapped,
      tasks: [{ id: 't1' }, { id: 't2' }],
      reviews: [{ id: 'r1', review_date: '2026-08-16' }],
      settings: [{ setting_key: 'pomodoro_sound_enabled' }],
    };
    const existing = {
      presets: [], tasks: ['t1', 't9'], reviews: { ids: [], dates: ['2026-08-16'] },
      courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: ['theme'],
    };
    const summary = computeDiffSummary(fileData, existing);
    expect(summary.tasks).toEqual({ added: 1, updated: 1, kept: 1 });
    expect(summary.reviews).toEqual({ added: 0, updated: 1, kept: 0 });
    expect(summary.settings).toEqual({ added: 1, updated: 0, kept: 1 });
    expect(summary.presets).toEqual({ added: 0, updated: 0, kept: 0 });
  });
});

describe('resolveImportTarget', () => {
  const fileEmail = 'user@example.com';

  it('未登录 + 邮箱未占用 → create', () => {
    const d = resolveImportTarget({ sessionUserId: undefined, fileEmail, filePasswordHash: 'h', fileCreatedAt: 'c', existingAccountByEmail: null, currentUser: null });
    expect(d.ok).toBe(true);
    expect(d.target).toEqual({ kind: 'create', fileEmail, filePasswordHash: 'h', fileCreatedAt: 'c' });
    expect(d.existingAccount).toBe(false);
  });

  it('未登录 + 邮箱已占用 → EMAIL_TAKEN', () => {
    const d = resolveImportTarget({ sessionUserId: undefined, fileEmail, filePasswordHash: 'h', fileCreatedAt: 'c', existingAccountByEmail: { id: 'x', email: fileEmail }, currentUser: null });
    expect(d.ok).toBe(false);
    expect(d.errorCode).toBe('EMAIL_TAKEN');
  });

  it('已登录 + 邮箱一致 → existing', () => {
    const d = resolveImportTarget({ sessionUserId: 'u1', fileEmail, filePasswordHash: 'h', fileCreatedAt: 'c', existingAccountByEmail: { id: 'u1', email: fileEmail }, currentUser: { id: 'u1', email: fileEmail } });
    expect(d.ok).toBe(true);
    expect(d.target).toEqual({ kind: 'existing', userId: 'u1' });
  });

  it('已登录 + 邮箱不一致 → EMAIL_MISMATCH', () => {
    const d = resolveImportTarget({ sessionUserId: 'u1', fileEmail, filePasswordHash: 'h', fileCreatedAt: 'c', existingAccountByEmail: null, currentUser: { id: 'u1', email: 'other@example.com' } });
    expect(d.ok).toBe(false);
    expect(d.errorCode).toBe('EMAIL_MISMATCH');
  });
});

describe('buildUpsertSql', () => {
  it('生成批量 upsert SQL（列固定、参数展开、更新列 VALUES）', () => {
    const rows = [{ id: 'a', content: 'x', sort_order: 1 }, { id: 'b', content: 'y', sort_order: 2 }];
    const r = buildUpsertSql('daily_tasks', rows, ['content', 'sort_order']);
    expect(r).not.toBeNull();
    expect(r!.sql).toContain('INSERT INTO daily_tasks (id, content, sort_order) VALUES');
    expect(r!.sql).toContain('ON DUPLICATE KEY UPDATE content=VALUES(content), sort_order=VALUES(sort_order)');
    expect(r!.params).toEqual(['a', 'x', 1, 'b', 'y', 2]);
  });

  it('空行返回 null', () => {
    expect(buildUpsertSql('daily_tasks', [], ['content'])).toBeNull();
  });

  it('TABLE_DEFS 覆盖 8 表且 reviews 更新列不含 id', () => {
    expect(Object.keys(TABLE_DEFS)).toEqual(['presets', 'tasks', 'reviews', 'courses', 'episodes', 'focusSessions', 'studyRecords', 'settings']);
    expect(TABLE_DEFS.reviews.updateColumns).not.toContain('id');
  });
});
