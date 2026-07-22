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
      'SELECT * FROM daily_tasks WHERE task_date = ? AND user_id = ? ORDER BY is_important DESC, sort_order ASC',
      [date, req.userId]
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
      'SELECT * FROM daily_tasks WHERE task_date = ? AND user_id = ? AND is_completed = FALSE ORDER BY is_important DESC, sort_order ASC',
      [from, req.userId]
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
    // Get max sort_order（排序序号按用户各自独立计算）
    const [maxRows] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM daily_tasks WHERE task_date = ? AND user_id = ?',
      [date, req.userId]
    );
    const sortOrder = maxRows[0].next_order;
    // user_id 一律取自会话，忽略客户端可能传入的任何归属字段
    await pool.query<ResultSetHeader>(
      'INSERT INTO daily_tasks (id, user_id, task_date, content, subject, sub_subject, is_important, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.userId, date, content, subject, subSubject || null, isImportant, sortOrder]
    );
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.status(201).json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/tasks/:id — 编辑任务
router.put('/:id', validate(UpdateTaskSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 按 id + user_id 双重定位：他人资源同样返回 404，不区分「不存在」与「别人的」，防枚举
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');

    const { content, subject, subSubject, isImportant, isCompleted } = req.body;
    await pool.query(
      `UPDATE daily_tasks SET
        content = COALESCE(?, content),
        subject = COALESCE(?, subject),
        sub_subject = ?,
        is_important = COALESCE(?, is_important),
        is_completed = COALESCE(?, is_completed)
       WHERE id = ? AND user_id = ?`,
      [content, subject, subSubject, isImportant, isCompleted, id, req.userId]
    );
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/:id/toggle — 切换完成
router.patch('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    await pool.query('UPDATE daily_tasks SET is_completed = NOT is_completed WHERE id = ? AND user_id = ?', [id, req.userId]);
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/:id/pin — 切换重要
router.patch('/:id/pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    await pool.query('UPDATE daily_tasks SET is_important = NOT is_important WHERE id = ? AND user_id = ?', [id, req.userId]);
    const [rows] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json(transformTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/reorder — 批量排序
router.patch('/reorder', validate(ReorderItemsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    // 批量排序按 id + user_id 定位：混入的他人任务 id 自然命中 0 行被静默忽略，不泄露存在性
    for (const item of items) {
      await pool.query(
        'UPDATE daily_tasks SET sort_order = ?, is_important = ? WHERE id = ? AND user_id = ?',
        [item.sortOrder, item.isImportant, item.id, req.userId]
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
    const [existing] = await pool.query<TaskRow[]>('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '任务不存在');
    await pool.query('DELETE FROM daily_tasks WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
