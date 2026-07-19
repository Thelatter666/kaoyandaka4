import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { CreateTaskSchema, UpdateTaskSchema, ReorderItemsSchema } from '../../../shared/src/schemas/task.js';
import pool from '../db/connection.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

interface TaskRow extends RowDataPacket {
  id: string;
  task_date: string;
  content: string;
  subject: string;
  sub_subject: string | null;
  is_completed: boolean;
  is_important: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function transformTask(row: TaskRow) {
  return {
    id: row.id,
    taskDate: row.task_date,
    content: row.content,
    subject: row.subject,
    subSubject: row.sub_subject,
    isCompleted: Boolean(row.is_completed),
    isImportant: Boolean(row.is_important),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/v1/tasks?date=YYYY-MM-DD
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', '缺少 date 参数');
    }
    const [rows] = await pool.query<TaskRow[]>(
      'SELECT * FROM daily_tasks WHERE task_date = ? ORDER BY is_important DESC, sort_order ASC',
      [date]
    );
    res.json(rows.map(transformTask));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tasks/unfinished?from=YYYY-MM-DD
router.get('/unfinished', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from } = req.query;
    if (!from || typeof from !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', '缺少 from 参数');
    }
    const [rows] = await pool.query<TaskRow[]>(
      'SELECT * FROM daily_tasks WHERE task_date = ? AND is_completed = FALSE ORDER BY is_important DESC, sort_order ASC',
      [from]
    );
    res.json(rows.map(transformTask));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks — 创建任务
router.post('/', validate(CreateTaskSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, content, subject, subSubject, isImportant } = req.body;
    const id = generateUUID();
    // Get max sort_order
    const [maxRows] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM daily_tasks WHERE task_date = ?',
      [date]
    );
    const sortOrder = maxRows[0].next_order;
    await pool.query<ResultSetHeader>(
      'INSERT INTO daily_tasks (id, task_date, content, subject, sub_subject, is_important, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, date, content, subject, subSubject || null, isImportant, sortOrder]
    );
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    res.status(201).json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/tasks/:id — 编辑任务
router.put('/:id', validate(UpdateTaskSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');

    const { content, subject, subSubject, isImportant, isCompleted } = req.body;
    await pool.query(
      `UPDATE daily_tasks SET
        content = COALESCE(?, content),
        subject = COALESCE(?, subject),
        sub_subject = ?,
        is_important = COALESCE(?, is_important),
        is_completed = COALESCE(?, is_completed)
       WHERE id = ?`,
      [content, subject, subSubject, isImportant, isCompleted, id]
    );
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    res.json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/:id/toggle — 切换完成
router.patch('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    await pool.query('UPDATE daily_tasks SET is_completed = NOT is_completed WHERE id = ?', [id]);
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    res.json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/:id/pin — 切换重要
router.patch('/:id/pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    await pool.query('UPDATE daily_tasks SET is_important = NOT is_important WHERE id = ?', [id]);
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    res.json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/reorder — 批量排序
router.patch('/reorder', validate(ReorderItemsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    for (const item of items) {
      await pool.query(
        'UPDATE daily_tasks SET sort_order = ?, is_important = ? WHERE id = ?',
        [item.sortOrder, item.isImportant, item.id]
      );
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ?', [id]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    await pool.query('DELETE FROM daily_tasks WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Helper function
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export default router;
