import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { SetReviewLockSchema, VerifyReviewLockSchema } from '../../../shared/src/schemas/review.js';
import pool from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket } from 'mysql2';

const router = Router();

// 与 auth.ts 一致的哈希代价因子
const BCRYPT_COST = 10;
// user_settings 中的复盘锁哈希键（ADR-0005）
const LOCK_KEY = 'review_lock_hash';

// 验证限流：15 分钟内同一 IP 最多 20 次，防爆破（与 loginLimiter 同型）
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '尝试次数过多，请 15 分钟后再试', details: [] } },
});

interface LockRow extends RowDataPacket {
  setting_value: string;
}

// req.userId 由挂载层 requireAuth 保证已注入（声明为可选，见 middleware/auth.ts）
async function getLockHash(userId: string | undefined): Promise<string | null> {
  const [rows] = await pool.query<LockRow[]>(
    'SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?',
    [userId, LOCK_KEY]
  );
  return rows[0]?.setting_value ?? null;
}

// GET /api/v1/review-lock — 是否已设置复盘锁
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = await getLockHash(req.userId);
    res.json({ hasLock: hash !== null });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/review-lock — 设置/修改（已有锁时必须验证当前密码）
router.post('/', validate(SetReviewLockSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const existing = await getLockHash(req.userId);
    if (existing) {
      if (!currentPassword) {
        throw new AppError(401, 'LOCK_PASSWORD_MISMATCH', '请输入当前复盘锁密码');
      }
      const ok = await bcrypt.compare(currentPassword, existing).catch(() => false);
      if (!ok) {
        throw new AppError(401, 'LOCK_PASSWORD_MISMATCH', '当前复盘锁密码不正确');
      }
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.query(
      'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [req.userId, LOCK_KEY, newHash]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/review-lock/verify — 验证（进入复盘页）
router.post('/verify', verifyLimiter, validate(VerifyReviewLockSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = await getLockHash(req.userId);
    if (!hash) {
      throw new AppError(400, 'NO_LOCK_SET', '尚未设置复盘锁');
    }
    const ok = await bcrypt.compare(req.body.password, hash).catch(() => false);
    if (!ok) {
      throw new AppError(401, 'LOCK_PASSWORD_MISMATCH', '复盘锁密码不正确');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
