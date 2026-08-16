import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { BackupFileSchema } from '../../../shared/src/schemas/backup.js';
import { ImportRequestSchema, ImportModeSchema } from '../../../shared/src/schemas/import.js';
import pool from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import { mapBackupData, MappingError } from '../utils/import-mapping.js';
import {
  computeDiffSummary, resolveImportTarget, buildUpsertSql, TABLE_DEFS,
  type ExistingKeys,
} from '../utils/import.js';
import type { RowDataPacket } from 'mysql2';

const router = Router();

// 导入限流：1 小时 5 次 / IP（防批量建号；与注册限流同级防护）
const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '导入过于频繁，请 1 小时后再试', details: [] } },
});

// 哈希格式校验：bcrypt 60 字符（cost 10 与项目一致）；不匹配即拒绝，防脏数据
const BCRYPT_RE = /^\$(2a|2b|2y)\$10\$[./A-Za-z0-9]{53}$/;

interface AccountRow extends RowDataPacket {
  id: string;
  email: string;
}

function assertHash(hash: string): void {
  if (!BCRYPT_RE.test(hash)) {
    throw new AppError(400, 'VALIDATION_ERROR', '备份文件账号密码哈希格式非法', [{ field: 'account.passwordHash', message: '不是合法的 bcrypt 哈希' }]);
  }
}

/** 查询文件邮箱对应账号（未登录判定用） */
async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const [rows] = await pool.query<AccountRow[]>('SELECT id, email FROM users WHERE email = ?', [email]);
  return rows[0] ?? null;
}

