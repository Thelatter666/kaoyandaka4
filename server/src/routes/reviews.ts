import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { UpsertReviewSchema } from '../../../shared/src/schemas/review.js';
import pool from '../db/connection.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

interface ReviewRow extends RowDataPacket {
  id: string;
  review_date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function transformReview(row: ReviewRow) {
  return {
    id: row.id,
    reviewDate: row.review_date,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/v1/reviews?date=YYYY-MM-DD
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', '缺少 date 参数');
    }
    const [rows] = await pool.query<ReviewRow[]>(
      'SELECT * FROM daily_reviews WHERE review_date = ? AND user_id = ?',
      [date, req.userId]
    );
    res.json(rows.length > 0 ? transformReview(rows[0]) : null);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reviews/history — 全部复盘（倒序，含全文；个人数据量小不分页）
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<ReviewRow[]>(
      'SELECT * FROM daily_reviews WHERE user_id = ? ORDER BY review_date DESC',
      [req.userId]
    );
    res.json(rows.map(transformReview));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/reviews — 创建或更新复盘
router.put('/', validate(UpsertReviewSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, content } = req.body;
    // 唯一键为 (user_id, review_date)：查/改/增全部按当前用户隔离
    const [existing] = await pool.query<ReviewRow[]>(
      'SELECT * FROM daily_reviews WHERE review_date = ? AND user_id = ?',
      [date, req.userId]
    );

    if (existing.length > 0) {
      await pool.query('UPDATE daily_reviews SET content = ? WHERE review_date = ? AND user_id = ?', [content, date, req.userId]);
      const [rows] = await pool.query<ReviewRow[]>('SELECT * FROM daily_reviews WHERE review_date = ? AND user_id = ?', [date, req.userId]);
      res.json(transformReview(rows[0]));
    } else {
      const id = generateUUID();
      await pool.query<ResultSetHeader>(
        'INSERT INTO daily_reviews (id, user_id, review_date, content) VALUES (?, ?, ?, ?)',
        [id, req.userId, date, content]
      );
      const [rows] = await pool.query<ReviewRow[]>('SELECT * FROM daily_reviews WHERE id = ? AND user_id = ?', [id, req.userId]);
      res.status(201).json(transformReview(rows[0]));
    }
  } catch (err) {
    next(err);
  }
});

export default router;
