import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2';
import {
  CreateVocabCardSchema,
  ReviewGradeSchema,
  UpdateVocabCardSchema,
  normalizeWord,
  type ReviewGrade,
  type VocabDefinition,
  type VocabExample,
} from '../../../shared/src/schemas/vocab.js';
import { VOCAB_MASTERY_MAX, VOCAB_SRS_INTERVALS } from '../../../shared/src/constants.js';
import { addDays, applyReview } from '../../../shared/src/srs.js';
import pool from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { today } from '../utils/date.js';
import { generateUUID } from '../utils/uuid.js';

const router = Router();

// 复习评分请求体：兼容裸 grade 字符串（客户端契约 api.post(url, grade)）与 { grade } 对象（spec §7 写法）
const ReviewBodySchema = z.union([
  ReviewGradeSchema,
  z.object({ grade: ReviewGradeSchema }).transform((v) => v.grade),
]);

interface VocabRow extends RowDataPacket {
  id: string;
  word: string;
  phonetic: string | null;
  definitions: unknown;
  examples: unknown;
  extra: string | null;
  exam_freq: string | null;
  mastery_level: number;
  interval_days: number;
  next_review_date: string | Date;
  is_mastered: number | boolean;
  first_learned_at: string | Date | null;
  correct_count: number;
  wrong_count: number;
  last_reviewed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/** requireAuth 在挂载层已保证会话存在；此处仅收窄 @types/express v5 的 optional 类型 */
function sessionUserId(req: Request): string {
  return req.userId as string;
}

/** 路由参数取字符串（@types/express v5 的 ParamsDictionary 值为 string | string[]，Express 4 运行时实为 string） */
function pathId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

/** DATETIME 序列化：dateStrings=true 下即 'YYYY-MM-DD HH:MM:SS' 字符串，原样透传（与 routes/tasks.ts transform 惯例一致），Date 兜底转 ISO */
function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * JSON 列取值：mysql2（jsonStrings=false，默认）已把 JSON 列解析为 JS 值；
 * 兼容驱动配置为 jsonStrings=true 时返回字符串的情况。
 */
function parseJsonColumn<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function transformVocabCard(row: VocabRow) {
  return {
    id: row.id,
    word: row.word,
    phonetic: row.phonetic,
    definitions: parseJsonColumn<VocabDefinition[]>(row.definitions),
    examples: parseJsonColumn<VocabExample[]>(row.examples),
    extra: row.extra,
    examFreq: row.exam_freq,
    masteryLevel: row.mastery_level,
    intervalDays: row.interval_days,
    nextReviewDate: String(row.next_review_date).slice(0, 10),
    isMastered: Boolean(row.is_mastered),
    firstLearnedAt: toIso(row.first_learned_at),
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    lastReviewedAt: toIso(row.last_reviewed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** 按 id + user_id 双重定位：他人资源同样 404，不区分「不存在」与「别人的」，防枚举 */
async function fetchCard(id: string, userId: string): Promise<VocabRow> {
  const [rows] = await pool.query<VocabRow[]>(
    'SELECT * FROM vocab_cards WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', '词卡不存在');
  return rows[0]!;
}

// GET /api/v1/vocab — 全量词卡（排序/查重/复习队列均在客户端计算）
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<VocabRow[]>(
      'SELECT * FROM vocab_cards WHERE user_id = ? ORDER BY created_at ASC',
      [sessionUserId(req)]
    );
    res.json(rows.map(transformVocabCard));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/vocab — 加入词库（word 归一后唯一；重复 → 409 WORD_EXISTS）
router.post('/', validate(CreateVocabCardSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = sessionUserId(req);
    const word = normalizeWord(req.body.word);
    const { content } = req.body;
    const id = generateUUID();
    try {
      await pool.query(
        `INSERT INTO vocab_cards
           (id, user_id, word, phonetic, definitions, examples, extra, exam_freq,
            mastery_level, interval_days, next_review_date, is_mastered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, FALSE)`,
        [
          id,
          userId,
          word,
          content.phonetic ?? null,
          JSON.stringify(content.definitions),
          JSON.stringify(content.examples),
          content.extra ?? null,
          content.examFreq ?? null,
          addDays(today(), 1),
        ]
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new AppError(409, 'WORD_EXISTS', '该单词已在词库中');
      }
      throw err;
    }
    res.status(201).json(transformVocabCard(await fetchCard(id, userId)));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/vocab/:id — 手动调档 / 重置进度（masteryLevel 与 reset 二选一）
router.patch('/:id', validate(UpdateVocabCardSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pathId(req);
    const userId = sessionUserId(req);
    await fetchCard(id, userId);
    let mastery: number;
    let interval: number;
    let next: string;
    let mastered: boolean;
    if (req.body.reset === true) {
      mastery = 0;
      interval = 0;
      next = addDays(today(), 1);
      mastered = false;
    } else {
      mastery = req.body.masteryLevel;
      interval = VOCAB_SRS_INTERVALS[mastery];
      next = addDays(today(), interval);
      mastered = mastery === VOCAB_MASTERY_MAX;
    }
    await pool.query(
      `UPDATE vocab_cards SET mastery_level = ?, interval_days = ?, next_review_date = ?, is_mastered = ?,
         last_reviewed_at = NOW() WHERE id = ? AND user_id = ?`,
      [mastery, interval, next, mastered, id, userId]
    );
    res.json(transformVocabCard(await fetchCard(id, userId)));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/vocab/:id/review — 自评三键，shared applyReview 落库（服务器与本地同一份口径）
router.post('/:id/review', validate(ReviewBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pathId(req);
    const userId = sessionUserId(req);
    const row = await fetchCard(id, userId);
    const nextState = applyReview(
      {
        masteryLevel: row.mastery_level,
        intervalDays: row.interval_days,
        nextReviewDate: String(row.next_review_date).slice(0, 10),
        isMastered: Boolean(row.is_mastered),
        correctCount: row.correct_count,
        wrongCount: row.wrong_count,
      },
      req.body as ReviewGrade,
      today()
    );
    await pool.query(
      `UPDATE vocab_cards SET mastery_level = ?, interval_days = ?, next_review_date = ?, is_mastered = ?,
         correct_count = ?, wrong_count = ?, last_reviewed_at = NOW() WHERE id = ? AND user_id = ?`,
      [
        nextState.masteryLevel,
        nextState.intervalDays,
        nextState.nextReviewDate,
        nextState.isMastered,
        nextState.correctCount,
        nextState.wrongCount,
        id,
        userId,
      ]
    );
    res.json(transformVocabCard(await fetchCard(id, userId)));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/vocab/:id/learn — 首学完成，仅置 first_learned_at（幂等：已首学不覆盖时间）
router.post('/:id/learn', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pathId(req);
    const userId = sessionUserId(req);
    await fetchCard(id, userId); // 不存在 → 404
    await pool.query(
      'UPDATE vocab_cards SET first_learned_at = NOW() WHERE id = ? AND user_id = ? AND first_learned_at IS NULL',
      [id, userId]
    );
    res.json(transformVocabCard(await fetchCard(id, userId)));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/vocab/:id — 204 无 body
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM vocab_cards WHERE id = ? AND user_id = ?',
      [pathId(req), sessionUserId(req)]
    );
    if ((result as { affectedRows: number }).affectedRows === 0) {
      throw new AppError(404, 'NOT_FOUND', '词卡不存在');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
