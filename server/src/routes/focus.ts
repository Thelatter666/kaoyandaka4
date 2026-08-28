import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { StartFocusSchema } from '../../../shared/src/schemas/focus.js';
import { FOCUS_PAUSE_MAX_SECONDS } from '../../../shared/src/constants.js';
import pool from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

interface PresetRow extends RowDataPacket {
  id: string;
  name: string;
  subject: string;
  sub_subject: string | null;
  duration_minutes: number;
}

interface FocusRow extends RowDataPacket {
  id: string;
  preset_id: string | null;
  preset_name_snapshot: string;
  subject_snapshot: string;
  sub_subject_snapshot: string | null;
  planned_duration_seconds: number;
  actual_duration_seconds: number | null;
  started_at: string;
  planned_end_at: string;
  completed_at: string | null;
  status: string;
  source: string;
  paused_at: string | null;
  paused_total_seconds: number;
  course_episode_id: string | null;
  task_id: string | null;
}

function transformSession(row: FocusRow) {
  return {
    id: row.id,
    presetNameSnapshot: row.preset_name_snapshot,
    subjectSnapshot: row.subject_snapshot,
    subSubjectSnapshot: row.sub_subject_snapshot,
    plannedDurationSeconds: row.planned_duration_seconds,
    startedAt: row.started_at,
    plannedEndAt: row.planned_end_at,
    status: row.status,
    source: row.source,
    // 非空 = 暂停中；判断暂停一律看本字段，勿发明 status 判断（ADR-0006）
    pausedAt: row.paused_at,
    pausedTotalSeconds: row.paused_total_seconds ?? 0,
  };
}

