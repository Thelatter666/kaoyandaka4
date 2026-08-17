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

/* ---- 批量 INSERT SQL 构造 ---- */

export interface TableDef {
  table: string;
}

/** 8 表定义：表名（overwrite 删除顺序在路由中固定） */
export const TABLE_DEFS: Record<keyof MappedData, { table: string }> = {
  presets: { table: 'study_presets' },
  tasks: { table: 'daily_tasks' },
  reviews: { table: 'daily_reviews' },
  courses: { table: 'online_courses' },
  episodes: { table: 'course_episodes' },
  focusSessions: { table: 'focus_sessions' },
  studyRecords: { table: 'study_records' },
  settings: { table: 'user_settings' },
};

/**
 * 构造批量 INSERT：INSERT INTO t (cols) VALUES (...), (...)
 * 行对象键序即列序（映射函数产出固定键序）；空行返回 null。
 * 刻意不含 ON DUPLICATE KEY UPDATE：导入文件保留原 UUID id，ODKU 会
 * 在撞主键时更新"他人行"且 user_id 不在更新列（不换主人），造成跨账号
 * 串号。改为先删后插（见路由），此处只做纯插入。
 */
export function buildInsertSql(
  table: string,
  rows: Record<string, unknown>[]
): { sql: string; params: unknown[] } | null {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]!);
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const params = rows.flatMap((r) => columns.map((c) => r[c]));
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
    params,
  };
}

/* ---- merge 模式「目标账号内冲突清理」DELETE 构造 ---- */

export type ConflictDelete = { sql: string; params: unknown[] };

/**
 * 构造 merge 模式下的「目标账号内冲突行删除」语句：
 * - 'id'（普通表，含 presets/tasks/courses/episodes/focusSessions/studyRecords）：
 *   按全局主键 id 删（`user_id=? AND id IN (...)`）。
 * - 'review'（daily_reviews）：先按 id 删（全局主键），再按 (user_id, review_date)
 *   唯一键删一条（`review_date IN (...)`），避免插入时撞该唯一约束。
 * - 'setting'（user_settings）：按联合主键 (user_id, setting_key) 删（`setting_key IN`）。
 * 空 rows 返回 []；rows 需已含 user_id（路由在写前统一注入）。
 */
export function collectConflictKeys(
  table: string,
  rows: Record<string, unknown>[],
  mode: 'id' | 'review' | 'setting'
): ConflictDelete[] {
  if (rows.length === 0) return [];
  const userId = String(rows[0]!.user_id);
  const results: ConflictDelete[] = [];
  const push = (column: string, values: string[]) => {
    if (values.length === 0) return;
    results.push({
      sql: `DELETE FROM ${table} WHERE user_id = ? AND ${column} IN (${values.map(() => '?').join(', ')})`,
      params: [userId, ...values],
    });
  };
  if (mode === 'id') {
    push('id', rows.map((r) => String(r.id)));
  } else if (mode === 'review') {
    push('id', rows.map((r) => String(r.id)));
    push('review_date', rows.map((r) => String(r.review_date)));
  } else {
    push('setting_key', rows.map((r) => String(r.setting_key)));
  }
  return results;
}
