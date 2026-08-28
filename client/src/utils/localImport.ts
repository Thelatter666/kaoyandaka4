/**
 * 本地导入纯函数（移植 server/src/utils/import.ts 与 import-mapping.ts，去掉 mysql 语义）：
 * - mapLocalBackupData：备份条目（camelCase）→ 本地行（camelCase，含 accountId 之外的字段），
 *   字段白名单严格映射 + 类型严格归一化，未知键丢弃，非法整体抛 MappingError；
 * - computeDiffCounts / computeDiffSummary：差异摘要（与服务器口径一致）；
 * - resolveLocalImportTarget：本地账户判定（未激活建号 / 邮箱占用 / 已激活邮箱一致）。
 */

import type { BackupFile, DiffSummary } from '@shared/types';
import type { LocalAccount, LocalPreset, LocalTask, LocalReview, LocalCourse, LocalEpisode, LocalFocusSession, LocalStudyRecord } from '../local/types';

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

const SUBJECTS = ['math', 'english', '408'] as const;
const SUB_SUBJECTS = ['data_structure', 'computer_organization', 'operating_system', 'computer_network'] as const;
const SESSION_SUBJECTS = ['math', 'english', '408', 'free'] as const;
const FOCUS_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;
const FOCUS_SOURCES = ['pomodoro', 'plan', 'course'] as const;
const RECORD_SOURCES = ['focus_session', 'course_video'] as const;

export interface LocalMappedData {
  presets: Array<Omit<LocalPreset, 'accountId'>>;
  tasks: Array<Omit<LocalTask, 'accountId'>>;
  reviews: Array<Omit<LocalReview, 'accountId'>>;
  courses: Array<Omit<LocalCourse, 'accountId'>>;
  episodes: Array<Omit<LocalEpisode, 'accountId'>>;
  focusSessions: Array<Omit<LocalFocusSession, 'accountId'>>;
  studyRecords: Array<Omit<LocalStudyRecord, 'accountId'>>;
  settings: Array<{ key: string; value: string }>;
}

