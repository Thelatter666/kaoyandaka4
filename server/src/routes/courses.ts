import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { ParseImportSchema, CreateCourseSchema } from '../../../shared/src/schemas/course.js';
import pool from '../db/connection.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

interface CourseRow extends RowDataPacket {
  id: string;
  name: string;
  subject: string;
  sub_subject: string | null;
  created_at: string;
  updated_at: string;
  episode_count: number;
  completed_episode_count: number;
  total_duration_seconds: number;
  watched_duration_seconds: number;
  last_studied_episode: string | null;
}

interface EpisodeRow extends RowDataPacket {
  id: string;
  course_id: string;
  title: string;
  duration_seconds: number;
  duration_text: string;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
}

function transformCourse(row: CourseRow) {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    subSubject: row.sub_subject,
    episodeCount: row.episode_count ?? 0,
    completedEpisodeCount: row.completed_episode_count ?? 0,
    totalDurationSeconds: row.total_duration_seconds ?? 0,
    watchedDurationSeconds: row.watched_duration_seconds ?? 0,
    lastStudiedEpisode: row.last_studied_episode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformEpisode(row: EpisodeRow) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    durationSeconds: row.duration_seconds,
    durationText: row.duration_text,
    sortOrder: row.sort_order,
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at,
  };
}

const COURSE_QUERY = `
  SELECT c.*,
    (SELECT COUNT(*) FROM course_episodes WHERE course_id = c.id) AS episode_count,
    (SELECT COUNT(*) FROM course_episodes WHERE course_id = c.id AND is_completed = TRUE) AS completed_episode_count,
    (SELECT COALESCE(SUM(duration_seconds), 0) FROM course_episodes WHERE course_id = c.id) AS total_duration_seconds,
    (SELECT COALESCE(SUM(duration_seconds), 0) FROM course_episodes WHERE course_id = c.id AND is_completed = TRUE) AS watched_duration_seconds,
    (SELECT title FROM course_episodes WHERE course_id = c.id AND is_completed = TRUE ORDER BY completed_at DESC LIMIT 1) AS last_studied_episode
  FROM online_courses c
`;

