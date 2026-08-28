/**
 * LocalDataStore：本地模式数据访问层，实现与 8 个 xxxApi **同名同签名**的方法
 * （P3-A：CRUD；P3-D：导出/导入）。业务页面组件零改动，仅 xxxApi 内部按 isLocalMode() 分支。
 *
 * 语义与服务器路由逐一对照：
 * - tasks：create 排序号 = 当日 max+1；update 为 COALESCE 部分更新；reorder 按 id 批量更新；
 * - focus：start 快照 preset（last_used_at 同步更新）；complete 写 focusSessions+studyRecords（原子）；
 *   cancel 置 cancelled；getActive 过期自动完成；
 * - courses：打勾不写 study_records（历史决策）；delete 级联删集数；
 * - reviews：按 (accountId, reviewDate) upsert；
 * - 所有业务记录带 accountId 归属，查询一律先按 accountId 过滤；返回时剔除 accountId。
 */

import type {
  CreateTaskInput,
  UpdateTaskInput,
  ReorderItemsInput,
  CreatePresetInput,
  UpdatePresetInput,
  StartFocusInput,
  ParseImportInput,
  CreateCourseInput,
  UpsertReviewInput,
  UpdateSettingsInput,
  BackupFile,
  ImportMode,
  ImportPreviewResponse,
  ForestResponse,
  HeatmapResponse,
} from '@shared/types';
import type { Task } from '../api/tasks';
import type { Preset } from '../api/presets';
import type { ActiveSession } from '../api/focus';
import type { Course, CourseDetail, Episode, ParseResult } from '../api/courses';
import type { Review } from '../api/reviews';
import type { Settings } from '../api/settings';
import type { TodaySummary } from '../api/statistics';
import { FOCUS_PAUSE_MAX_SECONDS } from '@shared/constants';
import type {
  LocalAccount,
  LocalCourse,
  LocalEpisode,
  LocalFocusSession,
  LocalPreset,
  LocalReview,
  LocalSetting,
  LocalStudyRecord,
  LocalTask,
  Accountless,
} from './types';
import { BUSINESS_STORES, idbDelete, idbGetAll, idbGetAllByIndex, idbGetByKey, idbPut, tx, type StoreName } from './db';
import { findLocalAccountByEmail, getActiveLocalAccount, setActiveLocalAccount } from './accounts';
import { generateUUID } from '../utils/uuid';
import { formatDateTime, parseDateTime } from '../utils/date';
import { computeForest, computeHeatmap, computeTodaySummary } from '../utils/localStatistics';
import { parseCourseText } from '../utils/parseCourseText';
import {
  computeDiffSummary,
  mapLocalBackupData,
  type LocalExistingKeys,
  type LocalMappedData,
} from '../utils/localImport';

/* ---- 通用 helper ---- */

function requireAccountId(): string {
  const account = getActiveLocalAccount();
  if (!account) throw new Error('未激活本地账户');
  return account.accountId;
}

function strip<T extends { accountId: string }>(row: T): Accountless<T> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'accountId')) as Accountless<T>;
}

async function rowsByAccount<T>(store: StoreName, accountId: string): Promise<T[]> {
  return tx(store, 'readonly', (t) => idbGetAllByIndex(t, store, 'accountId', accountId)) as Promise<T[]>;
}

async function getOne<T extends { id: string; accountId: string }>(
  store: StoreName,
  id: string,
  accountId: string
): Promise<T | null> {
  const row = (await tx(store, 'readonly', (t) => idbGetByKey(t, store, id))) as T | undefined;
  return row && row.accountId === accountId ? row : null;
}

const now = () => formatDateTime();

/* ---- presets ---- */

