import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { UpdateSettingsSchema } from '../../../shared/src/schemas/settings.js';
import pool from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string;
}

const SOUND_KEY = 'pomodoro_sound_enabled';

function transformSettings(rows: SettingRow[]): { pomodoroSoundEnabled: boolean } {
  const row = rows.find((r) => r.setting_key === SOUND_KEY);
  // 未设置过偏好 → 默认开启
  return { pomodoroSoundEnabled: row ? row.setting_value === '1' : true };
}

// GET /api/v1/settings — 当前用户全部设置（目前仅 pomodoroSoundEnabled）
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
      [req.userId]
    );
    res.json(transformSettings(rows));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/settings — 更新设置（键值 upsert，只改传入的键）
router.put('/', validate(UpdateSettingsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pomodoroSoundEnabled } = req.body;
    await pool.query<ResultSetHeader>(
      'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [req.userId, SOUND_KEY, pomodoroSoundEnabled ? '1' : '0']
    );
    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
      [req.userId]
    );
    res.json(transformSettings(rows));
  } catch (err) {
    next(err);
  }
});

export default router;
