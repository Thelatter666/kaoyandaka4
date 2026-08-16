# 数据导出 P1（Profile 下拉 + 服务器模式导出）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 顶栏新增 Profile 下拉（导出数据 / 登出），并提供 `GET /api/v1/export` 把当前账号全部业务数据导出为 `yantai-backup-YYYY-MM-DD.json`。

**Architecture:** 导出文件格式在 `shared/src/schemas/backup.ts` 定稿（schemaVersion 1，camelCase，保留原 UUID，不含 user_id）。服务端 `server/src/routes/export.ts` 用只读事务快照查询 8 张业务表 + users，经 `server/src/utils/backup.ts` 的 `buildBackupPayload` 纯函数映射组装，以 attachment 响应头下发。前端 `api.download()` 负责 blob 下载，`ProfileDropdown` 组件承载入口（P3 本地模式时 `backupApi.exportData()` 换本地实现，组件不变）。

**Tech Stack:** Express 4 + mysql2/promise + Zod（shared）、React 18 + framer-motion + lucide-react、Vitest（根 `vitest.config.ts`：`environment: 'node'`，include `**/*.test.ts`，排除 e2e/）。

## Global Constraints

- 无新增 npm 依赖
- 颜色一律 `var(--color-xxx)` tokens（`client/src/styles/tokens.css`），禁硬编码色值
- 动效只允许 transform/opacity，`useReducedMotion` 门控；`prefers-reduced-motion` 时无动效
- `user_id` 永不接受客户端传入；新路由在 `server/src/index.ts` 挂载层强制 `requireAuth`
- 导出为只读操作，无入参，无需 `validate()` 中间件
- 勿动 `client/vite.config.ts` 的 manualChunks 分包
- **Commit 纪律（项目工作流第 7 步）**：2026-08-16 用户已授权——**本执行过程内可自行 commit**（每任务检查点提交，消息遵循 `<type>(<scope>): <中文描述>` 惯例）；**绝不 push、绝不 merge**（等待用户检查效果后另行下令）

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `shared/src/schemas/backup.ts` | Create | 导出文件格式定稿（schema + 类型），P2/P3 复用 |
| `shared/src/schemas/backup.test.ts` | Create | BackupFileSchema 单测 |
| `shared/src/types/index.ts` | Modify | re-export BackupFile/BackupAccount/BackupSetting |
| `server/src/utils/backup.ts` | Create | `buildBackupPayload` 纯函数（snake_case→camelCase 映射） |
| `server/src/utils/backup.test.ts` | Create | buildBackupPayload 单测 |
| `server/src/routes/export.ts` | Create | `GET /api/v1/export` 路由（只读事务 + 响应头） |
| `server/src/index.ts` | Modify | 挂载 exportRouter（requireAuth） |
| `client/src/api/client.ts` | Modify | 抽 `throwIfNotOk`；新增 `api.download(path, filename)` |
| `client/src/api/backup.ts` | Create | `backupApi.exportData()` |
| `client/src/components/ui/ProfileDropdown.tsx` | Create | 账户菜单组件（trigger + 导出/登出） |
| `client/src/components/ui/ProfileDropdown.css` | Create | 组件样式（tokens + glass + reduced-motion） |
| `client/src/components/layout/TopNav.tsx` | Modify | 登出按钮替换为 ProfileDropdown |
| `client/src/components/layout/TopNav.css` | Modify | 清理 `.top-nav__logout` 规则 |

---

### Task 1: 共享导出格式 schema

**Files:**
- Create: `shared/src/schemas/backup.ts`
- Create: `shared/src/schemas/backup.test.ts`
- Modify: `shared/src/types/index.ts`

**Interfaces:**
- Produces: `BackupFileSchema`（Zod）、`BackupFile` / `BackupAccount` / `BackupSetting` 类型。Task 2 的 `buildBackupPayload` 返回 `BackupFile`；Task 3 响应体即 `BackupFile`。

- [ ] **Step 1: 写失败测试**

