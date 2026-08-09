import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { StatisticsQuerySchema } from '../../../shared/src/schemas/statistics.js';
import pool from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket } from 'mysql2';

const router = Router();

interface RecordRow extends RowDataPacket {
  id: string;
  preset_name_snapshot: string;
  subject_snapshot: string;
  sub_subject_snapshot: string | null;
  actual_duration_seconds: number;
  source: string;
  created_at: string;
}

// GET /api/v1/statistics/forest?mode=day|week|month&date=YYYY-MM-DD
router.get('/forest', validate(StatisticsQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode, date } = req.query as { mode: string; date: string };
    const now = new Date(date + 'T00:00:00');

    let rangeStart: string;
    let rangeEnd: string;

    switch (mode) {
      case 'day':
        rangeStart = date;
        rangeEnd = date;
        break;
      case 'week': {
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        rangeStart = formatDate(monday);
        rangeEnd = formatDate(sunday);
        break;
      }
      case 'month': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        rangeStart = formatDate(firstDay);
        rangeEnd = formatDate(lastDay);
        break;
      }
      default:
        throw new AppError(400, 'INVALID_MODE', '不支持的统计模式');
    }

    // Future date check：仅拒绝锚定日期本身在未来（与 rangeStart/rangeEnd 一致使用本地日期，
    // 避免 UTC 换算误判）；本周/本月的 rangeEnd 自然晚于今日，不应误判为未来
    const todayStr = formatDate(new Date());
    if (date > todayStr) {
      throw new AppError(400, 'FUTURE_DATE', '不能查询未来日期');
    }

    // Query study_records within range（仅当前用户），只选明细所需列，避免 SELECT * 拉取冗余字段
    // Dedup: exclude course_video records that have a linked focus_session_id
    const [records] = await pool.query<RecordRow[]>(
      `SELECT id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
              actual_duration_seconds, source, created_at
       FROM study_records
       WHERE created_at >= ? AND created_at < ?
         AND user_id = ?
         AND (
           source = 'focus_session'
           OR (source = 'course_video' AND focus_session_id IS NULL)
         )
       ORDER BY created_at DESC`,
      [`${rangeStart} 00:00:00`, `${getNextDate(rangeEnd)} 00:00:00`, req.userId]
    );

    // Period calculations
    let totalFocusSeconds = 0;
    let totalCompletedSessions = 0;
    const subjectSeconds: Record<string, number> = { math: 0, english: 0, '408': 0, free: 0 };

    // Group records by date
    const dateMap = new Map<string, Array<{
      id: string;
      title: string;
      subject: string;
      subSubject: string | null;
      durationSeconds: number;
      time: string;
      source: string;
    }>>();

    for (const rec of records) {
      totalFocusSeconds += rec.actual_duration_seconds;
      totalCompletedSessions += 1;
      subjectSeconds[rec.subject_snapshot] = (subjectSeconds[rec.subject_snapshot] || 0) + rec.actual_duration_seconds;

      // MySQL DATETIME 可能返回 'YYYY-MM-DD HH:MM:SS'（含空格）或 ISO 串，统一截取前 10 位日期
      const recDate = rec.created_at.slice(0, 10);
      if (!dateMap.has(recDate)) dateMap.set(recDate, []);
      dateMap.get(recDate)!.push({
        id: rec.id,
        title: rec.preset_name_snapshot,
        subject: rec.subject_snapshot,
        subSubject: rec.sub_subject_snapshot,
        durationSeconds: rec.actual_duration_seconds,
        time: rec.created_at,
        source: rec.source,
      });
    }

    // Trees: 1 tree = 3600 seconds per subject（free 漫游专注同样累计种树）
    const treesBySubject: Record<string, number> = { math: 0, english: 0, '408': 0, free: 0 };
    const remainingSecondsBySubject: Record<string, number> = { math: 3600, english: 3600, '408': 3600, free: 3600 };
    for (const subject of ['math', 'english', '408', 'free']) {
      treesBySubject[subject] = Math.floor(subjectSeconds[subject] / 3600);
      remainingSecondsBySubject[subject] = 3600 - (subjectSeconds[subject] % 3600);
    }
    const totalTrees = Object.values(treesBySubject).reduce((a, b) => a + b, 0);

    // Cumulative (all time, same dedup)
    // user_id 条件必须把去重 OR 组括起来再并列，避免 AND/OR 优先级改变语义
    const [cumRecords] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(actual_duration_seconds), 0) AS total_seconds,
              COUNT(*) AS total_sessions
       FROM study_records
       WHERE user_id = ?
         AND (
           source = 'focus_session'
           OR (source = 'course_video' AND focus_session_id IS NULL)
         )`,
      [req.userId]
    );
    const cumulativeTotalSeconds = cumRecords[0].total_seconds || 0;

    // Calculate cumulative trees across all subjects
    const [cumBySubject] = await pool.query<RowDataPacket[]>(
      `SELECT subject_snapshot, COALESCE(SUM(actual_duration_seconds), 0) AS total
       FROM study_records
       WHERE user_id = ?
         AND (
           source = 'focus_session'
           OR (source = 'course_video' AND focus_session_id IS NULL)
         )
       GROUP BY subject_snapshot`,
      [req.userId]
    );
    let cumulativeTotalTrees = 0;
    for (const row of cumBySubject) {
      cumulativeTotalTrees += Math.floor((row.total || 0) / 3600);
    }

    // Build response
    const todayStr2 = formatDate(new Date());

    res.json({
      mode,
      rangeStart,
      rangeEnd,
      canGoBack: true, // Always can go back in history
      canGoForward: rangeEnd < todayStr2,
      period: {
        totalFocusSeconds,
        totalCompletedSessions,
        totalTrees,
        treesBySubject,
        remainingSecondsBySubject,
      },
      cumulative: {
        totalFocusSeconds: cumulativeTotalSeconds,
        totalTrees: cumulativeTotalTrees,
      },
      records: Array.from(dateMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, items]) => ({ date, items })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/statistics/today-summary
// 今日完成概要（轻量单条聚合查询，供番茄钟页挂载时取当日完成数，避免拉取 /forest 全量明细）
// 去重口径与 /forest 保持一致：focus_session 全计；course_video 仅计未关联 focus_session_id 的记录
router.get('/today-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 按服务器本地日期聚合今天 [00:00, 明天 00:00)
    const todayStr = formatDate(new Date());
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS completed_sessions, COALESCE(SUM(actual_duration_seconds),0) AS total_seconds
       FROM study_records
       WHERE user_id = ? AND created_at >= ? AND created_at < ?
         AND (source = 'focus_session' OR (source = 'course_video' AND focus_session_id IS NULL))`,
      [req.userId, `${todayStr} 00:00:00`, `${getNextDate(todayStr)} 00:00:00`]
    );
    // 每科目今日累计秒数（供番茄钟页计算「距下一棵树」；口径与 forest 一致，free 漫游独立累计）
    const [subjRows] = await pool.query<RowDataPacket[]>(
      `SELECT subject_snapshot, COALESCE(SUM(actual_duration_seconds),0) AS total_seconds
       FROM study_records
       WHERE user_id = ? AND created_at >= ? AND created_at < ?
         AND (source = 'focus_session' OR (source = 'course_video' AND focus_session_id IS NULL))
       GROUP BY subject_snapshot`,
      [req.userId, `${todayStr} 00:00:00`, `${getNextDate(todayStr)} 00:00:00`]
    );
    const bySubject: Record<string, number> = { math: 0, english: 0, '408': 0, free: 0 };
    for (const row of subjRows) {
      if (bySubject[row.subject_snapshot] !== undefined) {
        bySubject[row.subject_snapshot] = Number(row.total_seconds) || 0;
      }
    }
    res.json({
      completedSessions: Number(rows[0].completed_sessions) || 0,
      totalSeconds: Number(rows[0].total_seconds) || 0,
      bySubject,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/statistics/heatmap
// 学习趋势热力图：近 6 个月每日专注秒数（按服务器本地日期分组）
// 去重口径与 /forest 一致：focus_session 全计；course_video 仅计未关联 focus_session_id 的记录
router.get('/heatmap', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const todayStr = formatDate(new Date());
    const rangeStartDate = new Date();
    rangeStartDate.setMonth(rangeStartDate.getMonth() - 6);
    const rangeStart = formatDate(rangeStartDate);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(created_at) AS date, COALESCE(SUM(actual_duration_seconds), 0) AS seconds
       FROM study_records
       WHERE user_id = ? AND created_at >= ? AND created_at < ?
         AND (
           source = 'focus_session'
           OR (source = 'course_video' AND focus_session_id IS NULL)
         )
       GROUP BY DATE(created_at)`,
      [req.userId, `${rangeStart} 00:00:00`, `${getNextDate(todayStr)} 00:00:00`]
    );

    // SUM 可能以 DECIMAL 字符串返回，统一 Number 转换
    const days = rows.map((row) => ({
      date: String(row.date),
      seconds: Number(row.seconds) || 0,
    }));

    res.json({ rangeStart, rangeEnd: todayStr, days });
  } catch (err) {
    next(err);
  }
});

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

export default router;
