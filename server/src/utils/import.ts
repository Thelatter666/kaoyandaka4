import type { MappedData } from './import-mapping.js';
import type { DiffSummary } from '../../../shared/src/schemas/import.js';

/**
 * 导入核心纯函数：差异计算 / 账号判定 / 批量 upsert SQL 构造。
 */

/* ---- 差异计算 ---- */

export interface DiffCounts {
  added: number;
  updated: number;
  kept: number;
}

/**
 * 按冲突键集合对比：
 * - 文件条目任一候选键命中现有键 → updated；否则 added
 * - kept = 现有键中不在文件候选键集合的数量
 * reviews 用复合候选键 [id, `date:${reviewDate}`]；其余表用 [id]。
 */
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

export interface ExistingKeys {
  presets: string[];
  tasks: string[];
  reviews: { ids: string[]; dates: string[] };
  courses: string[];
  episodes: string[];
  focusSessions: string[];
  studyRecords: string[];
  settings: string[];
}

const toSet = (arr: string[]): Set<string> => new Set(arr);
const idKeys = (rows: Record<string, unknown>[]): string[][] => rows.map((r) => [String(r.id)]);

/** 汇总 8 资源差异摘要（口径见设计文档：每表冲突键集合对比） */
export function computeDiffSummary(fileData: MappedData, existing: ExistingKeys): DiffSummary {
  const reviewKeys = fileData.reviews.map((r) => [String(r.id), `date:${String(r.review_date)}`]);
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
      fileData.settings.map((r) => [String(r.setting_key)]),
      toSet(existing.settings)
    ),
  };
}

/* ---- 账号判定 ---- */

export type ImportTarget =
  | { kind: 'create'; fileEmail: string; filePasswordHash: string; fileCreatedAt: string }
  | { kind: 'existing'; userId: string };

export interface ImportTargetDecision {
  ok: boolean;
  errorCode?: 'EMAIL_TAKEN' | 'EMAIL_MISMATCH';
  target?: ImportTarget;
  existingAccount: boolean;
}

export interface ResolveImportTargetOptions {
  sessionUserId: string | undefined;
  fileEmail: string;
  filePasswordHash: string;
  fileCreatedAt: string;
  /** 文件邮箱在 users 表中的匹配行（无则 null） */
  existingAccountByEmail: { id: string; email: string } | null;
  /** 已登录用户的当前行（未登录传 null） */
  currentUser: { id: string; email: string } | null;
}

/** 判定导入目标：未登录建号 / 未登录邮箱占用 409 / 已登录邮箱一致 / 不一致 409 */
export function resolveImportTarget(opts: ResolveImportTargetOptions): ImportTargetDecision {
  const { sessionUserId, fileEmail, filePasswordHash, fileCreatedAt, existingAccountByEmail, currentUser } = opts;

  if (!sessionUserId) {
    if (existingAccountByEmail) {
      return { ok: false, errorCode: 'EMAIL_TAKEN', existingAccount: true };
    }
    return {
      ok: true,
      target: { kind: 'create', fileEmail, filePasswordHash, fileCreatedAt },
      existingAccount: false,
    };
  }

  if (!currentUser || currentUser.email.toLowerCase() !== fileEmail.toLowerCase()) {
    return { ok: false, errorCode: 'EMAIL_MISMATCH', existingAccount: Boolean(existingAccountByEmail) };
  }
  return { ok: true, target: { kind: 'existing', userId: sessionUserId }, existingAccount: true };
}

/* ---- 批量 upsert SQL 构造 ---- */

export interface TableDef {
  table: string;
  /** ON DUPLICATE KEY UPDATE 的列（业务列，不含 id/user_id；reviews 不含 id 保留现有行 id） */
  updateColumns: string[];
  /** overwrite 模式的删除顺序（先删引用方） */
}

/** 8 表定义：表名 + upsert 更新列（删除顺序在路由中固定） */
export const TABLE_DEFS: Record<keyof MappedData, { table: string; updateColumns: string[] }> = {
  presets: { table: 'study_presets', updateColumns: ['name', 'subject', 'sub_subject', 'duration_minutes', 'last_used_at', 'created_at', 'updated_at'] },
  tasks: { table: 'daily_tasks', updateColumns: ['task_date', 'content', 'subject', 'sub_subject', 'is_completed', 'is_important', 'sort_order', 'created_at', 'updated_at'] },
  reviews: { table: 'daily_reviews', updateColumns: ['content', 'created_at', 'updated_at'] },
  courses: { table: 'online_courses', updateColumns: ['name', 'subject', 'sub_subject', 'created_at', 'updated_at'] },
  episodes: { table: 'course_episodes', updateColumns: ['course_id', 'title', 'duration_seconds', 'duration_text', 'sort_order', 'is_completed', 'completed_at', 'created_at', 'updated_at'] },
  focusSessions: { table: 'focus_sessions', updateColumns: ['preset_id', 'preset_name_snapshot', 'subject_snapshot', 'sub_subject_snapshot', 'planned_duration_seconds', 'actual_duration_seconds', 'started_at', 'planned_end_at', 'completed_at', 'status', 'source', 'course_episode_id', 'task_id', 'created_at', 'updated_at'] },
  studyRecords: { table: 'study_records', updateColumns: ['preset_name_snapshot', 'subject_snapshot', 'sub_subject_snapshot', 'actual_duration_seconds', 'focus_session_id', 'task_id', 'course_episode_id', 'course_name_snapshot', 'episode_title_snapshot', 'source', 'notes', 'created_at', 'updated_at'] },
  settings: { table: 'user_settings', updateColumns: ['setting_value'] },
};

/**
 * 构造批量 upsert：INSERT INTO t (cols) VALUES (...) ON DUPLICATE KEY UPDATE col=VALUES(col)...
 * 行对象键序即列序（映射函数产出固定键序）；空行返回 null。
 */
export function buildUpsertSql(
  table: string,
  rows: Record<string, unknown>[],
  updateColumns: string[]
): { sql: string; params: unknown[] } | null {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]!);
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const params = rows.flatMap((r) => columns.map((c) => r[c]));
  const updates = updateColumns.map((c) => `${c}=VALUES(${c})`).join(', ');
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
    params,
  };
}