const presets = {
  async getAll(): Promise<Preset[]> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalPreset>('presets', accountId);
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(strip);
  },

  async create(data: CreatePresetInput): Promise<Preset> {
    const accountId = requireAccountId();
    const time = now();
    const preset: LocalPreset = {
      id: generateUUID(),
      accountId,
      name: data.name,
      subject: data.subject,
      subSubject: data.subSubject ?? null,
      durationMinutes: data.durationMinutes,
      lastUsedAt: null,
      createdAt: time,
      updatedAt: time,
    };
    await tx('presets', 'readwrite', (t) => idbPut(t, 'presets', preset));
    return strip(preset);
  },

  async update(id: string, data: UpdatePresetInput): Promise<Preset> {
    const accountId = requireAccountId();
    const existing = await getOne<LocalPreset>('presets', id, accountId);
    if (!existing) throw new Error('预设不存在');
    const updated: LocalPreset = {
      ...existing,
      name: data.name ?? existing.name,
      subject: data.subject ?? existing.subject,
      subSubject: data.subSubject !== undefined ? data.subSubject : existing.subSubject,
      durationMinutes: data.durationMinutes ?? existing.durationMinutes,
      updatedAt: now(),
    };
    await tx('presets', 'readwrite', (t) => idbPut(t, 'presets', updated));
    return strip(updated);
  },

  async delete(id: string): Promise<void> {
    const accountId = requireAccountId();
    const existing = await getOne<LocalPreset>('presets', id, accountId);
    if (!existing) throw new Error('预设不存在');
    await tx('presets', 'readwrite', (t) => idbDelete(t, 'presets', id));
  },
};

/* ---- tasks ---- */

const TASK_SORT = (a: LocalTask, b: LocalTask): number => {
  if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
  return a.sortOrder - b.sortOrder;
};

const tasks = {
  async getByDate(date: string): Promise<Task[]> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalTask>('tasks', accountId);
    return rows.filter((r) => r.taskDate === date).sort(TASK_SORT).map(strip);
  },

  async getUnfinished(fromDate: string): Promise<Task[]> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalTask>('tasks', accountId);
    return rows.filter((r) => r.taskDate === fromDate && !r.isCompleted).sort(TASK_SORT).map(strip);
  },

  async create(data: CreateTaskInput): Promise<Task> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalTask>('tasks', accountId);
    const maxOrder = rows
      .filter((r) => r.taskDate === data.date)
      .reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const time = now();
    const task: LocalTask = {
      id: generateUUID(),
      accountId,
      taskDate: data.date,
      content: data.content,
      subject: data.subject,
      subSubject: data.subSubject ?? null,
      isCompleted: false,
      isImportant: data.isImportant ?? false,
      sortOrder: maxOrder + 1,
      createdAt: time,
      updatedAt: time,
    };
    await tx('tasks', 'readwrite', (t) => idbPut(t, 'tasks', task));
    return strip(task);
  },

  async update(id: string, data: UpdateTaskInput): Promise<Task> {
    const accountId = requireAccountId();
    const existing = await getOne<LocalTask>('tasks', id, accountId);
    if (!existing) throw new Error('任务不存在');
    const updated: LocalTask = {
      ...existing,
      content: data.content ?? existing.content,
      subject: data.subject ?? existing.subject,
      subSubject: data.subSubject !== undefined ? data.subSubject : existing.subSubject,
      isImportant: data.isImportant ?? existing.isImportant,
      isCompleted: data.isCompleted ?? existing.isCompleted,
      updatedAt: now(),
    };
    await tx('tasks', 'readwrite', (t) => idbPut(t, 'tasks', updated));
    return strip(updated);
  },

  async toggle(id: string): Promise<Task> {
    const accountId = requireAccountId();
    const existing = await getOne<LocalTask>('tasks', id, accountId);
    if (!existing) throw new Error('任务不存在');
    const updated: LocalTask = { ...existing, isCompleted: !existing.isCompleted, updatedAt: now() };
    await tx('tasks', 'readwrite', (t) => idbPut(t, 'tasks', updated));
    return strip(updated);
  },

  async pin(id: string): Promise<Task> {
    const accountId = requireAccountId();
    const existing = await getOne<LocalTask>('tasks', id, accountId);
    if (!existing) throw new Error('任务不存在');
    const updated: LocalTask = { ...existing, isImportant: !existing.isImportant, updatedAt: now() };
    await tx('tasks', 'readwrite', (t) => idbPut(t, 'tasks', updated));
    return strip(updated);
  },

  async reorder(data: ReorderItemsInput): Promise<void> {
    const accountId = requireAccountId();
    await tx('tasks', 'readwrite', async (t) => {
      for (const item of data.items) {
        const row = (await idbGetByKey(t, 'tasks', item.id)) as LocalTask | undefined;
        if (!row || row.accountId !== accountId) continue;
        await idbPut(t, 'tasks', {
          ...row,
          sortOrder: item.sortOrder,
          isImportant: item.isImportant,
          updatedAt: now(),
        });
      }
    });
  },

  async delete(id: string): Promise<void> {
    const accountId = requireAccountId();
    const existing = await getOne<LocalTask>('tasks', id, accountId);
    if (!existing) throw new Error('任务不存在');
    await tx('tasks', 'readwrite', (t) => idbDelete(t, 'tasks', id));
  },
};