/** 查询当前会话用户（已登录判定用） */
async function findUserById(id: string): Promise<AccountRow | null> {
  const [rows] = await pool.query<AccountRow[]>('SELECT id, email FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/** 查询目标账号现有冲突键集合（preview 与 import 的 kept 统计） */
async function loadExistingKeys(userId: string): Promise<ExistingKeys> {
  const [presets] = await pool.query<RowDataPacket[]>('SELECT id FROM study_presets WHERE user_id = ?', [userId]);
  const [tasks] = await pool.query<RowDataPacket[]>('SELECT id FROM daily_tasks WHERE user_id = ?', [userId]);
  const [reviews] = await pool.query<RowDataPacket[]>('SELECT id, review_date FROM daily_reviews WHERE user_id = ?', [userId]);
  const [courses] = await pool.query<RowDataPacket[]>('SELECT id FROM online_courses WHERE user_id = ?', [userId]);
  const [episodes] = await pool.query<RowDataPacket[]>('SELECT id FROM course_episodes WHERE user_id = ?', [userId]);
  const [focusSessions] = await pool.query<RowDataPacket[]>('SELECT id FROM focus_sessions WHERE user_id = ?', [userId]);
  const [studyRecords] = await pool.query<RowDataPacket[]>('SELECT id FROM study_records WHERE user_id = ?', [userId]);
  const [settings] = await pool.query<RowDataPacket[]>('SELECT setting_key FROM user_settings WHERE user_id = ?', [userId]);
  return {
    presets: presets.map((r) => String(r.id)),
    tasks: tasks.map((r) => String(r.id)),
    reviews: { ids: reviews.map((r) => String(r.id)), dates: reviews.map((r) => String(r.review_date)) },
    courses: courses.map((r) => String(r.id)),
    episodes: episodes.map((r) => String(r.id)),
    focusSessions: focusSessions.map((r) => String(r.id)),
    studyRecords: studyRecords.map((r) => String(r.id)),
    settings: settings.map((r) => String(r.setting_key)),
  };
}

// POST /api/v1/import/preview — 差异对比（无副作用）
router.post('/preview', importLimiter, validate(BackupFileSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as typeof BackupFileSchema._type;
    const fileEmail = payload.account.email.trim().toLowerCase();
    const sessionUserId = req.session.userId;

    const existing = await findAccountByEmail(fileEmail);
    const currentUser = sessionUserId ? await findUserById(sessionUserId) : null;

    const decision = resolveImportTarget({
      sessionUserId,
      fileEmail,
      filePasswordHash: payload.account.passwordHash,
      fileCreatedAt: payload.account.createdAt,
      existingAccountByEmail: existing,
      currentUser,
    });

    const mapped = mapBackupData(payload.data);
    const diff = decision.target && decision.target.kind === 'existing'
      ? computeDiffSummary(mapped, await loadExistingKeys(decision.target.userId))
      : computeDiffSummary(mapped, {
          presets: [], tasks: [], reviews: { ids: [], dates: [] },
          courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [],
        });

    res.json({
      accountEmail: fileEmail,
      modeOptions: sessionUserId ? ['overwrite', 'merge'] : ['merge'],
      diff,
      existingAccount: decision.existingAccount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/import — 执行导入（未登录建号+数据+自动登录；已登录覆盖/合并）
router.post('/', importLimiter, validate(ImportRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as typeof ImportRequestSchema._type;
    const fileEmail = payload.account.email.trim().toLowerCase();
    const sessionUserId = req.session.userId;

    assertHash(payload.account.passwordHash);
    const existing = await findAccountByEmail(fileEmail);
    const currentUser = sessionUserId ? await findUserById(sessionUserId) : null;

    const decision = resolveImportTarget({
      sessionUserId,
      fileEmail,
      filePasswordHash: payload.account.passwordHash,
      fileCreatedAt: payload.account.createdAt,
      existingAccountByEmail: existing,
      currentUser,
    });
    if (!decision.ok || !decision.target) {
      const message = decision.errorCode === 'EMAIL_TAKEN'
        ? '该邮箱已注册，请登录后从账户菜单导入'
        : '备份文件属于其他账号，无法导入当前账号';
      throw new AppError(409, decision.errorCode!, message);
    }

    // 先映射（纯函数早失败，避免事务空转）；失败整体 400
    let mapped: ReturnType<typeof mapBackupData>;
    try {
      mapped = mapBackupData(payload.data);
    } catch (err) {
      if (err instanceof MappingError) {
        throw new AppError(400, 'VALIDATION_ERROR', '导入数据校验失败', err.issues.map((i) => ({ field: i.path, message: i.message })));
      }
      throw err;
    }

    const mode: 'overwrite' | 'merge' = decision.target.kind === 'create'
      ? 'merge'
      : (payload.mode ?? 'merge');
    if (decision.target.kind === 'existing' && payload.mode && !ImportModeSchema.safeParse(payload.mode).success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'mode 必须为 overwrite 或 merge');
    }

    const targetUserId = await withTransaction(async (connection) => {
      let userId = decision.target!.kind === 'existing' ? decision.target!.userId : '';

      if (decision.target!.kind === 'create') {
        const newId = generateUUID();
        await connection.query(
          'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
          [newId, fileEmail, payload.account.passwordHash, payload.account.createdAt]
        );
        userId = newId;
      }

      if (mode === 'overwrite') {
        // 删除顺序：先删引用方（episodes 引用 courses），其余无交叉外键
        const order: (keyof typeof TABLE_DEFS)[] = ['episodes', 'courses', 'focusSessions', 'studyRecords', 'tasks', 'reviews', 'presets', 'settings'];
        for (const key of order) {
          await connection.query(`DELETE FROM ${TABLE_DEFS[key].table} WHERE user_id = ?`, [userId]);
        }
      }

      const write = async (key: keyof typeof TABLE_DEFS, rows: Record<string, unknown>[]) => {
        const withUser = rows.map((r) => ({ ...r, user_id: userId }));
        const stmt = buildUpsertSql(TABLE_DEFS[key].table, withUser, TABLE_DEFS[key].updateColumns);
        if (stmt) await connection.query(stmt.sql, stmt.params);
      };

      await write('presets', mapped.presets);
      await write('tasks', mapped.tasks);
      await write('reviews', mapped.reviews);
      await write('courses', mapped.courses);
      await write('episodes', mapped.episodes);
      await write('focusSessions', mapped.focusSessions);
      await write('studyRecords', mapped.studyRecords);
      await write('settings', mapped.settings);

      return userId;
    });

    // 未登录导入：事务提交后建立会话（自动登录）
    if (decision.target.kind === 'create') {
      req.session.userId = targetUserId;
    }

    res.json({ id: targetUserId, email: fileEmail });
  } catch (err) {
    next(err);
  }
});

export default router;
