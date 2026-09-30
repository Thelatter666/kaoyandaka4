import type { BackupFile } from '../../../shared/src/schemas/backup.js';
import { SubjectEnum, SubSubjectEnum } from '../../../shared/src/schemas/common.js';
import { normalizeWord } from '../../../shared/src/schemas/vocab.js';
import { VOCAB_MASTERY_MAX } from '../../../shared/src/constants.js';

/**
 * 导入字段白名单严格映射（camelCase 条目 → snake_case DB 行）。
 * 只取已知字段（未知键丢弃）；类型严格归一化（非法整体 400，事务回滚）。
 */

export interface MappingIssue {
  path: string;
  message: string;
}

export class MappingError extends Error {
  constructor(public issues: MappingIssue[]) {
    super('导入数据校验失败');
    this.name = 'MappingError';
  }
}

type Row = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new MappingError([{ path, message }]);
}

const strRequired = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v.length === 0) fail(path, '必须为非空字符串');
  return v;
};

const strNullable = (v: unknown, path: string): string | null => {
  if (v === null || v === undefined) return null;
  return strRequired(v, path);
};

const boolStrict = (v: unknown, path: string): boolean => {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  fail(path, '必须为布尔值（true/false/1/0）');
};

const intRequired = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(path, '必须为整数');
  return v;
};

const intNullable = (v: unknown, path: string): number | null => {
  if (v === null || v === undefined) return null;
  return intRequired(v, path);
};

const enumStrict = (allowed: readonly string[]) => (v: unknown, path: string): string => {
  const s = strRequired(v, path);
  if (!allowed.includes(s)) fail(path, `必须为 ${allowed.join('/')}`);
  return s;
};

const enumNullable = (allowed: readonly string[]) => (v: unknown, path: string): string | null => {
  if (v === null || v === undefined) return null;
  return enumStrict(allowed)(v, path);
};

const SUBJECTS = SubjectEnum.options;
const SUB_SUBJECTS = SubSubjectEnum.options;
const SESSION_SUBJECTS = ['math', 'english', '408', 'free'] as const;
const FOCUS_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;
const FOCUS_SOURCES = ['pomodoro', 'plan', 'course'] as const;
const RECORD_SOURCES = ['focus_session', 'course_video'] as const;
const EXAM_FREQS = ['高', '中', '低'] as const;

/** 非负整数：整数校验之外附加下限校验（词卡计数/间隔字段） */
const intNonNegative = (v: unknown, path: string): number => {
  const n = intRequired(v, path);
  if (n < 0) fail(path, '不能为负数');
  return n;
};

/**
 * JSON 数组列（definitions/examples）：必须为数组，逐项按白名单收窄（多余键丢弃），
 * 返回序列化后的 JSON 字符串——mysql2 不会把 JS 数组按 JSON 写入列，插入前需 stringify。
 */
const jsonArrayRequired = (
  v: unknown,
  path: string,
  mapItem: (item: Record<string, unknown>, itemPath: string) => Record<string, string>
): string => {
  if (!Array.isArray(v)) fail(path, '必须为数组');
  return JSON.stringify(
    v.map((item, i) => {
      if (typeof item !== 'object' || item === null) fail(`${path}[${i}]`, '必须为对象');
      return mapItem(item as Record<string, unknown>, `${path}[${i}]`);
    })
  );
};