/* ---- reviews ---- */

const reviews = {
  async getByDate(date: string): Promise<Review | null> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalReview>('reviews', accountId);
    const row = rows.find((r) => r.reviewDate === date);
    return row ? strip(row) : null;
  },

  async upsert(data: UpsertReviewInput): Promise<Review> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalReview>('reviews', accountId);
    const existing = rows.find((r) => r.reviewDate === data.date);
    const time = now();
    if (existing) {
      const updated: LocalReview = { ...existing, content: data.content, updatedAt: time };
      await tx('reviews', 'readwrite', (t) => idbPut(t, 'reviews', updated));
      return strip(updated);
    }
    const review: LocalReview = {
      id: generateUUID(),
      accountId,
      reviewDate: data.date,
      content: data.content,
      createdAt: time,
      updatedAt: time,
    };
    await tx('reviews', 'readwrite', (t) => idbPut(t, 'reviews', review));
    return strip(review);
  },

  async getHistory(): Promise<Review[]> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalReview>('reviews', accountId);
    return rows.sort((a, b) => (a.reviewDate < b.reviewDate ? 1 : -1)).map(strip);
  },
};

/* ---- courses ---- */

function buildCourseView(course: LocalCourse, episodes: LocalEpisode[]): Course {
  const completed = episodes.filter((e) => e.isCompleted);
  const latestCompleted = completed.sort((a, b) => (a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1)[0];
  return {
    id: course.id,
    name: course.name,
    subject: course.subject,
    subSubject: course.subSubject,
    episodeCount: episodes.length,
    completedEpisodeCount: completed.length,
    totalDurationSeconds: episodes.reduce((s, e) => s + e.durationSeconds, 0),
    watchedDurationSeconds: completed.reduce((s, e) => s + e.durationSeconds, 0),
    lastStudiedEpisode: latestCompleted?.title ?? null,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

const courses = {
  async getAll(): Promise<Course[]> {
    const accountId = requireAccountId();
    const courseRows = await rowsByAccount<LocalCourse>('courses', accountId);
    const episodeRows = await rowsByAccount<LocalEpisode>('episodes', accountId);
    return courseRows
      .map((c) => buildCourseView(c, episodeRows.filter((e) => e.courseId === c.id)))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async getById(id: string): Promise<CourseDetail> {
    const accountId = requireAccountId();
    const course = await getOne<LocalCourse>('courses', id, accountId);
    if (!course) throw new Error('课程不存在');
    const episodes = (await rowsByAccount<LocalEpisode>('episodes', accountId))
      .filter((e) => e.courseId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(strip);
    return { ...buildCourseView(course, episodes as LocalEpisode[]), episodes };
  },

  async parse(data: ParseImportInput): Promise<ParseResult> {
    return parseCourseText(data.rawText);
  },

  async create(data: CreateCourseInput): Promise<Course> {
    const accountId = requireAccountId();
    const time = now();
    const course: LocalCourse = {
      id: generateUUID(),
      accountId,
      name: data.name,
      subject: data.subject,
      subSubject: data.subSubject ?? null,
      createdAt: time,
      updatedAt: time,
    };
    const episodes: LocalEpisode[] = data.episodes.map((ep, i) => ({
      id: generateUUID(),
      accountId,
      courseId: course.id,
      title: ep.title,
      durationSeconds: ep.durationSeconds,
      durationText: ep.durationText,
      sortOrder: i,
      isCompleted: false,
      completedAt: null,
      createdAt: time,
      updatedAt: time,
    }));
    await tx(['courses', 'episodes'], 'readwrite', async (t) => {
      await idbPut(t, 'courses', course);
      for (const ep of episodes) await idbPut(t, 'episodes', ep);
    });
    return buildCourseView(course, episodes);
  },

  async delete(id: string): Promise<void> {
    const accountId = requireAccountId();
    const course = await getOne<LocalCourse>('courses', id, accountId);
    if (!course) throw new Error('课程不存在');
    const episodes = await rowsByAccount<LocalEpisode>('episodes', accountId);
    await tx(['courses', 'episodes'], 'readwrite', async (t) => {
      for (const ep of episodes) {
        if (ep.courseId === id) await idbDelete(t, 'episodes', ep.id);
      }
      await idbDelete(t, 'courses', id);
    });
  },

  async toggleEpisode(courseId: string, episodeId: string): Promise<Episode> {
    const accountId = requireAccountId();
    const ep = await getOne<LocalEpisode>('episodes', episodeId, accountId);
    if (!ep || ep.courseId !== courseId) throw new Error('集数不存在');
    const time = now();
    const updated: LocalEpisode = {
      ...ep,
      isCompleted: !ep.isCompleted,
      completedAt: ep.isCompleted ? null : time,
      updatedAt: time,
    };
    await tx('episodes', 'readwrite', (t) => idbPut(t, 'episodes', updated));
    return strip(updated);
  },
};

/* ---- focus ---- */

function transformSession(row: LocalFocusSession): ActiveSession {
  return {
    id: row.id,
    presetNameSnapshot: row.presetNameSnapshot,
    subjectSnapshot: row.subjectSnapshot,
    subSubjectSnapshot: row.subSubjectSnapshot,
    plannedDurationSeconds: row.plannedDurationSeconds,
    startedAt: row.startedAt,
    plannedEndAt: row.plannedEndAt,
    status: row.status as 'in_progress',
    source: row.source,
    // 非空 = 暂停中；判断暂停一律看本字段，勿发明 status 判断（ADR-0006）
    pausedAt: row.pausedAt,
    pausedTotalSeconds: row.pausedTotalSeconds ?? 0,
  };
}

function buildStudyRecord(session: LocalFocusSession, actualDurationSeconds: number, time: string): LocalStudyRecord {
  return {
    id: generateUUID(),
    accountId: session.accountId,
    presetNameSnapshot: session.presetNameSnapshot,
    subjectSnapshot: session.subjectSnapshot,
    subSubjectSnapshot: session.subSubjectSnapshot,
    actualDurationSeconds,
    focusSessionId: session.id,
    taskId: session.taskId,
    courseEpisodeId: session.courseEpisodeId,
    courseNameSnapshot: null,
    episodeTitleSnapshot: null,
    source: 'focus_session',
    notes: null,
    createdAt: time,
    updatedAt: time,
  };
}

const focus = {
  async start(data: StartFocusInput): Promise<ActiveSession> {
    const accountId = requireAccountId();
    let snapshotName = '漫游专注';
    let snapshotSubject: LocalFocusSession['subjectSnapshot'] = 'free';
    let snapshotSubSubject: string | null = null;

    if (data.presetId) {
      const preset = await getOne<LocalPreset>('presets', data.presetId, accountId);
      if (!preset) throw new Error('预设不存在');
      snapshotName = preset.name;
      snapshotSubject = preset.subject;
      snapshotSubSubject = preset.subSubject;
      await tx('presets', 'readwrite', (t) =>
        idbPut(t, 'presets', { ...preset, lastUsedAt: now(), updatedAt: now() })
      );
    }
    if (data.courseEpisodeId) {
      const ep = await getOne<LocalEpisode>('episodes', data.courseEpisodeId, accountId);
      if (!ep) throw new Error('集数不存在');
    }
    if (data.taskId) {
      const task = await getOne<LocalTask>('tasks', data.taskId, accountId);
      if (!task) throw new Error('任务不存在');
    }

    const plannedDurationSeconds = data.plannedDurationMinutes * 60;
    const startedAtDate = new Date();
    const startedAt = formatDateTime(startedAtDate);
    const session: LocalFocusSession = {
      id: generateUUID(),
      accountId,
      presetId: data.presetId ?? null,
      presetNameSnapshot: snapshotName,
      subjectSnapshot: snapshotSubject,
      subSubjectSnapshot: snapshotSubSubject,
      plannedDurationSeconds,
      actualDurationSeconds: null,
      startedAt,
      plannedEndAt: formatDateTime(new Date(startedAtDate.getTime() + plannedDurationSeconds * 1000)),
      completedAt: null,
      status: 'in_progress',
      pausedAt: null,
      pausedTotalSeconds: 0,
      source: data.source,
      courseEpisodeId: data.courseEpisodeId ?? null,
      taskId: data.taskId ?? null,
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    await tx('focusSessions', 'readwrite', (t) => idbPut(t, 'focusSessions', session));
    return transformSession(session);
  },

  async complete(id: string): Promise<void> {
    const accountId = requireAccountId();
    // 单事务内「读状态 → 写完成 + 学习记录」原子完成：并发调用时 IndexedDB
    // 事务串行执行，第二个事务读到已完成的会话直接报错（对齐服务器 409 语义），
    // 杜绝重复写入学习记录
    await tx(['focusSessions', 'studyRecords'], 'readwrite', async (t) => {
      const session = (await idbGetByKey(t, 'focusSessions', id)) as LocalFocusSession | undefined;
      if (!session || session.accountId !== accountId) throw new Error('专注会话不存在');
      if (session.status !== 'in_progress') throw new Error('该专注会话已结束');
      if (session.pausedAt) throw new Error('暂停中,请先继续专注');

      const completedAtDate = new Date();
      const time = formatDateTime(completedAtDate);
      const actualDurationSeconds = Math.max(
        0,
        Math.round((completedAtDate.getTime() - parseDateTime(session.startedAt).getTime()) / 1000) -
          (session.pausedTotalSeconds ?? 0)
      );
      const completed: LocalFocusSession = {
        ...session,
        status: 'completed',
        actualDurationSeconds,
        completedAt: time,
        updatedAt: time,
      };
      await idbPut(t, 'focusSessions', completed);
      await idbPut(t, 'studyRecords', buildStudyRecord(session, actualDurationSeconds, time));
    });
  },

  async cancel(id: string): Promise<void> {
    const accountId = requireAccountId();
    // 单事务原子：读状态 → 置 cancelled（与 complete 并发时以后到者为准）
    await tx('focusSessions', 'readwrite', async (t) => {
      const session = (await idbGetByKey(t, 'focusSessions', id)) as LocalFocusSession | undefined;
      if (!session || session.accountId !== accountId || session.status !== 'in_progress') {
        throw new Error('没有可取消的活跃会话');
      }
      await idbPut(t, 'focusSessions', { ...session, status: 'cancelled', updatedAt: now() });
    });
  },

  async pause(id: string): Promise<void> {
    const accountId = requireAccountId();
    await tx('focusSessions', 'readwrite', async (t) => {
      const session = (await idbGetByKey(t, 'focusSessions', id)) as LocalFocusSession | undefined;
      if (
        !session ||
        session.accountId !== accountId ||
        session.status !== 'in_progress' ||
        session.pausedAt
      ) {
        throw new Error('当前不可暂停');
      }
      await idbPut(t, 'focusSessions', { ...session, pausedAt: now(), updatedAt: now() });
    });
  },

  async resume(id: string): Promise<void> {
    const accountId = requireAccountId();
    await tx('focusSessions', 'readwrite', async (t) => {
      const session = (await idbGetByKey(t, 'focusSessions', id)) as LocalFocusSession | undefined;
      if (!session || session.accountId !== accountId || !session.pausedAt) {
        throw new Error('当前没有暂停中的专注会话');
      }
      // 单次暂停最多抵 5 分钟学习时间：即使挂起超时，超挂部分不补（与服务器语义一致）
      const pausedElapsed = Math.max(
        0,
        Math.round((Date.now() - parseDateTime(session.pausedAt).getTime()) / 1000)
      );
      const pausedSeconds = Math.min(pausedElapsed, FOCUS_PAUSE_MAX_SECONDS);
      await idbPut(t, 'focusSessions', {
        ...session,
        plannedEndAt: formatDateTime(
          new Date(parseDateTime(session.plannedEndAt).getTime() + pausedSeconds * 1000)
        ),
        pausedTotalSeconds: (session.pausedTotalSeconds ?? 0) + pausedSeconds,
        pausedAt: null,
        updatedAt: now(),
      });
    });
  },

  async getActive(): Promise<ActiveSession | null> {
    const accountId = requireAccountId();
    // 单 readwrite 事务：查询 + 过期自动完成原子化（并发 getActive 不会重复写学习记录）
    return tx(['focusSessions', 'studyRecords'], 'readwrite', async (t) => {
      const rows = (await idbGetAllByIndex(t, 'focusSessions', 'accountId', accountId)) as LocalFocusSession[];
      let active = rows
        .filter((r) => r.status === 'in_progress')
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
      if (!active) return null;

      const nowDate = new Date();

      if (active.pausedAt) {
        // 暂停中且未超时：原样返回，不做过期自动完成（学习时钟停走，ADR-0006）
        const pausedElapsed = Math.round(
          (nowDate.getTime() - parseDateTime(active.pausedAt).getTime()) / 1000
        );
        if (pausedElapsed < FOCUS_PAUSE_MAX_SECONDS) {
          return transformSession(active);
        }
        // 暂停超时：惰性恢复（顺延 5 分钟上限并累计），随后继续既有过期判断
        const resumed: LocalFocusSession = {
          ...active,
          plannedEndAt: formatDateTime(
            new Date(parseDateTime(active.plannedEndAt).getTime() + FOCUS_PAUSE_MAX_SECONDS * 1000)
          ),
          pausedTotalSeconds: (active.pausedTotalSeconds ?? 0) + FOCUS_PAUSE_MAX_SECONDS,
          pausedAt: null,
          updatedAt: now(),
        };
        await idbPut(t, 'focusSessions', resumed);
        active = resumed;
      }

      if (parseDateTime(active.plannedEndAt) <= nowDate) {
        // 过期自动完成：完成会话 + 写学习记录（语义与服务器 getActive 一致）
        const time = formatDateTime(nowDate);
        const completed: LocalFocusSession = {
          ...active,
          status: 'completed',
          actualDurationSeconds: active.plannedDurationSeconds,
          completedAt: time,
          updatedAt: time,
        };
        await idbPut(t, 'focusSessions', completed);
        await idbPut(t, 'studyRecords', buildStudyRecord(active, active.plannedDurationSeconds, time));
        return null;
      }
      return transformSession(active);
    });
  },
};

/* ---- statistics（前端等价实现，语义与服务器一致） ---- */

const statistics = {
  async getForest(mode: 'day' | 'week' | 'month', date: string): Promise<ForestResponse> {
    const accountId = requireAccountId();
    const records = await rowsByAccount<LocalStudyRecord>('studyRecords', accountId);
    return computeForest(records, mode, date);
  },

  async getHeatmap(): Promise<HeatmapResponse> {
    const accountId = requireAccountId();
    const records = await rowsByAccount<LocalStudyRecord>('studyRecords', accountId);
    return computeHeatmap(records);
  },

  async getTodaySummary(): Promise<TodaySummary> {
    const accountId = requireAccountId();
    const records = await rowsByAccount<LocalStudyRecord>('studyRecords', accountId);
    return computeTodaySummary(records);
  },
};

/* ---- settings ---- */

const SOUND_KEY = 'pomodoro_sound_enabled';

const settings = {
  async get(): Promise<Settings> {
    const accountId = requireAccountId();
    const rows = await rowsByAccount<LocalSetting>('settings', accountId);
    const row = rows.find((r) => r.key === SOUND_KEY);
    // 未设置过偏好 → 默认开启（与服务器一致）
    return { pomodoroSoundEnabled: row ? row.value === '1' : true };
  },

  async update(data: UpdateSettingsInput): Promise<Settings> {
    const accountId = requireAccountId();
    const value = data.pomodoroSoundEnabled ? '1' : '0';
    const rows = await rowsByAccount<LocalSetting>('settings', accountId);
    const existing = rows.find((r) => r.key === SOUND_KEY);
    await tx('settings', 'readwrite', (t) =>
      idbPut(t, 'settings', existing ? { ...existing, value } : { accountId, key: SOUND_KEY, value })
    );
    return { pomodoroSoundEnabled: data.pomodoroSoundEnabled };
  },
};

/* ---- 备份导出 / 导入（P3-D） ---- */

/** 本地导出账户的密码哈希占位（本地账户无密码，文件仅用于本地迁移） */
const LOCAL_PASSWORD_PLACEHOLDER = 'local-mode-account';

async function loadExistingKeys(accountId: string): Promise<LocalExistingKeys> {
  const presets = await rowsByAccount<LocalPreset>('presets', accountId);
  const taskRows = await rowsByAccount<LocalTask>('tasks', accountId);
  const reviewRows = await rowsByAccount<LocalReview>('reviews', accountId);
  const courseRows = await rowsByAccount<LocalCourse>('courses', accountId);
  const episodeRows = await rowsByAccount<LocalEpisode>('episodes', accountId);
  const focusRows = await rowsByAccount<LocalFocusSession>('focusSessions', accountId);
  const recordRows = await rowsByAccount<LocalStudyRecord>('studyRecords', accountId);
  const settingRows = await rowsByAccount<LocalSetting>('settings', accountId);
  return {
    presets: presets.map((r) => r.id),
    tasks: taskRows.map((r) => r.id),
    reviews: { ids: reviewRows.map((r) => r.id), dates: reviewRows.map((r) => r.reviewDate) },
    courses: courseRows.map((r) => r.id),
    episodes: episodeRows.map((r) => r.id),
    focusSessions: focusRows.map((r) => r.id),
    studyRecords: recordRows.map((r) => r.id),
    settings: settingRows.map((r) => r.key),
  };
}

const EMPTY_KEYS: LocalExistingKeys = {
  presets: [],
  tasks: [],
  reviews: { ids: [], dates: [] },
  courses: [],
  episodes: [],
  focusSessions: [],
  studyRecords: [],
  settings: [],
};

const backup = {
  /** 组装当前本地账户的备份文件（格式与 P1 导出一致） */
  async exportBackup(): Promise<BackupFile> {
    const account = getActiveLocalAccount();
    if (!account) throw new Error('未激活本地账户');
    const accountId = account.accountId;
    const [presets, taskRows, reviewRows, courseRows, episodeRows, focusRows, recordRows, settingRows] =
      await Promise.all([
        rowsByAccount<LocalPreset>('presets', accountId),
        rowsByAccount<LocalTask>('tasks', accountId),
        rowsByAccount<LocalReview>('reviews', accountId),
        rowsByAccount<LocalCourse>('courses', accountId),
        rowsByAccount<LocalEpisode>('episodes', accountId),
        rowsByAccount<LocalFocusSession>('focusSessions', accountId),
        rowsByAccount<LocalStudyRecord>('studyRecords', accountId),
        rowsByAccount<LocalSetting>('settings', accountId),
      ]);
    return {
      format: 'kaoyandaily-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      account: {
        email: account.email,
        passwordHash: LOCAL_PASSWORD_PLACEHOLDER,
        createdAt: account.createdAt,
      },
      data: {
        presets: presets.map(strip),
        tasks: taskRows.map(strip),
        reviews: reviewRows.map(strip),
        courses: courseRows.map(strip),
        episodes: episodeRows.map(strip),
        focusSessions: focusRows.map(strip),
        studyRecords: recordRows.map(strip),
        settings: settingRows.map((r) => ({ key: r.key, value: r.value })),
      },
    };
  },

  /** 差异对比（无副作用）：已激活 → 对当前账户数据；未激活 → 对空库（邮箱占用判定另算） */
  async previewImport(file: BackupFile): Promise<ImportPreviewResponse> {
    const email = file.account.email.trim().toLowerCase();
    const active = getActiveLocalAccount();
    let existingAccount = false;
    if (active) {
      existingAccount = true;
    } else {
      const existingByEmail = await findLocalAccountByEmail(email);
      existingAccount = existingByEmail !== null;
    }
    const mapped = mapLocalBackupData(file.data);
    const diff = active
      ? computeDiffSummary(mapped, await loadExistingKeys(active.accountId))
      : computeDiffSummary(mapped, EMPTY_KEYS);
    return {
      accountEmail: email,
      modeOptions: active ? ['overwrite', 'merge'] : ['merge'],
      diff,
      existingAccount,
    };
  },

  /** 执行导入：未激活 → 建本地账户 + 写入（自动激活）；已激活 → 覆盖/合并写入当前账户 */
  async importData(file: BackupFile, mode?: ImportMode): Promise<{ id: string; email: string }> {
    const email = file.account.email.trim().toLowerCase();
    const active = getActiveLocalAccount();
    const mapped = mapLocalBackupData(file.data);

    let accountId: string;
    if (!active) {
      const existingByEmail = await findLocalAccountByEmail(email);
      if (existingByEmail) throw new Error('该邮箱已存在本地账户，请选择该账户后从账户菜单导入');
      const account: LocalAccount = {
        accountId: generateUUID(),
        email,
        createdAt: file.account.createdAt,
      };
      await tx('accounts', 'readwrite', (t) => idbPut(t, 'accounts', account));
      setActiveLocalAccount(account);
      accountId = account.accountId;
    } else {
      if (active.email.toLowerCase() !== email) throw new Error('备份文件属于其他账号，无法导入当前账户');
      accountId = active.accountId;
    }

    const targetMode: ImportMode = !active ? 'merge' : mode ?? 'merge';
    await writeImportData(accountId, mapped, targetMode);
    return { id: accountId, email };
  },
};

/** 写导入数据：overwrite = 清空目标账户全部数据再插；merge = 先删目标账户内冲突行再插（先删后插防串号） */
async function writeImportData(accountId: string, mapped: LocalMappedData, mode: ImportMode): Promise<void> {
  await tx([...BUSINESS_STORES], 'readwrite', async (t) => {
    const deleteAllByAccount = async (name: StoreName) => {
      const rows = (await idbGetAll(t, name)) as Array<{ accountId?: string }>;
      for (const row of rows) {
        if (row.accountId !== accountId) continue;
        if (name === 'settings') {
          await idbDelete(t, name, [(row as LocalSetting).accountId, (row as LocalSetting).key]);
        } else {
          await idbDelete(t, name, (row as { id: string }).id);
        }
      }
    };

    if (mode === 'overwrite') {
      for (const name of BUSINESS_STORES) {
        await deleteAllByAccount(name);
      }
    }

    const write = async (name: StoreName, rows: Array<Record<string, unknown>>) => {
      if (rows.length === 0) return;
      // merge：先删目标账户内冲突行（reviews 按 id+reviewDate、settings 按 key、其余按 id），
      // 再纯插入文件行——与服务器「先删后插」语义一致，杜绝跨账户串号
      if (mode === 'merge') {
        const existing = (await idbGetAll(t, name)) as Array<Record<string, unknown>>;
        const targetRows = existing.filter((r) => r.accountId === accountId);
        if (name === 'reviews') {
          const ids = new Set(rows.map((r) => String(r.id)));
          const dates = new Set(rows.map((r) => String(r.reviewDate)));
          for (const row of targetRows) {
            if (ids.has(String(row.id)) || dates.has(String(row.reviewDate))) {
              await idbDelete(t, name, String(row.id));
            }
          }
        } else if (name === 'settings') {
          const keys = new Set(rows.map((r) => String(r.key)));
          for (const row of targetRows) {
            if (keys.has(String(row.key))) {
              await idbDelete(t, name, [String(row.accountId), String(row.key)]);
            }
          }
        } else {
          const ids = new Set(rows.map((r) => String(r.id)));
          for (const row of targetRows) {
            if (ids.has(String(row.id))) await idbDelete(t, name, String(row.id));
          }
        }
      }
      for (const row of rows) {
        await idbPut(t, name, { ...row, accountId });
      }
    };

    await write('presets', mapped.presets as unknown as Array<Record<string, unknown>>);
    await write('tasks', mapped.tasks as unknown as Array<Record<string, unknown>>);
    await write('reviews', mapped.reviews as unknown as Array<Record<string, unknown>>);
    await write('courses', mapped.courses as unknown as Array<Record<string, unknown>>);
    await write('episodes', mapped.episodes as unknown as Array<Record<string, unknown>>);
    await write('focusSessions', mapped.focusSessions as unknown as Array<Record<string, unknown>>);
    await write('studyRecords', mapped.studyRecords as unknown as Array<Record<string, unknown>>);
    await write('settings', mapped.settings as unknown as Array<Record<string, unknown>>);
  });
}

export const localStore = {
  presets,
  tasks,
  reviews,
  courses,
  focus,
  statistics,
  settings,
  backup,
};