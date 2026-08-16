import type { BackupFile } from '../../../shared/src/schemas/backup.js';

/** 账号原始行（users 表，snake_case） */
export interface ExportAccountRow {
  email: string;
  password_hash: string;
  created_at: string;
}

/** 单行原始数据（DB 形态），字段映射职责在本模块内完成 */
type Row = Record<string, unknown>;

/** 8 个业务资源的原始行集合 */
export interface ExportRows {
  presets: Row[];
  tasks: Row[];
  reviews: Row[];
  courses: Row[];
  episodes: Row[];
  focusSessions: Row[];
  studyRecords: Row[];
  settings: Row[];
}

/* 标量归一化辅助 */
const str = (v: unknown): string | null => (v == null ? null : String(v));
const strReq = (v: unknown): string => String(v);
const bool = (v: unknown): boolean => Boolean(v);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

const mapPreset = (r: Row) => ({
  id: strReq(r.id),
  name: strReq(r.name),
  subject: strReq(r.subject),
  subSubject: str(r.sub_subject),
  durationMinutes: num(r.duration_minutes),
  lastUsedAt: str(r.last_used_at),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapTask = (r: Row) => ({
  id: strReq(r.id),
  taskDate: strReq(r.task_date),
  content: strReq(r.content),
  subject: strReq(r.subject),
  subSubject: str(r.sub_subject),
  isCompleted: bool(r.is_completed),
  isImportant: bool(r.is_important),
  sortOrder: num(r.sort_order),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapReview = (r: Row) => ({
  id: strReq(r.id),
  reviewDate: strReq(r.review_date),
  content: strReq(r.content),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapCourse = (r: Row) => ({
  id: strReq(r.id),
  name: strReq(r.name),
  subject: strReq(r.subject),
  subSubject: str(r.sub_subject),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapEpisode = (r: Row) => ({
  id: strReq(r.id),
  courseId: strReq(r.course_id),
  title: strReq(r.title),
  durationSeconds: num(r.duration_seconds),
  durationText: strReq(r.duration_text),
  sortOrder: num(r.sort_order),
  isCompleted: bool(r.is_completed),
  completedAt: str(r.completed_at),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapFocusSession = (r: Row) => ({
  id: strReq(r.id),
  presetId: str(r.preset_id),
  presetNameSnapshot: strReq(r.preset_name_snapshot),
  subjectSnapshot: strReq(r.subject_snapshot),
  subSubjectSnapshot: str(r.sub_subject_snapshot),
  plannedDurationSeconds: num(r.planned_duration_seconds),
  actualDurationSeconds: num(r.actual_duration_seconds),
  startedAt: strReq(r.started_at),
  plannedEndAt: strReq(r.planned_end_at),
  completedAt: str(r.completed_at),
  status: strReq(r.status),
  source: strReq(r.source),
  courseEpisodeId: str(r.course_episode_id),
  taskId: str(r.task_id),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapStudyRecord = (r: Row) => ({
  id: strReq(r.id),
  presetNameSnapshot: strReq(r.preset_name_snapshot),
  subjectSnapshot: strReq(r.subject_snapshot),
  subSubjectSnapshot: str(r.sub_subject_snapshot),
  actualDurationSeconds: num(r.actual_duration_seconds),
  focusSessionId: str(r.focus_session_id),
  taskId: str(r.task_id),
  courseEpisodeId: str(r.course_episode_id),
  courseNameSnapshot: str(r.course_name_snapshot),
  episodeTitleSnapshot: str(r.episode_title_snapshot),
  source: strReq(r.source),
  notes: str(r.notes),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapSetting = (r: Row) => ({
  key: strReq(r.setting_key),
  value: strReq(r.setting_value),
});

/** 组装导出文件 payload（纯函数，可单测；exportedAt 取调用时刻 UTC ISO） */
export function buildBackupPayload(account: ExportAccountRow, rows: ExportRows): BackupFile {
  return {
    format: 'kaoyandaily-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: {
      email: account.email,
      passwordHash: account.password_hash,
      createdAt: account.created_at,
    },
    data: {
      presets: rows.presets.map(mapPreset),
      tasks: rows.tasks.map(mapTask),
      reviews: rows.reviews.map(mapReview),
      courses: rows.courses.map(mapCourse),
      episodes: rows.episodes.map(mapEpisode),
      focusSessions: rows.focusSessions.map(mapFocusSession),
      studyRecords: rows.studyRecords.map(mapStudyRecord),
      settings: rows.settings.map(mapSetting),
    },
  };
}