// GET /api/v1/courses
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 外层按 c.user_id 过滤后，子查询经 course_id 关联自然限定在本人课程内
    const [rows] = await pool.query<CourseRow[]>(`${COURSE_QUERY} WHERE c.user_id = ? ORDER BY c.created_at DESC`, [req.userId]);
    res.json(rows.map(transformCourse));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/courses/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 按 id + user_id 双重定位：他人资源同样返回 404，不区分「不存在」与「别人的」，防枚举
    const [courses] = await pool.query<CourseRow[]>(`${COURSE_QUERY} WHERE c.id = ? AND c.user_id = ?`, [id, req.userId]);
    if (courses.length === 0) throw new AppError(404, 'NOT_FOUND', '课程不存在');

    const course = transformCourse(courses[0]);
    const [episodes] = await pool.query<EpisodeRow[]>(
      'SELECT * FROM course_episodes WHERE course_id = ? AND user_id = ? ORDER BY sort_order ASC',
      [id, req.userId]
    );
    res.json({ ...course, episodes: episodes.map(transformEpisode) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/courses/parse
router.post('/parse', validate(ParseImportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rawText } = req.body;
    const rawLines = rawText.split('\n');
    const episodes: Array<{ title: string; durationText: string; durationSeconds: number }> = [];
    const unrecognizedLines: string[] = [];

    // Pre-process: collect non-empty lines
    const lines = rawLines.map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const used = new Set<number>();

    // Pass 1: scan and build episodes
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const line = lines[i];

      // Case 1: Same-line format "Title MM:SS" or "Title H:MM:SS"
      const sameLineMatch = line.match(/^(.+?)\s+(\d{1,3}:\d{2}(?::\d{2})?)\s*$/);
      if (sameLineMatch) {
        const title = sameLineMatch[1].trim();
        const durationText = sameLineMatch[2];
        const parsed = parseTimeString(durationText);
        if (parsed && title) {
          episodes.push({ title, durationText, durationSeconds: parsed.durationSeconds });
          used.add(i);
          continue;
        }
      }

      // Case 2: Alternating lines — next line is a pure time pattern
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const pureTimeMatch = nextLine.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
        if (pureTimeMatch) {
          const durationText = pureTimeMatch[0];
          const parsed = parseTimeString(durationText);
          if (parsed) {
            episodes.push({ title: line, durationText, durationSeconds: parsed.durationSeconds });
            used.add(i);
            used.add(i + 1);
            i++; // skip the time line
            continue;
          }
        }
      }

      // Case 3: Current line is a standalone time that should have been consumed above
      if (line.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/)) {
        used.add(i); // Consume orphan time lines silently
        continue;
      }
    }

    // Pass 2: collect unrecognized (unused) lines
    for (let i = 0; i < lines.length; i++) {
      if (!used.has(i)) {
        unrecognizedLines.push(lines[i]);
      }
    }

    const totalDurationSeconds = episodes.reduce((sum, ep) => sum + ep.durationSeconds, 0);

    res.json({
      episodes,
      totalEpisodes: episodes.length,
      totalDurationSeconds,
      unrecognizedLines,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/courses — 确认导入
router.post('/', validate(CreateCourseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, subject, subSubject, lockedSubject, lockedSubSubject, episodes } = req.body;

    if (lockedSubject && lockedSubject !== subject) {
      throw new AppError(400, 'VALIDATION_ERROR', `科目已锁定为 ${lockedSubject}`);
    }
    if (lockedSubSubject && lockedSubSubject !== subSubject) {
      throw new AppError(400, 'VALIDATION_ERROR', `子科目已锁定为 ${lockedSubSubject}`);
    }

    const courseId = generateUUID();
    // user_id 一律取自会话；episodes 的冗余 user_id 与所属课程保持一致
    await pool.query<ResultSetHeader>(
      'INSERT INTO online_courses (id, user_id, name, subject, sub_subject) VALUES (?, ?, ?, ?, ?)',
      [courseId, req.userId, name, subject, subSubject || null]
    );

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const epId = generateUUID();
      await pool.query<ResultSetHeader>(
        'INSERT INTO course_episodes (id, user_id, course_id, title, duration_seconds, duration_text, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [epId, req.userId, courseId, ep.title, ep.durationSeconds, ep.durationText, i]
      );
    }

    const [rows] = await pool.query<CourseRow[]>(`${COURSE_QUERY} WHERE c.id = ? AND c.user_id = ?`, [courseId, req.userId]);
    res.status(201).json(transformCourse(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/courses/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query<CourseRow[]>('SELECT * FROM online_courses WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (existing.length === 0) throw new AppError(404, 'NOT_FOUND', '课程不存在');
    // CASCADE will handle episodes, study_records snapshots remain
    await pool.query('DELETE FROM online_courses WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/courses/:id/episodes/:eid/toggle
router.patch('/:id/episodes/:eid/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, eid } = req.params;
    // 集数用冗余 user_id 单表过滤，无需 JOIN 课程表
    const [episodes] = await pool.query<EpisodeRow[]>(
      'SELECT * FROM course_episodes WHERE id = ? AND course_id = ? AND user_id = ?',
      [eid, id, req.userId]
    );
    if (episodes.length === 0) throw new AppError(404, 'NOT_FOUND', '集数不存在');

    const episode = episodes[0];
    const newCompleted = !episode.is_completed;
    const completedAt = newCompleted ? new Date() : null;

    await pool.query(
      'UPDATE course_episodes SET is_completed = ?, completed_at = ? WHERE id = ? AND user_id = ?',
      [newCompleted, completedAt, eid, req.userId]
    );

    // If completed, create a study_record for course_video source
    if (newCompleted) {
      const [courseRows] = await pool.query<CourseRow[]>('SELECT * FROM online_courses WHERE id = ? AND user_id = ?', [id, req.userId]);
      if (courseRows.length > 0) {
        const course = courseRows[0];
        const recordId = generateUUID();
        await pool.query<ResultSetHeader>(
          `INSERT INTO study_records
           (id, user_id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
            actual_duration_seconds, course_episode_id,
            course_name_snapshot, episode_title_snapshot, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'course_video')`,
          [recordId, req.userId, episode.title, course.subject, course.sub_subject,
            episode.duration_seconds, eid, course.name, episode.title]
        );
      }
    } else {
      // Remove study_record for this episode if uncompleted（同样限定本人记录）
      await pool.query('DELETE FROM study_records WHERE course_episode_id = ? AND source = ? AND user_id = ?', [eid, 'course_video', req.userId]);
    }

    const [updated] = await pool.query<EpisodeRow[]>(
      'SELECT * FROM course_episodes WHERE id = ? AND user_id = ?',
      [eid, req.userId]
    );
    res.json(transformEpisode(updated[0]));
  } catch (err) {
    next(err);
  }
});

// Helper: parse time string
function parseTimeString(text: string): { durationSeconds: number; durationText: string } | null {
  const trimmed = text.trim();
  const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const minutes = parseInt(hmsMatch[2], 10);
    const seconds = parseInt(hmsMatch[3], 10);
    if (minutes < 60 && seconds < 60) {
      return { durationSeconds: hours * 3600 + minutes * 60 + seconds, durationText: trimmed };
    }
  }
  const mmssMatch = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (mmssMatch) {
    const minutes = parseInt(mmssMatch[1], 10);
    const seconds = parseInt(mmssMatch[2], 10);
    if (seconds < 60) {
      return { durationSeconds: minutes * 60 + seconds, durationText: trimmed };
    }
  }
  return null;
}

export default router;
