import { describe, it, expect } from 'vitest';
import { mapBackupData, MappingError } from './import-mapping.js';
import type { BackupFile } from '../../../shared/src/schemas/backup.js';

const data: BackupFile['data'] = {
  presets: [{ id: 'p1', name: '数学 25min', subject: 'math', subSubject: null, durationMinutes: 25, lastUsedAt: null, createdAt: '2026-08-01 08:00:00', updatedAt: '2026-08-01 08:00:00' }],
  tasks: [{ id: 't1', taskDate: '2026-08-16', content: '做题', subject: 'math', subSubject: null, isCompleted: false, isImportant: true, sortOrder: 0, createdAt: '2026-08-16 08:00:00', updatedAt: '2026-08-16 08:00:00' }],
  reviews: [{ id: 'r1', reviewDate: '2026-08-16', content: '复盘', createdAt: '2026-08-16 20:00:00', updatedAt: '2026-08-16 20:00:00' }],
  courses: [{ id: 'c1', name: '高数基础', subject: 'math', subSubject: null, createdAt: '2026-08-01 08:00:00', updatedAt: '2026-08-01 08:00:00' }],
  episodes: [{ id: 'e1', courseId: 'c1', title: '第1讲', durationSeconds: 1200, durationText: '20:00', sortOrder: 0, isCompleted: true, completedAt: '2026-08-16 10:00:00', createdAt: '2026-08-01 08:00:00', updatedAt: '2026-08-16 10:00:00' }],
  focusSessions: [{ id: 'f1', presetId: null, presetNameSnapshot: '数学 25min', subjectSnapshot: 'math', subSubjectSnapshot: null, plannedDurationSeconds: 1500, actualDurationSeconds: null, startedAt: '2026-08-16 09:00:00', plannedEndAt: '2026-08-16 09:25:00', completedAt: null, status: 'in_progress', source: 'pomodoro', courseEpisodeId: null, taskId: 't1', createdAt: '2026-08-16 09:00:00', updatedAt: '2026-08-16 09:00:00' }],
  studyRecords: [{ id: 's1', presetNameSnapshot: '数学 25min', subjectSnapshot: 'math', subSubjectSnapshot: null, actualDurationSeconds: 1500, focusSessionId: null, taskId: null, courseEpisodeId: null, courseNameSnapshot: null, episodeTitleSnapshot: null, source: 'focus_session', notes: null, createdAt: '2026-08-16 09:25:00', updatedAt: '2026-08-16 09:25:00' }],
  settings: [{ key: 'pomodoro_sound_enabled', value: '1' }],
  vocabCards: [{
    id: 'v1',
    word: 'Abandon',
    phonetic: '/əˈbændən/',
    definitions: [{ pos: 'v.', meaning: '放弃', hacker: 'x' }],
    examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。', extra: 'y' }],
    extra: null,
    examFreq: '高',
    masteryLevel: 2,
    intervalDays: 2,
    nextReviewDate: '2026-10-02',
    isMastered: false,
    firstLearnedAt: null,
    correctCount: 2,
    wrongCount: 0,
    lastReviewedAt: null,
    createdAt: '2026-09-30 08:00:00',
    updatedAt: '2026-09-30 08:00:00',
    hacker: 'x',
    user_id: 'other',
  }],
};