Create `shared/src/schemas/backup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BackupFileSchema } from './backup.js';

const validPayload = {
  format: 'kaoyandaily-backup',
  schemaVersion: 1,
  exportedAt: '2026-08-16T08:00:00.000Z',
  account: { email: 'user@example.com', passwordHash: '$2b$10$abc', createdAt: '2026-07-20T05:00:00.000Z' },
  data: {
    presets: [],
    tasks: [{
      id: 'task-1',
      taskDate: '2026-08-16',
      content: '做高数题',
      subject: 'math',
      subSubject: null,
      isCompleted: false,
      isImportant: true,
      sortOrder: 0,
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    }],
    reviews: [],
    courses: [],
    episodes: [],
    focusSessions: [],
    studyRecords: [],
    settings: [{ key: 'pomodoro_sound_enabled', value: '1' }],
  },
};

describe('BackupFileSchema', () => {
  it('接受合法的导出文件 payload', () => {
    expect(BackupFileSchema.safeParse(validPayload).success).toBe(true);
  });

  it('拒绝错误的 format 字面量', () => {
    expect(BackupFileSchema.safeParse({ ...validPayload, format: 'other' }).success).toBe(false);
  });

  it('拒绝错误的 schemaVersion', () => {
    expect(BackupFileSchema.safeParse({ ...validPayload, schemaVersion: 2 }).success).toBe(false);
  });

  it('settings 条目必须有 key 与 value 字符串', () => {
    const bad = { ...validPayload, data: { ...validPayload.data, settings: [{ key: 'k' }] } };
    expect(BackupFileSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run shared/src/schemas/backup.test.ts`
Expected: FAIL——`Cannot find module './backup.js'`（backup.ts 尚不存在）

- [ ] **Step 3: 实现 schema**

Create `shared/src/schemas/backup.ts`:

```ts
import { z } from 'zod';

/**
 * 导出文件格式（schemaVersion 1）——数据导出/导入/本地模式共用的格式定稿。
 * 字段命名全部 camelCase，与前端 API 模型一致；业务资源条目保留原 UUID id，
 * 不导出 user_id（导入时归入目标账户）。
 */

/** 宽松业务条目：id 必填，其余字段允许任意（P2 导入校验时再按资源收紧） */
export const BackupRecordSchema = z.object({ id: z.string() }).passthrough();

export const BackupAccountSchema = z.object({
  email: z.string().email(),
  passwordHash: z.string(),
  createdAt: z.string(),
});

export const BackupSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const BackupFileSchema = z.object({
  format: z.literal('kaoyandaily-backup'),
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  account: BackupAccountSchema,
  data: z.object({
    presets: z.array(BackupRecordSchema),
    tasks: z.array(BackupRecordSchema),
    reviews: z.array(BackupRecordSchema),
    courses: z.array(BackupRecordSchema),
    episodes: z.array(BackupRecordSchema),
    focusSessions: z.array(BackupRecordSchema),
    studyRecords: z.array(BackupRecordSchema),
    settings: z.array(BackupSettingSchema),
  }),
});

export type BackupFile = z.infer<typeof BackupFileSchema>;
export type BackupAccount = z.infer<typeof BackupAccountSchema>;
export type BackupSetting = z.infer<typeof BackupSettingSchema>;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run shared/src/schemas/backup.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: types re-export**

Modify `shared/src/types/index.ts`——在既有 re-export 后追加一行：

```ts
export type { BackupFile, BackupAccount, BackupSetting } from '../schemas/backup.js';
```

- [ ] **Step 6: 类型检查**

Run: `cd server && npx tsc --noEmit`（server tsconfig include 覆盖 shared/src）
Expected: 无错误

- [ ] **Step 7: Commit（检查点，待用户批准后由主对话执行）**

---

### Task 2: buildBackupPayload 纯函数

**Files:**
- Create: `server/src/utils/backup.ts`
- Create: `server/src/utils/backup.test.ts`

**Interfaces:**
- Consumes: `BackupFile`（Task 1）
- Produces: `ExportAccountRow`、`ExportRows`、`buildBackupPayload(account: ExportAccountRow, rows: ExportRows): BackupFile`。Task 3 的路由调用它。

- [ ] **Step 1: 写失败测试**

Create `server/src/utils/backup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBackupPayload } from './backup.js';
import { BackupFileSchema } from '../../../shared/src/schemas/backup.js';