// POST /api/v1/focus/start
router.post('/start', validate(StartFocusSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { presetId, plannedDurationMinutes, source, courseEpisodeId, taskId } = req.body;

    // presetId 缺省 = 漫游专注：不归属任何预设/科目，快照写固定值
    let snapshotName = '漫游专注';
    let snapshotSubject = 'free';
    let snapshotSubSubject: string | null = null;

    if (presetId) {
      // Get preset（仅限本人预设，他人的按不存在处理）
      const [presets] = await pool.query<PresetRow[]>('SELECT * FROM study_presets WHERE id = ? AND user_id = ?', [presetId, req.userId]);
      if (presets.length === 0) throw new AppError(404, 'NOT_FOUND', '预设不存在');

      const preset = presets[0];
      snapshotName = preset.name;
      snapshotSubject = preset.subject;
      snapshotSubSubject = preset.sub_subject;

      // Update preset last_used_at
      await pool.query('UPDATE study_presets SET last_used_at = NOW() WHERE id = ? AND user_id = ?', [presetId, req.userId]);
    }

    // 跨表引用归属校验：被引用的集数/任务必须属于当前用户，防止构造他人资源 id 越权关联
    if (courseEpisodeId) {
      const [episodes] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM course_episodes WHERE id = ? AND user_id = ?',
        [courseEpisodeId, req.userId]
      );
      if (episodes.length === 0) throw new AppError(404, 'NOT_FOUND', '集数不存在');
    }
    if (taskId) {
      const [tasks] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM daily_tasks WHERE id = ? AND user_id = ?',
        [taskId, req.userId]
      );
      if (tasks.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    }

    const plannedDurationSeconds = plannedDurationMinutes * 60;

    const id = generateUUID();
    const now = new Date();
    const plannedEndAt = new Date(now.getTime() + plannedDurationSeconds * 1000);

    await pool.query<ResultSetHeader>(
      `INSERT INTO focus_sessions
       (id, user_id, preset_id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
        planned_duration_seconds, started_at, planned_end_at, status, source, course_episode_id, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
      [id, req.userId, presetId || null, snapshotName, snapshotSubject, snapshotSubSubject,
        plannedDurationSeconds, now, plannedEndAt, source, courseEpisodeId || null, taskId || null]
    );

    const [rows] = await pool.query<FocusRow[]>('SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.status(201).json(transformSession(rows[0]));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/focus/:id/complete
router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const [sessions] = await pool.query<FocusRow[]>('SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (sessions.length === 0) throw new AppError(404, 'NOT_FOUND', '专注会话不存在');

    const session = sessions[0];
    if (session.status !== 'in_progress') {
      throw new AppError(409, 'CONFLICT', '该专注会话已结束');
    }
    if (session.paused_at) {
      throw new AppError(409, 'CONFLICT', '暂停中,请先继续专注再完成');
    }

    const startedAt = new Date(session.started_at);
    const actualDurationSeconds = Math.max(
      0,
      Math.round((now.getTime() - startedAt.getTime()) / 1000) - (session.paused_total_seconds ?? 0)
    );

    // 事务包裹「完成会话 + 写学习记录」两步写入，保证原子性；任一失败整体回滚
    await withTransaction(async (connection) => {
      // 乐观锁：仅当仍为 in_progress 且未暂停时更新，命中 0 行说明已被并发处理（409 抛出后事务回滚）
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE focus_sessions
         SET status = 'completed', actual_duration_seconds = ?, completed_at = NOW()
         WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NULL`,
        [actualDurationSeconds, id, req.userId]
      );

      if (result.affectedRows === 0) {
        throw new AppError(409, 'CONFLICT', '该专注会话已被处理');
      }

      // Create study_record（user_id 取自会话，与会话归属一致）
      const recordId = generateUUID();
      await connection.query<ResultSetHeader>(
        `INSERT INTO study_records
         (id, user_id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
          actual_duration_seconds, focus_session_id, task_id, course_episode_id,
          course_name_snapshot, episode_title_snapshot, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'focus_session')`,
        [recordId, req.userId, session.preset_name_snapshot, session.subject_snapshot, session.sub_subject_snapshot,
          actualDurationSeconds, id, session.task_id, session.course_episode_id]
      );
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/focus/:id/pause — 暂停：写 paused_at，学习时钟停走（ADR-0006）
router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE focus_sessions SET paused_at = NOW() WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NULL",
      [id, req.userId]
    );
    if (result.affectedRows === 0) {
      throw new AppError(409, 'CONFLICT', '当前不可暂停（会话不存在、已结束或已在暂停中）');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/focus/:id/resume — 恢复：顺延 planned_end_at 并累计暂停总量
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<FocusRow[]>(
      "SELECT * FROM focus_sessions WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NOT NULL",
      [id, req.userId]
    );
    if (rows.length === 0) {
      throw new AppError(409, 'CONFLICT', '当前没有暂停中的专注会话');
    }
    const pausedSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(rows[0].paused_at as string).getTime()) / 1000)
    );
    await pool.query<ResultSetHeader>(
      `UPDATE focus_sessions
       SET planned_end_at = DATE_ADD(planned_end_at, INTERVAL ? SECOND),
           paused_total_seconds = paused_total_seconds + ?,
           paused_at = NULL
       WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NOT NULL`,
      [pausedSeconds, pausedSeconds, id, req.userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/focus/:id/cancel — 暂停中 status 仍为 in_progress，天然可取消（W4，零特判）
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE focus_sessions SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'in_progress'",
      [id, req.userId]
    );
    if (result.affectedRows === 0) {
      throw new AppError(404, 'NOT_FOUND', '没有可取消的活跃会话');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/focus/active
router.get('/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<FocusRow[]>(
      "SELECT * FROM focus_sessions WHERE status = 'in_progress' AND user_id = ? ORDER BY started_at DESC LIMIT 1",
      [req.userId]
    );

    if (rows.length === 0) {
      return res.json(null);
    }

    const session = rows[0];
    let effective = session;
    const now = new Date();

    if (session.paused_at) {
      const pausedElapsed = Math.round((now.getTime() - new Date(session.paused_at).getTime()) / 1000);
      if (pausedElapsed < FOCUS_PAUSE_MAX_SECONDS) {
        // 暂停中且未超时：原样返回，不做过期自动完成（学习时钟停走，ADR-0006）
        return res.json(transformSession(session));
      }
      // 暂停超时：惰性恢复（顺延 + 累计），与「过期自动完成惰性触发」同构；无服务端定时器
      const pausedSeconds = Math.round((now.getTime() - new Date(session.paused_at).getTime()) / 1000);
      await pool.query<ResultSetHeader>(
        `UPDATE focus_sessions
         SET planned_end_at = DATE_ADD(planned_end_at, INTERVAL ? SECOND),
             paused_total_seconds = paused_total_seconds + ?,
             paused_at = NULL
         WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NOT NULL`,
        [pausedSeconds, pausedSeconds, session.id, req.userId]
      );
      const [refreshed] = await pool.query<FocusRow[]>(
        'SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?',
        [session.id, req.userId]
      );
      effective = refreshed[0];
    }

    const plannedEndAt = new Date(effective.planned_end_at);

    if (plannedEndAt <= now) {
      // 过期自动完成：事务包裹「完成会话 + 写学习记录」，保证原子性
      const actualDurationSeconds = effective.planned_duration_seconds;
      await withTransaction(async (connection) => {
        await connection.query(
          "UPDATE focus_sessions SET status = 'completed', actual_duration_seconds = ?, completed_at = NOW() WHERE id = ? AND user_id = ?",
          [actualDurationSeconds, effective.id, req.userId]
        );
        // Create study record
        const recordId = generateUUID();
        await connection.query(
          `INSERT INTO study_records
           (id, user_id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
            actual_duration_seconds, focus_session_id, task_id, course_episode_id, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'focus_session')`,
          [recordId, req.userId, effective.preset_name_snapshot, effective.subject_snapshot, effective.sub_subject_snapshot,
            actualDurationSeconds, effective.id, effective.task_id, effective.course_episode_id]
        );
      });
      return res.json(null);
    }

    res.json(transformSession(effective));
  } catch (err) {
    next(err);
  }
});

export default router;