const mapPreset = (e: Row, p: string): Omit<LocalPreset, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  name: strRequired(e.name, `${p}.name`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`) as LocalPreset['subject'],
  subSubject: enumNullable(SUB_SUBJECTS)(e.subSubject, `${p}.subSubject`),
  durationMinutes: intRequired(e.durationMinutes, `${p}.durationMinutes`),
  lastUsedAt: strNullable(e.lastUsedAt, `${p}.lastUsedAt`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapTask = (e: Row, p: string): Omit<LocalTask, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  taskDate: strRequired(e.taskDate, `${p}.taskDate`),
  content: strRequired(e.content, `${p}.content`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`) as LocalTask['subject'],
  subSubject: enumNullable(SUB_SUBJECTS)(e.subSubject, `${p}.subSubject`),
  isCompleted: boolStrict(e.isCompleted, `${p}.isCompleted`),
  isImportant: boolStrict(e.isImportant, `${p}.isImportant`),
  sortOrder: intRequired(e.sortOrder, `${p}.sortOrder`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapReview = (e: Row, p: string): Omit<LocalReview, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  reviewDate: strRequired(e.reviewDate, `${p}.reviewDate`),
  content: strRequired(e.content, `${p}.content`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapCourse = (e: Row, p: string): Omit<LocalCourse, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  name: strRequired(e.name, `${p}.name`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`) as LocalCourse['subject'],
  subSubject: enumNullable(SUB_SUBJECTS)(e.subSubject, `${p}.subSubject`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapEpisode = (e: Row, p: string): Omit<LocalEpisode, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  courseId: strRequired(e.courseId, `${p}.courseId`),
  title: strRequired(e.title, `${p}.title`),
  durationSeconds: intRequired(e.durationSeconds, `${p}.durationSeconds`),
  durationText: strRequired(e.durationText, `${p}.durationText`),
  sortOrder: intRequired(e.sortOrder, `${p}.sortOrder`),
  isCompleted: boolStrict(e.isCompleted, `${p}.isCompleted`),
  completedAt: strNullable(e.completedAt, `${p}.completedAt`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapFocusSession = (e: Row, p: string): Omit<LocalFocusSession, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  presetId: strNullable(e.presetId, `${p}.presetId`),
  presetNameSnapshot: strRequired(e.presetNameSnapshot, `${p}.presetNameSnapshot`),
  subjectSnapshot: enumStrict(SESSION_SUBJECTS)(e.subjectSnapshot, `${p}.subjectSnapshot`) as LocalFocusSession['subjectSnapshot'],
  subSubjectSnapshot: enumNullable(SUB_SUBJECTS)(e.subSubjectSnapshot, `${p}.subSubjectSnapshot`),
  plannedDurationSeconds: intRequired(e.plannedDurationSeconds, `${p}.plannedDurationSeconds`),
  actualDurationSeconds: intNullable(e.actualDurationSeconds, `${p}.actualDurationSeconds`),
  startedAt: strRequired(e.startedAt, `${p}.startedAt`),
  plannedEndAt: strRequired(e.plannedEndAt, `${p}.plannedEndAt`),
  completedAt: strNullable(e.completedAt, `${p}.completedAt`),
  status: enumStrict(FOCUS_STATUSES)(e.status, `${p}.status`) as LocalFocusSession['status'],
  // 旧版备份文件无暂停字段：导入会话按未暂停归零（schemaVersion 1 兼容）
  pausedAt: strNullable(e.pausedAt, `${p}.pausedAt`),
  pausedTotalSeconds: typeof e.pausedTotalSeconds === 'number' ? e.pausedTotalSeconds : 0,
  source: enumStrict(FOCUS_SOURCES)(e.source, `${p}.source`) as LocalFocusSession['source'],
  courseEpisodeId: strNullable(e.courseEpisodeId, `${p}.courseEpisodeId`),
  taskId: strNullable(e.taskId, `${p}.taskId`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapStudyRecord = (e: Row, p: string): Omit<LocalStudyRecord, 'accountId'> => ({
  id: strRequired(e.id, `${p}.id`),
  presetNameSnapshot: strRequired(e.presetNameSnapshot, `${p}.presetNameSnapshot`),
  subjectSnapshot: enumStrict(SESSION_SUBJECTS)(e.subjectSnapshot, `${p}.subjectSnapshot`) as LocalStudyRecord['subjectSnapshot'],
  subSubjectSnapshot: enumNullable(SUB_SUBJECTS)(e.subSubjectSnapshot, `${p}.subSubjectSnapshot`),
  actualDurationSeconds: intRequired(e.actualDurationSeconds, `${p}.actualDurationSeconds`),
  focusSessionId: strNullable(e.focusSessionId, `${p}.focusSessionId`),
  taskId: strNullable(e.taskId, `${p}.taskId`),
  courseEpisodeId: strNullable(e.courseEpisodeId, `${p}.courseEpisodeId`),
  courseNameSnapshot: strNullable(e.courseNameSnapshot, `${p}.courseNameSnapshot`),
  episodeTitleSnapshot: strNullable(e.episodeTitleSnapshot, `${p}.episodeTitleSnapshot`),
  source: enumStrict(RECORD_SOURCES)(e.source, `${p}.source`) as LocalStudyRecord['source'],
  notes: strNullable(e.notes, `${p}.notes`),
  createdAt: strRequired(e.createdAt, `${p}.createdAt`),
  updatedAt: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapSetting = (e: Row, p: string): { key: string; value: string } => ({
  key: strRequired(e.key, `${p}.key`),
  value: strRequired(e.value, `${p}.value`),
});

/** 备份 data → 本地行（未知键丢弃；任一非法立即抛 MappingError） */
export function mapLocalBackupData(data: BackupFile['data']): LocalMappedData {
  return {
    presets: data.presets.map((e, i) => mapPreset(e as Row, `data.presets[${i}]`)),
    tasks: data.tasks.map((e, i) => mapTask(e as Row, `data.tasks[${i}]`)),
    reviews: data.reviews.map((e, i) => mapReview(e as Row, `data.reviews[${i}]`)),
    courses: data.courses.map((e, i) => mapCourse(e as Row, `data.courses[${i}]`)),
    episodes: data.episodes.map((e, i) => mapEpisode(e as Row, `data.episodes[${i}]`)),
    focusSessions: data.focusSessions.map((e, i) => mapFocusSession(e as Row, `data.focusSessions[${i}]`)),
    studyRecords: data.studyRecords.map((e, i) => mapStudyRecord(e as Row, `data.studyRecords[${i}]`)),
    settings: data.settings.map((e, i) => mapSetting(e as Row, `data.settings[${i}]`)),
  };
}

/* ---- 差异计算（口径与服务器 import.ts 一致） ---- */

export interface DiffCounts {
  added: number;
  updated: number;
  kept: number;
}

export interface LocalExistingKeys {
  presets: string[];
  tasks: string[];
  reviews: { ids: string[]; dates: string[] };
  courses: string[];
  episodes: string[];
  focusSessions: string[];
  studyRecords: string[];
  settings: string[];
}

export function computeDiffCounts(fileCandidateKeys: string[][], existingKeys: Set<string>): DiffCounts {
  let added = 0;
  let updated = 0;
  for (const candidates of fileCandidateKeys) {
    if (candidates.some((c) => existingKeys.has(c))) updated++;
    else added++;
  }
  const fileSet = new Set(fileCandidateKeys.flat());
  let kept = 0;
  for (const k of existingKeys) {
    if (!fileSet.has(k)) kept++;
  }
  return { added, updated, kept };
}

const toSet = (arr: string[]): Set<string> => new Set(arr);
const idKeys = (rows: Array<{ id: string }>): string[][] => rows.map((r) => [r.id]);

export function computeDiffSummary(fileData: LocalMappedData, existing: LocalExistingKeys): DiffSummary {
  const reviewKeys = fileData.reviews.map((r) => [r.id, `date:${r.reviewDate}`]);
  const reviewExisting = new Set([...existing.reviews.ids, ...existing.reviews.dates.map((d) => `date:${d}`)]);
  return {
    presets: computeDiffCounts(idKeys(fileData.presets), toSet(existing.presets)),
    tasks: computeDiffCounts(idKeys(fileData.tasks), toSet(existing.tasks)),
    reviews: computeDiffCounts(reviewKeys, reviewExisting),
    courses: computeDiffCounts(idKeys(fileData.courses), toSet(existing.courses)),
    episodes: computeDiffCounts(idKeys(fileData.episodes), toSet(existing.episodes)),
    focusSessions: computeDiffCounts(idKeys(fileData.focusSessions), toSet(existing.focusSessions)),
    studyRecords: computeDiffCounts(idKeys(fileData.studyRecords), toSet(existing.studyRecords)),
    settings: computeDiffCounts(
      fileData.settings.map((r) => [r.key]),
      toSet(existing.settings)
    ),
  };
}

/* ---- 本地账户判定（未激活建号 / 邮箱占用 / 激活后邮箱一致） ---- */

export type LocalImportTarget = { kind: 'create'; email: string } | { kind: 'existing'; accountId: string };

export interface LocalImportTargetDecision {
  ok: boolean;
  errorCode?: 'EMAIL_TAKEN' | 'EMAIL_MISMATCH';
  target?: LocalImportTarget;
  existingAccount: boolean;
}

export function resolveLocalImportTarget(opts: {
  activeAccount: LocalAccount | null;
  existingByEmail: LocalAccount | null;
  fileEmail: string;
}): LocalImportTargetDecision {
  const { activeAccount, existingByEmail, fileEmail } = opts;

  if (!activeAccount) {
    if (existingByEmail) {
      return { ok: false, errorCode: 'EMAIL_TAKEN', existingAccount: true };
    }
    return {
      ok: true,
      target: { kind: 'create', email: fileEmail },
      existingAccount: false,
    };
  }

  if (activeAccount.email.toLowerCase() !== fileEmail.toLowerCase()) {
    return { ok: false, errorCode: 'EMAIL_MISMATCH', existingAccount: Boolean(existingByEmail) };
  }
  return { ok: true, target: { kind: 'existing', accountId: activeAccount.accountId }, existingAccount: true };
}