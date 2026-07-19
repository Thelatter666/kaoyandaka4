import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { StartFocusSchema } from '../../../shared/src/schemas/focus.js';
import pool from '../db/connection.js';
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
  };
}

// POST /api/v1/focus/start
router.post('/start', validate(StartFocusSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { presetId, plannedDurationMinutes, source, courseEpisodeId, taskId } = req.body;

    // Get preset
    const [presets] = await pool.query<PresetRow[]>('SELECT * FROM study_presets WHERE id = ?', [presetId]);
    if (presets.length === 0) throw new AppError(404, 'NOT_FOUND', '预设不存在');

    const preset = presets[0];
    const plannedDurationSeconds = plannedDurationMinutes * 60;

    // Update preset last_used_at
    await pool.query('UPDATE study_presets SET last_used_at = NOW() WHERE id = ?', [presetId]);

    const id = generateUUID();
    const now = new Date();
    const plannedEndAt = new Date(now.getTime() + plannedDurationSeconds * 1000);

    await pool.query<ResultSetHeader>(
      `INSERT INTO focus_sessions
       (id, preset_id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
        planned_duration_seconds, started_at, planned_end_at, status, source, course_episode_id, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
      [id, presetId, preset.name, preset.subject, preset.sub_subject,
        plannedDurationSeconds, now, plannedEndAt, source, courseEpisodeId || null, taskId || null]
    );

    const [rows] = await pool.query<FocusRow[]>('SELECT * FROM focus_sessions WHERE id = ?', [id]);
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

    const [sessions] = await pool.query<FocusRow[]>('SELECT * FROM focus_sessions WHERE id = ?', [id]);
    if (sessions.length === 0) throw new AppError(404, 'NOT_FOUND', '专注会话不存在');

    const session = sessions[0];
    if (session.status !== 'in_progress') {
      throw new AppError(409, 'CONFLICT', '该专注会话已结束');
    }

    const startedAt = new Date(session.started_at);
    const actualDurationSeconds = Math.round((now.getTime() - startedAt.getTime()) / 1000);

    // Use optimistic locking
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE focus_sessions
       SET status = 'completed', actual_duration_seconds = ?, completed_at = NOW()
       WHERE id = ? AND status = 'in_progress'`,
      [actualDurationSeconds, id]
    );

    if (result.affectedRows === 0) {
      throw new AppError(409, 'CONFLICT', '该专注会话已被处理');
    }

    // Create study_record
    const recordId = generateUUID();
    await pool.query<ResultSetHeader>(
      `INSERT INTO study_records
       (id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
        actual_duration_seconds, focus_session_id, task_id, course_episode_id,
        course_name_snapshot, episode_title_snapshot, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'focus_session')`,
      [recordId, session.preset_name_snapshot, session.subject_snapshot, session.sub_subject_snapshot,
        actualDurationSeconds, id, session.task_id, session.course_episode_id]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/focus/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE focus_sessions SET status = 'cancelled' WHERE id = ? AND status = 'in_progress'",
      [id]
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
router.get('/active', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<FocusRow[]>(
      "SELECT * FROM focus_sessions WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    );

    if (rows.length === 0) {
      return res.json(null);
    }

    const session = rows[0];
    const plannedEndAt = new Date(session.planned_end_at);
    const now = new Date();

    if (plannedEndAt <= now) {
      // Auto-complete expired session
      const actualDurationSeconds = session.planned_duration_seconds;
      await pool.query(
        "UPDATE focus_sessions SET status = 'completed', actual_duration_seconds = ?, completed_at = NOW() WHERE id = ?",
        [actualDurationSeconds, session.id]
      );
      // Create study record
      const recordId = generateUUID();
      await pool.query(
        `INSERT INTO study_records
         (id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
          actual_duration_seconds, focus_session_id, task_id, course_episode_id, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'focus_session')`,
        [recordId, session.preset_name_snapshot, session.subject_snapshot, session.sub_subject_snapshot,
          actualDurationSeconds, session.id, session.task_id, session.course_episode_id]
      );
      return res.json(null);
    }

    res.json(transformSession(session));
  } catch (err) {
    next(err);
  }
});

export default router;