const accountRow = { email: 'user@example.com', password_hash: '$2b$10$abc', created_at: '2026-07-20 05:00:00' };

const rows = {
  presets: [],
  tasks: [{
    id: 'task-1',
    task_date: '2026-08-16',
    content: '做高数题',
    subject: 'math',
    sub_subject: null,
    is_completed: 0,
    is_important: 1,
    sort_order: 2,
    created_at: '2026-08-16 08:00:00',
    updated_at: '2026-08-16 09:00:00',
  }],
  reviews: [],
  courses: [],
  episodes: [],
  focusSessions: [],
  studyRecords: [],
  settings: [{ setting_key: 'pomodoro_sound_enabled', setting_value: '1' }],
};

describe('buildBackupPayload', () => {
  it('字段映射 snake_case → camelCase 且不含 user_id', () => {
    const payload = buildBackupPayload(accountRow, rows);
    const task = payload.data.tasks[0]!;
    expect(task.taskDate).toBe('2026-08-16');
    expect(task.sortOrder).toBe(2);
    expect(JSON.stringify(payload)).not.toContain('user_id');
    expect(JSON.stringify(payload)).not.toContain('task_date');
  });

  it('布尔字段归一化为 boolean', () => {
    const payload = buildBackupPayload(accountRow, rows);
    const task = payload.data.tasks[0]!;
    expect(task.isCompleted).toBe(false);
    expect(task.isImportant).toBe(true);
  });

  it('account 映射为 { email, passwordHash, createdAt }', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(payload.account).toEqual({
      email: 'user@example.com',
      passwordHash: '$2b$10$abc',
      createdAt: '2026-07-20 05:00:00',
    });
  });

  it('settings 映射为 { key, value }', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(payload.data.settings).toEqual([{ key: 'pomodoro_sound_enabled', value: '1' }]);
  });

  it('focusSessions 可空数值列 actualDurationSeconds：NULL 导出为 null，非空保留数值', () => {
    const withSessions = {
      ...rows,
      focusSessions: [
        { id: 'fs-1', actual_duration_seconds: null, planned_duration_seconds: 1500, preset_name_snapshot: 'p', subject_snapshot: 'math', sub_subject_snapshot: null, started_at: '2026-08-16 08:00:00', planned_end_at: '2026-08-16 08:25:00', completed_at: null, status: 'in_progress', source: 'pomodoro', course_episode_id: null, task_id: null, created_at: '2026-08-16 08:00:00', updated_at: '2026-08-16 08:00:00' },
        { id: 'fs-2', actual_duration_seconds: 1500, planned_duration_seconds: 1500, preset_name_snapshot: 'p', subject_snapshot: 'math', sub_subject_snapshot: null, started_at: '2026-08-16 09:00:00', planned_end_at: '2026-08-16 09:25:00', completed_at: '2026-08-16 09:25:00', status: 'completed', source: 'pomodoro', course_episode_id: null, task_id: null, created_at: '2026-08-16 09:00:00', updated_at: '2026-08-16 09:25:00' },
      ],
    };
    const payload = buildBackupPayload(accountRow, withSessions);
    expect(payload.data.focusSessions[0]!.actualDurationSeconds).toBeNull();
    expect(payload.data.focusSessions[1]!.actualDurationSeconds).toBe(1500);
  });

  it('空资源导出为空数组且结构键齐全', () => {
    const empty = { presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [] };
    const payload = buildBackupPayload(accountRow, empty);
    expect(payload.data.reviews).toEqual([]);
    expect(Object.keys(payload.data)).toEqual([
      'presets', 'tasks', 'reviews', 'courses', 'episodes', 'focusSessions', 'studyRecords', 'settings',
    ]);
  });

  it('产出通过 BackupFileSchema 校验', () => {
    const payload = buildBackupPayload(accountRow, rows);
    expect(BackupFileSchema.safeParse(payload).success).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run server/src/utils/backup.test.ts`
Expected: FAIL——`Cannot find module './backup.js'`

- [ ] **Step 3: 实现纯函数**

Create `server/src/utils/backup.ts`:

```ts
import type { BackupFile } from '../../../shared/src/schemas/backup.js';

/** 账号原始行（users 表，snake_case） */
export interface ExportAccountRow {
  email: string;
  password_hash: string;
  created_at: string;
}

/** 单行原始数据（DB 形态），字段映射职责在本模块内完成 */
type Row = Record<string, unknown>;

/** 8 个业务资源的原始行集合 */
export interface ExportRows {
  presets: Row[];
  tasks: Row[];
  reviews: Row[];
  courses: Row[];
  episodes: Row[];
  focusSessions: Row[];
  studyRecords: Row[];
  settings: Row[];
}

/* 标量归一化辅助 */
const str = (v: unknown): string | null => (v == null ? null : String(v));
const strReq = (v: unknown): string => String(v);
const bool = (v: unknown): boolean => Boolean(v);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));

