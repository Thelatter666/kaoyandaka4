import { Router, Request, Response, NextFunction } from 'express';
import type { RowDataPacket } from 'mysql2';
import { withTransaction } from '../db/transaction.js';
import { formatDate } from '../utils/date.js';
import { buildBackupPayload } from '../utils/backup.js';

const router = Router();

interface AccountRow extends RowDataPacket {
  email: string;
  password_hash: string;
  created_at: string;
}

// GET /api/v1/export — 导出当前账号全部业务数据（含账号信息）为备份文件
// 只读事务（REPEATABLE READ 快照）保证跨表一致性；查询按固定顺序保证导出内容确定性
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await withTransaction(async (connection) => {
      const [accountRows] = await connection.query<AccountRow[]>(
        'SELECT email, password_hash, created_at FROM users WHERE id = ?',
        [req.userId]
      );
      const account = accountRows[0]!;

      const [presets] = await connection.query(
        'SELECT * FROM study_presets WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [tasks] = await connection.query(
        'SELECT * FROM daily_tasks WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [reviews] = await connection.query(
        'SELECT * FROM daily_reviews WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [courses] = await connection.query(
        'SELECT * FROM online_courses WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [episodes] = await connection.query(
        'SELECT * FROM course_episodes WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [focusSessions] = await connection.query(
        'SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [studyRecords] = await connection.query(
        'SELECT * FROM study_records WHERE user_id = ? ORDER BY created_at, id',
        [req.userId]
      );
      const [settings] = await connection.query(
        'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ? ORDER BY setting_key',
        [req.userId]
      );

      return buildBackupPayload(account, {
        presets: presets as never,
        tasks: tasks as never,
        reviews: reviews as never,
        courses: courses as never,
        episodes: episodes as never,
        focusSessions: focusSessions as never,
        studyRecords: studyRecords as never,
        settings: settings as never,
      });
    });

    // attachment 响应头：浏览器直接保存文件；no-store 防止敏感数据（含密码哈希）落缓存
    const filename = `yantai-backup-${formatDate(new Date())}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
