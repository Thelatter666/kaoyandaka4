import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { CreatePresetSchema, UpdatePresetSchema } from '../../../shared/src/schemas/preset.js';
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
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function transformPreset(row: PresetRow) {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    subSubject: row.sub_subject,
    durationMinutes: row.duration_minutes,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/v1/presets — 获取所有预设
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<PresetRow[]>(
      'SELECT * FROM study_presets ORDER BY FIELD(subject, "math", "english", "408"), last_used_at DESC'
    );
    res.json(rows.map(transformPreset));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/presets — 创建预设
router.post('/', validate(CreatePresetSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, subject, subSubject, durationMinutes, lockedSubject } = req.body;
    if (lockedSubject && lockedSubject !== subject) {
      throw new AppError(400, 'VALIDATION_ERROR', `科目已锁定为 ${lockedSubject}`);
    }
    const id = generateUUID();
    await pool.query<ResultSetHeader>(
      'INSERT INTO study_presets (id, name, subject, sub_subject, duration_minutes) VALUES (?, ?, ?, ?, ?)',
      [id, name, subject, subSubject || null, durationMinutes]
    );
    const [rows] = await pool.query<PresetRow[]>('SELECT * FROM study_presets WHERE id = ?', [id]);
    res.status(201).json(transformPreset(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/presets/:id — 编辑预设
router.put('/:id', validate(UpdatePresetSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, subject, subSubject, durationMinutes } = req.body;

    const [existing] = await pool.query<PresetRow[]>('SELECT * FROM study_presets WHERE id = ?', [id]);
    if (existing.length === 0) {
      throw new AppError(404, 'NOT_FOUND', '预设不存在');
    }

    await pool.query(
      `UPDATE study_presets SET
        name = COALESCE(?, name),
        subject = COALESCE(?, subject),
        sub_subject = ?,
        duration_minutes = COALESCE(?, duration_minutes)
       WHERE id = ?`,
      [name, subject, subSubject, durationMinutes, id]
    );

    const [rows] = await pool.query<PresetRow[]>('SELECT * FROM study_presets WHERE id = ?', [id]);
    res.json(transformPreset(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/presets/:id — 删除预设
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<PresetRow[]>('SELECT * FROM study_presets WHERE id = ?', [id]);
    if (existing.length === 0) {
      throw new AppError(404, 'NOT_FOUND', '预设不存在');
    }
    await pool.query('DELETE FROM study_presets WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