describe('mapBackupData', () => {
  it('合法条目映射为 snake_case 行（camelCase→snake_case）', () => {
    const mapped = mapBackupData(data);
    expect(mapped.presets[0]).toMatchObject({ id: 'p1', sub_subject: null, duration_minutes: 25 });
    expect(mapped.tasks[0]).toMatchObject({ task_date: '2026-08-16', is_completed: false, is_important: true });
    expect(mapped.episodes[0]).toMatchObject({ course_id: 'c1', duration_seconds: 1200, is_completed: true });
    expect(mapped.focusSessions[0]).toMatchObject({ actual_duration_seconds: null, status: 'in_progress', task_id: 't1' });
    expect(mapped.settings[0]).toMatchObject({ setting_key: 'pomodoro_sound_enabled', setting_value: '1' });
  });

  it('未知字段被丢弃（不进入映射结果）', () => {
    const evil = { ...data, tasks: [{ ...data.tasks[0]!, hacker: 'x', user_id: 'other' }] };
    const mapped = mapBackupData(evil);
    expect(mapped.tasks[0]).not.toHaveProperty('hacker');
    expect(mapped.tasks[0]).not.toHaveProperty('user_id');
  });

  it('布尔严格归一化：拒绝字符串 yes', () => {
    const bad = { ...data, tasks: [{ ...data.tasks[0]!, isCompleted: 'yes' }] };
    expect(() => mapBackupData(bad)).toThrow(MappingError);
  });

  it('整数严格归一化：拒绝小数与字符串数字', () => {
    const bad1 = { ...data, presets: [{ ...data.presets[0]!, durationMinutes: 25.5 }] };
    const bad2 = { ...data, presets: [{ ...data.presets[0]!, durationMinutes: '25' }] };
    expect(() => mapBackupData(bad1)).toThrow(MappingError);
    expect(() => mapBackupData(bad2)).toThrow(MappingError);
  });

  it('枚举严格校验：非法 subject/status/source 拒绝', () => {
    const bad1 = { ...data, tasks: [{ ...data.tasks[0]!, subject: 'chinese' }] };
    const bad2 = { ...data, focusSessions: [{ ...data.focusSessions[0]!, status: 'paused' }] };
    expect(() => mapBackupData(bad1)).toThrow(MappingError);
    expect(() => mapBackupData(bad2)).toThrow(MappingError);
  });

  it('subSubject 走枚举校验：非法拒绝、null 与合法值通过', () => {
    const bad = { ...data, presets: [{ ...data.presets[0]!, subSubject: 'invalid_subject' }] };
    const okNull = { ...data, presets: [{ ...data.presets[0]!, subSubject: null }] };
    const okValid = { ...data, presets: [{ ...data.presets[0]!, subSubject: 'data_structure' }] };
    expect(() => mapBackupData(bad)).toThrow(MappingError);
    expect(mapBackupData(okNull).presets[0]).toMatchObject({ sub_subject: null });
    expect(mapBackupData(okValid).presets[0]).toMatchObject({ sub_subject: 'data_structure' });
  });

  it('错误信息包含字段路径', () => {
    const bad = { ...data, tasks: [{ ...data.tasks[0]!, isCompleted: 'yes' }] };
    try {
      mapBackupData(bad);
      expect.unreachable('应抛出 MappingError');
    } catch (err) {
      expect(err).toBeInstanceOf(MappingError);
      const issues = (err as MappingError).issues;
      expect(issues[0]!.path).toContain('tasks');
      expect(issues[0]!.path).toContain('isCompleted');
    }
  });

  it('vocabCards：合法条目映射为 snake_case 行、word lowercase、多余键丢弃', () => {
    const mapped = mapBackupData(data);
    const card = mapped.vocabCards[0]!;
    expect(card).toMatchObject({
      id: 'v1',
      word: 'abandon',
      phonetic: '/əˈbændən/',
      extra: null,
      exam_freq: '高',
      mastery_level: 2,
      interval_days: 2,
      next_review_date: '2026-10-02',
      is_mastered: false,
      first_learned_at: null,
      correct_count: 2,
      wrong_count: 0,
      last_reviewed_at: null,
    });
    // definitions/examples 收窄为 JSON 字符串（插入 JSON 列用），条目内多余键被丢弃
    expect(JSON.parse(card.definitions as string)).toEqual([{ pos: 'v.', meaning: '放弃' }]);
    expect(JSON.parse(card.examples as string)).toEqual([{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }]);
    expect(card).not.toHaveProperty('hacker');
    expect(card).not.toHaveProperty('user_id');
  });

  it('vocabCards：masteryLevel 越界（9 或 -1）报 MappingError', () => {
    const bad = (masteryLevel: number) => ({
      ...data,
      vocabCards: [{ ...data.vocabCards![0]!, masteryLevel }],
    });
    expect(() => mapBackupData(bad(9))).toThrow(MappingError);
    expect(() => mapBackupData(bad(-1))).toThrow(MappingError);
  });

  it('vocabCards：examFreq 非法枚举拒绝、definitions 非数组拒绝', () => {
    const badEnum = { ...data, vocabCards: [{ ...data.vocabCards![0]!, examFreq: '极高' }] };
    const badDefs = { ...data, vocabCards: [{ ...data.vocabCards![0]!, definitions: 'v. 放弃' }] };
    expect(() => mapBackupData(badEnum)).toThrow(MappingError);
    expect(() => mapBackupData(badDefs)).toThrow(MappingError);
  });

  it('vocabCards：旧版备份省略该字段 → 空数组', () => {
    const legacy = { ...data };
    delete legacy.vocabCards;
    expect(mapBackupData(legacy).vocabCards).toEqual([]);
  });
});