const mapPreset = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  name: strRequired(e.name, `${p}.name`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`),
  sub_subject: enumNullable(SUB_SUBJECTS)(e.subSubject, `${p}.subSubject`),
  duration_minutes: intRequired(e.durationMinutes, `${p}.durationMinutes`),
  last_used_at: strNullable(e.lastUsedAt, `${p}.lastUsedAt`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapTask = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  task_date: strRequired(e.taskDate, `${p}.taskDate`),
  content: strRequired(e.content, `${p}.content`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`),
  sub_subject: enumNullable(SUB_SUBJECTS)(e.subSubject, `${p}.subSubject`),
  is_completed: boolStrict(e.isCompleted, `${p}.isCompleted`),
  is_important: boolStrict(e.isImportant, `${p}.isImportant`),
  sort_order: intRequired(e.sortOrder, `${p}.sortOrder`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapReview = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  review_date: strRequired(e.reviewDate, `${p}.reviewDate`),
  content: strRequired(e.content, `${p}.content`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapCourse = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  name: strRequired(e.name, `${p}.name`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`),
  sub_subject: enumNullable(SUB_SUBJECTS)(e.subSubject, `${p}.subSubject`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapEpisode = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  course_id: strRequired(e.courseId, `${p}.courseId`),
  title: strRequired(e.title, `${p}.title`),
  duration_seconds: intRequired(e.durationSeconds, `${p}.durationSeconds`),
  duration_text: strRequired(e.durationText, `${p}.durationText`),
  sort_order: intRequired(e.sortOrder, `${p}.sortOrder`),
  is_completed: boolStrict(e.isCompleted, `${p}.isCompleted`),
  completed_at: strNullable(e.completedAt, `${p}.completedAt`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapFocusSession = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  preset_id: strNullable(e.presetId, `${p}.presetId`),
  preset_name_snapshot: strRequired(e.presetNameSnapshot, `${p}.presetNameSnapshot`),
  subject_snapshot: enumStrict(SESSION_SUBJECTS)(e.subjectSnapshot, `${p}.subjectSnapshot`),
  sub_subject_snapshot: enumNullable(SUB_SUBJECTS)(e.subSubjectSnapshot, `${p}.subSubjectSnapshot`),
  planned_duration_seconds: intRequired(e.plannedDurationSeconds, `${p}.plannedDurationSeconds`),
  actual_duration_seconds: intNullable(e.actualDurationSeconds, `${p}.actualDurationSeconds`),
  started_at: strRequired(e.startedAt, `${p}.startedAt`),
  planned_end_at: strRequired(e.plannedEndAt, `${p}.plannedEndAt`),
  completed_at: strNullable(e.completedAt, `${p}.completedAt`),
  status: enumStrict(FOCUS_STATUSES)(e.status, `${p}.status`),
  source: enumStrict(FOCUS_SOURCES)(e.source, `${p}.source`),
  course_episode_id: strNullable(e.courseEpisodeId, `${p}.courseEpisodeId`),
  task_id: strNullable(e.taskId, `${p}.taskId`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapStudyRecord = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  preset_name_snapshot: strRequired(e.presetNameSnapshot, `${p}.presetNameSnapshot`),
  subject_snapshot: enumStrict(SESSION_SUBJECTS)(e.subjectSnapshot, `${p}.subjectSnapshot`),
  sub_subject_snapshot: enumNullable(SUB_SUBJECTS)(e.subSubjectSnapshot, `${p}.subSubjectSnapshot`),
  actual_duration_seconds: intRequired(e.actualDurationSeconds, `${p}.actualDurationSeconds`),
  focus_session_id: strNullable(e.focusSessionId, `${p}.focusSessionId`),
  task_id: strNullable(e.taskId, `${p}.taskId`),
  course_episode_id: strNullable(e.courseEpisodeId, `${p}.courseEpisodeId`),
  course_name_snapshot: strNullable(e.courseNameSnapshot, `${p}.courseNameSnapshot`),
  episode_title_snapshot: strNullable(e.episodeTitleSnapshot, `${p}.episodeTitleSnapshot`),
  source: enumStrict(RECORD_SOURCES)(e.source, `${p}.source`),
  notes: strNullable(e.notes, `${p}.notes`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapSetting = (e: Record<string, unknown>, p: string): Row => ({
  setting_key: strRequired(e.key, `${p}.key`),
  setting_value: strRequired(e.value, `${p}.value`),
});

/** 第 9 类资源（单词本词卡）：word 归一 lowercase；masteryLevel 越界报 MappingError */
const mapVocabCard = (e: Record<string, unknown>, p: string): Row => {
  const masteryLevel = intRequired(e.masteryLevel, `${p}.masteryLevel`);
  if (masteryLevel < 0 || masteryLevel > VOCAB_MASTERY_MAX) {
    fail(`${p}.masteryLevel`, `必须在 0-${VOCAB_MASTERY_MAX} 之间`);
  }
  return {
    id: strRequired(e.id, `${p}.id`),
    word: normalizeWord(strRequired(e.word, `${p}.word`)),
    phonetic: strNullable(e.phonetic, `${p}.phonetic`),
    definitions: jsonArrayRequired(e.definitions, `${p}.definitions`, (d, dp) => ({
      pos: strRequired(d.pos, `${dp}.pos`),
      meaning: strRequired(d.meaning, `${dp}.meaning`),
    })),
    examples: jsonArrayRequired(e.examples, `${p}.examples`, (x, xp) => ({
      en: strRequired(x.en, `${xp}.en`),
      zh: strRequired(x.zh, `${xp}.zh`),
    })),
    extra: strNullable(e.extra, `${p}.extra`),
    exam_freq: enumNullable(EXAM_FREQS)(e.examFreq, `${p}.examFreq`),
    mastery_level: masteryLevel,
    interval_days: intNonNegative(e.intervalDays, `${p}.intervalDays`),
    next_review_date: strRequired(e.nextReviewDate, `${p}.nextReviewDate`),
    is_mastered: boolStrict(e.isMastered, `${p}.isMastered`),
    first_learned_at: strNullable(e.firstLearnedAt, `${p}.firstLearnedAt`),
    correct_count: intNonNegative(e.correctCount, `${p}.correctCount`),
    wrong_count: intNonNegative(e.wrongCount, `${p}.wrongCount`),
    last_reviewed_at: strNullable(e.lastReviewedAt, `${p}.lastReviewedAt`),
    created_at: strRequired(e.createdAt, `${p}.createdAt`),
    updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
  };
};

/** 词卡数组映射（导出供单测直调；默认路径前缀与 mapBackupData 一致） */
export const mapVocabCards = (items: unknown[], p = 'data.vocabCards'): Row[] =>
  items.map((e, i) => mapVocabCard(e as Record<string, unknown>, `${p}[${i}]`));

export interface MappedData {
  presets: Row[];
  tasks: Row[];
  reviews: Row[];
  courses: Row[];
  episodes: Row[];
  focusSessions: Row[];
  studyRecords: Row[];
  settings: Row[];
  vocabCards: Row[];
}

/** 把备份文件 data 映射为 snake_case 行集合（未知键丢弃；任一非法立即抛 MappingError） */
export function mapBackupData(data: BackupFile['data']): MappedData {
  return {
    presets: data.presets.map((e, i) => mapPreset(e as Record<string, unknown>, `data.presets[${i}]`)),
    tasks: data.tasks.map((e, i) => mapTask(e as Record<string, unknown>, `data.tasks[${i}]`)),
    reviews: data.reviews.map((e, i) => mapReview(e as Record<string, unknown>, `data.reviews[${i}]`)),
    courses: data.courses.map((e, i) => mapCourse(e as Record<string, unknown>, `data.courses[${i}]`)),
    episodes: data.episodes.map((e, i) => mapEpisode(e as Record<string, unknown>, `data.episodes[${i}]`)),
    focusSessions: data.focusSessions.map((e, i) => mapFocusSession(e as Record<string, unknown>, `data.focusSessions[${i}]`)),
    studyRecords: data.studyRecords.map((e, i) => mapStudyRecord(e as Record<string, unknown>, `data.studyRecords[${i}]`)),
    settings: data.settings.map((e, i) => mapSetting(e as Record<string, unknown>, `data.settings[${i}]`)),
    // 旧版备份可省略 vocabCards（BackupFileSchema 可选）→ 空数组
    vocabCards: mapVocabCards(data.vocabCards ?? []),
  };
}
