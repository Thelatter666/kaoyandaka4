import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { RegisterSchema, LoginSchema } from '../../../shared/src/schemas/auth.js';
import pool from '../db/connection.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// SessionData.userId 的会话数据声明已统一移至 middleware/auth.ts（与 requireAuth 同处维护）

const router = Router();

// bcrypt 哈希代价因子
const BCRYPT_COST = 10;

// 会话 Cookie 名（express-session 默认值，与 index.ts 的 session 中间件保持一致，logout 时按此清除）
const SESSION_COOKIE_NAME = 'connect.sid';

// 与真实哈希同 cost 的占位哈希：账号不存在时同样执行一次 compare，对齐响应耗时，防时序侧信道
const DUMMY_HASH = '$2b$10$OiyuEDFLLscTo1RkMg.86Ouwt4/H2eCII0k4rcVqBeqrgCNLTXQ0G';

// 登录限流：15 分钟内同一 IP 最多 20 次，缓解撞库/暴力破解
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // 响应形状与 AppError 对齐：{ error: { code, message, details } }
  message: { error: { code: 'RATE_LIMITED', message: '尝试次数过多，请 15 分钟后再试', details: [] } },
});

// 注册限流：1 小时内同一 IP 最多 10 次，防止批量注册
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '注册过于频繁，请 1 小时后再试', details: [] } },
});

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

// POST /api/v1/auth/register — 注册（成功后自动建立会话，免去二次登录）
router.post('/register', registerLimiter, validate(RegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    // 邮箱统一小写存储与查询，避免大小写差异导致重复账号
    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await pool.query<UserRow[]>('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      throw new AppError(409, 'EMAIL_TAKEN', '该邮箱已被注册');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const id = generateUUID();
    try {
      await pool.query<ResultSetHeader>(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        [id, normalizedEmail, passwordHash]
      );
    } catch (err) {
      // 并发注册同一邮箱时依赖唯一索引兜底：ER_DUP_ENTRY 同样按 409 处理
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new AppError(409, 'EMAIL_TAKEN', '该邮箱已被注册');
      }
      throw err;
    }

    req.session.userId = id;
    res.status(201).json({ id, email: normalizedEmail });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login — 登录（错误统一返回"邮箱或密码错误"，不区分原因，防账号枚举）
router.post('/login', loginLimiter, validate(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    const user = rows[0];

    // 哈希格式非法（如种子占位数据 MIGRATION_PLACEHOLDER）时 compare 会抛错，一律视为校验失败
    let passwordOk = false;
    try {
      passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    } catch {
      passwordOk = false;
    }
    if (!user || !passwordOk) {
      throw new AppError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误');
    }

    // 登录成功重新生成会话 ID，防会话固定（session fixation）
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me — 当前登录用户；无会话返回 401
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session.userId) {
      throw new AppError(401, 'UNAUTHORIZED', '未登录');
    }
    const [rows] = await pool.query<UserRow[]>('SELECT id, email FROM users WHERE id = ?', [req.session.userId]);
    const user = rows[0];
    if (!user) {
      // 会话中的用户已被删除：销毁残余会话后再拒绝
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
      throw new AppError(401, 'UNAUTHORIZED', '未登录');
    }
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout — 退出登录：销毁会话并清除 Cookie
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