const mapPreset = (r: Row) => ({
  id: strReq(r.id),
  name: strReq(r.name),
  subject: strReq(r.subject),
  subSubject: str(r.sub_subject),
  durationMinutes: num(r.duration_minutes),
  lastUsedAt: str(r.last_used_at),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapTask = (r: Row) => ({
  id: strReq(r.id),
  taskDate: strReq(r.task_date),
  content: strReq(r.content),
  subject: strReq(r.subject),
  subSubject: str(r.sub_subject),
  isCompleted: bool(r.is_completed),
  isImportant: bool(r.is_important),
  sortOrder: num(r.sort_order),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapReview = (r: Row) => ({
  id: strReq(r.id),
  reviewDate: strReq(r.review_date),
  content: strReq(r.content),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapCourse = (r: Row) => ({
  id: strReq(r.id),
  name: strReq(r.name),
  subject: strReq(r.subject),
  subSubject: str(r.sub_subject),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapEpisode = (r: Row) => ({
  id: strReq(r.id),
  courseId: strReq(r.course_id),
  title: strReq(r.title),
  durationSeconds: num(r.duration_seconds),
  durationText: strReq(r.duration_text),
  sortOrder: num(r.sort_order),
  isCompleted: bool(r.is_completed),
  completedAt: str(r.completed_at),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapFocusSession = (r: Row) => ({
  id: strReq(r.id),
  presetId: str(r.preset_id),
  presetNameSnapshot: strReq(r.preset_name_snapshot),
  subjectSnapshot: strReq(r.subject_snapshot),
  subSubjectSnapshot: str(r.sub_subject_snapshot),
  plannedDurationSeconds: num(r.planned_duration_seconds),
  actualDurationSeconds: numOrNull(r.actual_duration_seconds), /* 可空列：NULL 原样导出为 null（防 Number(null)===0 改写） */
  startedAt: strReq(r.started_at),
  plannedEndAt: strReq(r.planned_end_at),
  completedAt: str(r.completed_at),
  status: strReq(r.status),
  source: strReq(r.source),
  courseEpisodeId: str(r.course_episode_id),
  taskId: str(r.task_id),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapStudyRecord = (r: Row) => ({
  id: strReq(r.id),
  presetNameSnapshot: strReq(r.preset_name_snapshot),
  subjectSnapshot: strReq(r.subject_snapshot),
  subSubjectSnapshot: str(r.sub_subject_snapshot),
  actualDurationSeconds: num(r.actual_duration_seconds),
  focusSessionId: str(r.focus_session_id),
  taskId: str(r.task_id),
  courseEpisodeId: str(r.course_episode_id),
  courseNameSnapshot: str(r.course_name_snapshot),
  episodeTitleSnapshot: str(r.episode_title_snapshot),
  source: strReq(r.source),
  notes: str(r.notes),
  createdAt: strReq(r.created_at),
  updatedAt: strReq(r.updated_at),
});

const mapSetting = (r: Row) => ({
  key: strReq(r.setting_key),
  value: strReq(r.setting_value),
});

/** 组装导出文件 payload（纯函数，可单测；exportedAt 取调用时刻 UTC ISO） */
export function buildBackupPayload(account: ExportAccountRow, rows: ExportRows): BackupFile {
  return {
    format: 'kaoyandaily-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: {
      email: account.email,
      passwordHash: account.password_hash,
      createdAt: account.created_at,
    },
    data: {
      presets: rows.presets.map(mapPreset),
      tasks: rows.tasks.map(mapTask),
      reviews: rows.reviews.map(mapReview),
      courses: rows.courses.map(mapCourse),
      episodes: rows.episodes.map(mapEpisode),
      focusSessions: rows.focusSessions.map(mapFocusSession),
      studyRecords: rows.studyRecords.map(mapStudyRecord),
      settings: rows.settings.map(mapSetting),
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run server/src/utils/backup.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit（检查点，待用户批准后由主对话执行）**

---

### Task 3: 导出路由 + 挂载

**Files:**
- Create: `server/src/routes/export.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `buildBackupPayload` / `ExportRows`（Task 2）
- Produces: `GET /api/v1/export`（requireAuth，attachment + no-store）。Task 4 的 `api.download('/export', ...)` 消费它。

- [ ] **Step 1: 实现路由**

Create `server/src/routes/export.ts`:

```ts
import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { formatDate } from '../utils/date.js';
import { buildBackupPayload } from '../utils/backup.js';

const router = Router();

// GET /api/v1/export — 导出当前账号全部业务数据（含账号信息）为备份文件
// 只读事务（REPEATABLE READ 快照）保证跨表一致性；查询按固定顺序保证导出内容确定性
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await withTransaction(async (connection) => {
      const [accountRows] = await connection.query<{ email: string; password_hash: string; created_at: string }[]>(
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
```

- [ ] **Step 2: 挂载路由**

Modify `server/src/index.ts`：

1. import 区（既有 8 个 router import 之后）追加：

```ts
import exportRouter from './routes/export.js';
```

2. 路由挂载区（`/api/v1/settings` 之后）追加：

```ts
app.use('/api/v1/export', requireAuth, exportRouter);
```

3. 启动日志（console.log 的 API routes 列表）追加一行：

```ts
console.log('  /api/v1/export');
```

- [ ] **Step 3: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 手测（curl 全流程）**

前提：本地 MySQL 可用。启动 dev：

```bash
npm run dev
```

新终端（注册账号拿会话 cookie，密码须 ≥8 位含字母数字；若已注册过改用 login）：

```bash
curl -s -c /tmp/yt-cookies.txt -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"export-test@yantai.local","password":"abc12345","confirmPassword":"abc12345"}'
```

导出并查看响应头：

```bash
curl -i -b /tmp/yt-cookies.txt http://localhost:3001/api/v1/export
```

Expected：
- `HTTP/1.1 200 OK`
- `Content-Disposition: attachment; filename="yantai-backup-YYYY-MM-DD.json"`（YYYY-MM-DD = 当天）
- `Cache-Control: no-store`
- body 为 JSON：`format: "kaoyandaily-backup"`、`schemaVersion: 1`、`account.email = export-test@yantai.local`、8 个资源键齐全

未登录验证（不带 cookie）：

```bash
curl -i http://localhost:3001/api/v1/export
```

Expected: `401` + `{"error":{"code":"UNAUTHORIZED",...}}`

- [ ] **Step 5: Commit（检查点，待用户批准后由主对话执行）**

---

### Task 4: 前端 api.download + backupApi

**Files:**
- Modify: `client/src/api/client.ts`
- Create: `client/src/api/backup.ts`

**Interfaces:**
- Consumes: `GET /api/v1/export`（Task 3）
- Produces: `api.download(path: string, filename: string): Promise<void>`、`backupApi.exportData(): Promise<void>`。Task 5 的 ProfileDropdown 调用 `backupApi.exportData()`。

- [ ] **Step 1: 重构 client.ts（抽 throwIfNotOk）**

Modify `client/src/api/client.ts`——将 `request()` 中的错误处理抽为公共函数，行为完全不变：

```ts
/** 非 2xx 统一处理：解析错误形状、401 触发全局登出（/auth/* 除外）、抛 ApiError */
async function throwIfNotOk(res: Response, path: string): Promise<void> {
  if (res.ok) return;
  let errorData: { error?: { code?: string; message?: string; details?: Array<{ field: string; message: string }> } } = {};
  try {
    errorData = await res.json();
  } catch {
    // ignore parse errors
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    unauthorizedHandler?.();
  }
  throw new ApiError(
    res.status,
    errorData.error?.code || 'UNKNOWN_ERROR',
    errorData.error?.message || `请求失败 (${res.status})`,
    errorData.error?.details
  );
}
```

`request()` 改为：

```ts
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    // 统一携带会话 cookie（vite proxy 同源下等价 same-origin；跨域部署时亦可工作）
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  await throwIfNotOk(res, path);

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

/** 下载文件：fetch → blob → 临时 <a download> 触发保存；文件名由调用方给定 */
async function download(path: string, filename: string): Promise<void> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { credentials: 'include' });
  await throwIfNotOk(res, path);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
```

`api` 对象追加：

```ts
  download: (path: string, filename: string) => download(path, filename),
```

- [ ] **Step 2: 新增 backupApi**

Create `client/src/api/backup.ts`:

```ts
import { api } from './client';
import { today } from '../utils/date';

/**
 * 备份导出（P1：服务器模式导出）。
 * P3 本地模式时本函数切换为本地实现（从 IndexedDB 组装同格式文件），ProfileDropdown 组件不变。
 */
export const backupApi = {
  /** 导出当前账号全部数据为 yantai-backup-YYYY-MM-DD.json */
  exportData: () => api.download('/export', `yantai-backup-${today()}.json`),
};
```

- [ ] **Step 3: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit（检查点，待用户批准后由主对话执行）**

---

### Task 5: ProfileDropdown 组件

**Files:**
- Create: `client/src/components/ui/ProfileDropdown.tsx`
- Create: `client/src/components/ui/ProfileDropdown.css`

**Interfaces:**
- Consumes: `useAuth()`（`user.email` / `logout`）、`backupApi.exportData()`（Task 4）、`showToast`（`./Toast`）
- Produces: `ProfileDropdown` 组件。Task 6 的 TopNav 渲染它。

- [ ] **Step 1: 实现组件**

Create `client/src/components/ui/ProfileDropdown.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Download, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { backupApi } from '../../api/backup';
import { showToast } from './Toast';
import './ProfileDropdown.css';

interface ProfileMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  action: () => void;
}

export function ProfileDropdown() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const email = user?.email ?? '';
  const initial = email ? email.charAt(0).toUpperCase() : '砚';

  /* 点击外部 / Escape 关闭（与 Dropdown.tsx 同一交互模式） */
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  /* 导出数据：下载 yantai-backup-YYYY-MM-DD.json；失败 toast（401 由全局登出接管） */
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await backupApi.exportData();
      showToast('success', '已导出');
    } catch {
      showToast('error', '导出失败');
    } finally {
      setExporting(false);
      setIsOpen(false);
    }
  };

  /* 登出：销毁会话并回到未登录分支（逻辑自 TopNav 迁入） */
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    showToast('success', '已退出登录');
  };

  const menuItems: ProfileMenuItem[] = [
    {
      key: 'export',
      label: '导出数据',
      icon: <Download size={16} strokeWidth={1.75} aria-hidden="true" />,
      disabled: exporting,
      action: () => { void handleExport(); },
    },
    {
      key: 'logout',
      label: '登出',
      icon: <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />,
      danger: true,
      disabled: loggingOut,
      action: () => { void handleLogout(); },
    },
  ];

  return (
    <div ref={rootRef} className="profile-dropdown">
      <button
        type="button"
        className="profile-dropdown__trigger glass-1"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="账户菜单"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="profile-dropdown__avatar" aria-hidden="true">{initial}</span>
        <span className="profile-dropdown__email">{email}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label="账户菜单"
            className="profile-dropdown__menu"
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="profile-dropdown__header">
              <span className="profile-dropdown__avatar" aria-hidden="true">{initial}</span>
              <span className="profile-dropdown__name">{email}</span>
            </div>
            <div className="profile-dropdown__divider" />
            {menuItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={item.danger ? 'profile-dropdown__item profile-dropdown__item--danger' : 'profile-dropdown__item'}
                disabled={item.disabled}
                onClick={item.action}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: 实现样式**

Create `client/src/components/ui/ProfileDropdown.css`:

```css
/* ============================================================
   砚台考研打卡 — ProfileDropdown 账户菜单（极光玻璃）
   参考视觉：头像圈 + 邮箱 trigger；菜单 = 账户信息 / 导出数据 / 登出
   双主题自适应（[data-theme] 令牌），禁止裸色值。
   ============================================================ */

.profile-dropdown {
  position: relative;
}

/* ---- Trigger：44px 玻璃胶囊，头像圈 + 邮箱（窄屏省略） ---- */

.profile-dropdown__trigger {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  height: 44px;
  padding: 0 var(--space-md) 0 6px;
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.profile-dropdown__trigger:hover {
  color: var(--color-text-primary);
  box-shadow: var(--shadow-glass-md);
}

.profile-dropdown__trigger:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}

.profile-dropdown__avatar {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-warning));
  color: var(--color-text-inverse);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
}

.profile-dropdown__email {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

/* ---- 菜单（glass 材质，悬浮于内容之上，z 高于导航层） ---- */

.profile-dropdown__menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: var(--z-dropdown);
  min-width: 220px;
  padding: var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg-strong);
  -webkit-backdrop-filter: blur(var(--blur-glass-strong)) saturate(1.4);
  backdrop-filter: blur(var(--blur-glass-strong)) saturate(1.4);
  box-shadow: var(--shadow-glass-lg);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .profile-dropdown__menu {
    background: var(--color-bg-card-solid);
  }
}

.profile-dropdown__header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
}

.profile-dropdown__name {
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-dropdown__divider {
  height: 1px;
  margin: var(--space-xs) 0;
  background: var(--color-border);
}

.profile-dropdown__item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 10px var(--space-sm);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.profile-dropdown__item:hover:not(:disabled) {
  background: var(--color-glass-bg);
}

.profile-dropdown__item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.profile-dropdown__item--danger {
  color: var(--color-accent-danger);
}

.profile-dropdown__item--danger:hover:not(:disabled) {
  background: var(--color-accent-primary-light);
  color: var(--color-accent-danger);
}

/* ---- 窄屏（<400px）：trigger 收至 40px 图标钮，邮箱隐藏 ---- */

@media (max-width: 399px) {
  .profile-dropdown__trigger {
    width: 40px;
    height: 40px;
    padding: 0 4px;
  }

  .profile-dropdown__email {
    display: none;
  }

  .profile-dropdown__avatar {
    width: 30px;
    height: 30px;
  }
}
```

- [ ] **Step 3: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit（检查点，待用户批准后由主对话执行）**

---

### Task 6: TopNav 改造 + 全量验证

**Files:**
- Modify: `client/src/components/layout/TopNav.tsx`
- Modify: `client/src/components/layout/TopNav.css`

**Interfaces:**
- Consumes: `ProfileDropdown`（Task 5）
- Produces: 顶栏右区 `ThemeToggle + ProfileDropdown`

- [ ] **Step 1: 改造 TopNav.tsx**

Modify `client/src/components/layout/TopNav.tsx`：

1. import 区：从 lucide-react 移除 `LogOut`；新增 `import { ProfileDropdown } from '../ui/ProfileDropdown';`；移除 `showToast` 与 `logoutAuth` 的 import（迁入 ProfileDropdown）：

```tsx
import React from 'react';
import {
  Home,
  ClipboardList,
  SlidersHorizontal,
  Timer,
  MonitorPlay,
  NotebookPen,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { ThemeToggle } from '../ui/ThemeToggle';
import { ProfileDropdown } from '../ui/ProfileDropdown';
import './TopNav.css';
```

2. 删除组件内的 `loggingOut` state 与 `handleLogout` 函数（约 45-54 行）。

3. 右区改为：

```tsx
      {/* 右：主题切换 + 账户菜单（导出数据 / 登出） */}
      <div className="top-nav__actions">
        <ThemeToggle />
        <ProfileDropdown />
      </div>
```

- [ ] **Step 2: 清理 TopNav.css**

Modify `client/src/components/layout/TopNav.css`：

1. 删除 `.top-nav__logout` 全部规则（151-188 行：基础样式 / hover / 位移 / active / disabled 五块）。
2. 注释 `/* 右：主题切换 + 退出登录 */` 改为 `/* 右：主题切换 + 账户菜单 */`。
3. `<400px` 媒体块中删除 `.top-nav__logout,` 选择器，仅保留：

```css
  .top-nav__actions .theme-toggle {
    width: 40px;
    height: 40px;
  }
```

（ProfileDropdown trigger 的 40px 收窄由 Task 5 的 ProfileDropdown.css 自己的 `@media (max-width: 399px)` 处理）

4. 删除文件末尾整个 `@media (prefers-reduced-motion: reduce)` 块（其中仅剩 logout 规则）。

- [ ] **Step 3: 全量验证**

```bash
npm run lint
npm run build
npx vitest run
```

Expected：lint 0 error；build 通过（client vite + server tsc）；vitest 全过（含既有 sound.test.ts + 新增 4+6 条）

- [ ] **Step 4: 手测清单（逐项）**

前置：`npm run dev` 运行中，浏览器 `http://localhost:5173`。

1. 登录（或注册）后：顶栏右侧为 `ThemeToggle + ProfileDropdown`（头像圈 + 邮箱）
2. 点击 trigger：菜单展开（淡入），含账户信息（邮箱）/ 分隔线 /「导出数据」/「登出」
3. 点击外部区域、按 Escape：菜单关闭
4. 点击「导出数据」：浏览器下载 `yantai-backup-YYYY-MM-DD.json`；用编辑器打开确认结构（format / schemaVersion / account / 8 资源键）；toast「已导出」
5. 点击「登出」：回到介绍页；toast「已退出登录」
6. 明暗主题切换后重开菜单：样式正常（无裸色值）
7. 系统开启 reduced-motion：菜单无淡入动画，直接出现
8. 窗口缩窄至 <400px：trigger 变为 40px 头像钮，邮箱隐藏，导航无溢出

- [ ] **Step 5: Commit（检查点，待用户批准后由主对话执行）**

---

## Self-Review 记录

- **Spec 覆盖**：格式定稿→T1；服务端导出→T2/T3；共享层→T1；前端下载→T4；ProfileDropdown→T5；TopNav→T6；错误处理→T4（throwIfNotOk 复用 401 全局登出）与 T5（toast/loading）；测试→各任务 + T6 手测清单；验收标准→T6 Step 3/4。
- **占位符**：无 TBD/TODO；每个代码步骤含完整代码。
- **类型一致性**：`buildBackupPayload(account: ExportAccountRow, rows: ExportRows): BackupFile` 在 T2 定义、T3 调用；`api.download(path, filename)` T4 定义、`backupApi.exportData()` T4 定义、T5 调用；`ProfileDropdown` T5 定义、T6 渲染；`BackupFileSchema` T1 定义、T2 测试引用。
