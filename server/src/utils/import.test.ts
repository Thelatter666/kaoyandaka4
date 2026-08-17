import { describe, it, expect } from 'vitest';
import {
  computeDiffCounts, computeDiffSummary, resolveImportTarget, buildInsertSql, collectConflictKeys, TABLE_DEFS,
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

describe('buildInsertSql', () => {
  it('生成纯批量 INSERT（无 ON DUPLICATE KEY UPDATE，杜绝跨账号串号）', () => {
    const rows = [{ id: 'a', content: 'x', sort_order: 1 }, { id: 'b', content: 'y', sort_order: 2 }];
    const r = buildInsertSql('daily_tasks', rows);
    expect(r).not.toBeNull();
    expect(r!.sql).toContain('INSERT INTO daily_tasks (id, content, sort_order) VALUES');
    expect(r!.sql).not.toContain('ON DUPLICATE KEY UPDATE');
    expect(r!.params).toEqual(['a', 'x', 1, 'b', 'y', 2]);
  });

  it('空行返回 null', () => {
    expect(buildInsertSql('daily_tasks', [])).toBeNull();
  });

  it('TABLE_DEFS 覆盖 8 表（仅表名，无 updateColumns）', () => {
    expect(Object.keys(TABLE_DEFS)).toEqual(['presets', 'tasks', 'reviews', 'courses', 'episodes', 'focusSessions', 'studyRecords', 'settings']);
    expect(TABLE_DEFS.presets).toEqual({ table: 'study_presets' });
    expect('updateColumns' in TABLE_DEFS.reviews).toBe(false);
  });
});

describe('collectConflictKeys', () => {
  it('普通表（id 模式）：按全局主键 id 删除', () => {
    const rows = [
      { user_id: 'u1', id: 'a', content: 'x' },
      { user_id: 'u1', id: 'b', content: 'y' },
    ];
    const dels = collectConflictKeys('daily_tasks', rows, 'id');
    expect(dels).toHaveLength(1);
    expect(dels[0]!.sql).toBe('DELETE FROM daily_tasks WHERE user_id = ? AND id IN (?, ?)');
    expect(dels[0]!.params).toEqual(['u1', 'a', 'b']);
  });

  it('reviews（review 模式）：先按 id、再按 review_date 两条删除', () => {
    const rows = [
      { user_id: 'u1', id: 'r1', review_date: '2026-08-16' },
      { user_id: 'u1', id: 'r2', review_date: '2026-08-17' },
    ];
    const dels = collectConflictKeys('daily_reviews', rows, 'review');
    expect(dels).toHaveLength(2);
    expect(dels[0]!.sql).toContain('AND id IN (?, ?)');
    expect(dels[0]!.params).toEqual(['u1', 'r1', 'r2']);
    expect(dels[1]!.sql).toBe('DELETE FROM daily_reviews WHERE user_id = ? AND review_date IN (?, ?)');
    expect(dels[1]!.params).toEqual(['u1', '2026-08-16', '2026-08-17']);
  });

  it('settings（setting 模式）：按联合主键 setting_key 删除', () => {
    const rows = [
      { user_id: 'u1', setting_key: 'theme', setting_value: 'dark' },
      { user_id: 'u1', setting_key: 'pomodoro_sound_enabled', setting_value: '1' },
    ];
    const dels = collectConflictKeys('user_settings', rows, 'setting');
    expect(dels).toHaveLength(1);
    expect(dels[0]!.sql).toBe('DELETE FROM user_settings WHERE user_id = ? AND setting_key IN (?, ?)');
    expect(dels[0]!.params).toEqual(['u1', 'theme', 'pomodoro_sound_enabled']);
  });

  it('空行返回 []', () => {
    expect(collectConflictKeys('daily_tasks', [], 'id')).toEqual([]);
    expect(collectConflictKeys('daily_reviews', [], 'review')).toEqual([]);
    expect(collectConflictKeys('user_settings', [], 'setting')).toEqual([]);
  });
});
