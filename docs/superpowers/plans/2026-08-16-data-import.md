# 数据导入 P2（服务器模式导入）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供 `POST /api/v1/import/preview`（差异对比）与 `POST /api/v1/import`（执行导入：未登录建号+数据+自动登录；已登录覆盖/合并），前端登录页与 Profile 下拉双入口。

**Architecture:** 复用 P1 定稿的 `BackupFileSchema` 校验上传文件。服务端三层：`utils/import-mapping.ts`（白名单严格映射 camelCase→snake_case）、`utils/import.ts`（差异计算/账号判定/SQL 构造纯函数）、`routes/import.ts`（preview + import 端点，不挂 requireAuth，内部读 session 自行分支）。合并 = 批量 `INSERT ... ON DUPLICATE KEY UPDATE`；覆盖 = 事务内清空 8 表重灌；未登录 = 建号（复用文件 bcrypt 哈希）+ 写入 + 建会话。前端 `ImportBackupModal` 组件承载"选文件→差异预览→模式选择→确认"，LoginPage 与 ProfileDropdown 共用。

**Tech Stack:** Express 4 + mysql2/promise + zod（shared）、React 18 + framer-motion + lucide-react、Vitest、bcrypt（校验哈希格式用正则，无需调用）。

## Global Constraints

- 无新增 npm 依赖
- 颜色一律 `var(--color-xxx)` tokens；动效只 transform/opacity + `useReducedMotion` 门控
- `user_id` 永不接受客户端传入（导入时服务端强制归入目标账号）
- `/api/v1/import` 不挂 `requireAuth`（未登录也要能导入）；登录态由路由内部读取 `req.session.userId` 自行分支
- 全局 `express.json({ limit: '20mb' })`（默认 100KB 不够装备份文件）
- 只支持 `schemaVersion: 1`（`BackupFileSchema` 的 literal(1) 已保证，>1 自然 400）
- 导入字段未知键一律丢弃；类型非法整体 400 回滚
- **Commit 纪律**：沿用 P1 授权——执行过程中任务完成且验证通过即可自行 commit（消息 `<type>(<scope>): <中文描述>`）；**绝不 push、绝不 merge**（等用户检查后另行下令）

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `shared/src/schemas/import.ts` | Create | ImportMode / DiffSummary / PreviewResponse / ImportRequest schema |
| `shared/src/schemas/import.test.ts` | Create | 上述 schema 单测 |
| `shared/src/types/index.ts` | Modify | re-export 新类型 |
| `server/src/utils/import-mapping.ts` | Create | 严格归一化器 + 8 资源白名单映射（camelCase→snake_case） |
| `server/src/utils/import-mapping.test.ts` | Create | 映射单测 |
| `server/src/utils/import.ts` | Create | computeDiffCounts / computeDiffSummary / resolveImportTarget / buildUpsertSql |
| `server/src/utils/import.test.ts` | Create | 差异/判定/SQL 单测 |
| `server/src/routes/import.ts` | Create | POST /import/preview + POST /import（限流 + validate） |
| `server/src/index.ts` | Modify | json limit 20mb + 挂载 importRouter（无 requireAuth） |
| `client/src/api/backup.ts` | Modify | previewImport / importData |
| `client/src/components/ui/ImportBackupModal.tsx` | Create | 导入向导（选文件→差异预览→模式选择→确认） |
| `client/src/components/ui/ImportBackupModal.css` | Create | 组件样式 |
| `client/src/pages/LoginPage.tsx` | Modify | 「从备份文件导入」入口 + Modal 接入 |
| `client/src/components/ui/ProfileDropdown.tsx` | Modify | 「导入数据」菜单项 + Modal 接入 |

---

### Task 1: 共享导入 schema

**Files:**
- Create: `shared/src/schemas/import.ts`
- Create: `shared/src/schemas/import.test.ts`
- Modify: `shared/src/types/index.ts`

**Interfaces:**
- Produces: `ImportModeSchema` / `DiffSummarySchema` / `ImportPreviewResponseSchema` / `ImportRequestSchema` 与类型。Task 2 的映射输出类型、Task 4 路由校验、Task 5 前端 API 均消费这些类型。

- [ ] **Step 1: 写失败测试**

Create `shared/src/schemas/import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ImportModeSchema, DiffSummarySchema, ImportPreviewResponseSchema, ImportRequestSchema } from './import.js';

const diff = {
  presets: { added: 1, updated: 0, kept: 0 },
  tasks: { added: 10, updated: 2, kept: 3 },
  reviews: { added: 1, updated: 1, kept: 0 },
  courses: { added: 1, updated: 0, kept: 0 },
  episodes: { added: 5, updated: 0, kept: 0 },
  focusSessions: { added: 8, updated: 0, kept: 0 },
  studyRecords: { added: 20, updated: 0, kept: 0 },
  settings: { added: 1, updated: 0, kept: 0 },
};

const validFile = {
  format: 'kaoyandaily-backup',
  schemaVersion: 1,
  exportedAt: '2026-08-16T08:00:00.000Z',
  account: { email: 'user@example.com', passwordHash: '$2b$10$OiyuEDFLLscTo1RkMg.86Ouwt4/H2eCII0k4rcVqBeqrgCNLTXQ0G', createdAt: '2026-07-20T05:00:00.000Z' },
  data: { presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [] },
};

describe('ImportModeSchema', () => {
  it('接受 overwrite / merge', () => {
    expect(ImportModeSchema.safeParse('overwrite').success).toBe(true);
    expect(ImportModeSchema.safeParse('merge').success).toBe(true);
  });
  it('拒绝其他值', () => {
    expect(ImportModeSchema.safeParse('delete').success).toBe(false);
  });
});

describe('DiffSummarySchema', () => {
  it('接受完整 diff', () => {
    expect(DiffSummarySchema.safeParse(diff).success).toBe(true);
  });
  it('拒绝负计数', () => {
    expect(DiffSummarySchema.safeParse({ ...diff, presets: { added: -1, updated: 0, kept: 0 } }).success).toBe(false);
  });
});

describe('ImportPreviewResponseSchema', () => {
  it('接受合法响应', () => {
    const res = { accountEmail: 'user@example.com', modeOptions: ['overwrite', 'merge'], diff, existingAccount: false };
    expect(ImportPreviewResponseSchema.safeParse(res).success).toBe(true);
  });
  it('未登录时 modeOptions 可仅含 merge', () => {
    const res = { accountEmail: 'user@example.com', modeOptions: ['merge'], diff, existingAccount: false };
    expect(ImportPreviewResponseSchema.safeParse(res).success).toBe(true);
  });
});

describe('ImportRequestSchema', () => {
  it('mode 可省略（未登录场景）', () => {
    expect(ImportRequestSchema.safeParse(validFile).success).toBe(true);
  });
  it('mode 可选 overwrite/merge', () => {
    expect(ImportRequestSchema.safeParse({ ...validFile, mode: 'overwrite' }).success).toBe(true);
    expect(ImportRequestSchema.safeParse({ ...validFile, mode: 'merge' }).success).toBe(true);
    expect(ImportRequestSchema.safeParse({ ...validFile, mode: 'other' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run shared/src/schemas/import.test.ts`
Expected: FAIL——`Cannot find module './import.js'`

- [ ] **Step 3: 实现 schema**

Create `shared/src/schemas/import.ts`:

```ts
import { z } from 'zod';
import { BackupFileSchema } from './backup.js';

/**
 * 导入（P2）——模式、差异摘要与请求/响应类型。
 * 差异摘要按 8 个资源统计「新增/更新/保留」，口径见设计文档（每表冲突键集合对比）。
 */

export const ImportModeSchema = z.enum(['overwrite', 'merge']);
export type ImportMode = z.infer<typeof ImportModeSchema>;

export const DiffItemSchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});
export type DiffItem = z.infer<typeof DiffItemSchema>;

export const DiffSummarySchema = z.object({
  presets: DiffItemSchema,
  tasks: DiffItemSchema,
  reviews: DiffItemSchema,
  courses: DiffItemSchema,
  episodes: DiffItemSchema,
  focusSessions: DiffItemSchema,
  studyRecords: DiffItemSchema,
  settings: DiffItemSchema,
});
export type DiffSummary = z.infer<typeof DiffSummarySchema>;

export const ImportPreviewResponseSchema = z.object({
  accountEmail: z.string().email(),
  modeOptions: z.array(ImportModeSchema),
  diff: DiffSummarySchema,
  existingAccount: z.boolean(),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

/** 导入请求 = 备份文件 + 可选模式（已登录必填，未登录省略） */
export const ImportRequestSchema = BackupFileSchema.extend({
  mode: ImportModeSchema.optional(),
});
export type ImportRequest = z.infer<typeof ImportRequestSchema>;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run shared/src/schemas/import.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: types re-export**

Modify `shared/src/types/index.ts` 末尾追加：

```ts
export type { ImportMode, DiffItem, DiffSummary, ImportPreviewResponse, ImportRequest } from '../schemas/import.js';
```

- [ ] **Step 6: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 7: Commit（检查点）**

```bash
git add shared/src/schemas/import.ts shared/src/schemas/import.test.ts shared/src/types/index.ts
git commit -m "feat(import): 共享导入 schema（模式/差异摘要/请求响应类型）"
```

---

### Task 2: 字段白名单严格映射

**Files:**
- Create: `server/src/utils/import-mapping.ts`
- Create: `server/src/utils/import-mapping.test.ts`

**Interfaces:**
- Consumes: `BackupFile['data']`（Task 1 之前的 backup schema）
- Produces: `MappingError`、`MappedData`（8 个 snake_case 行数组）、`mapBackupData(data: BackupFile['data']): MappedData`。Task 3 的 `computeDiffSummary` 与 Task 4 的 `buildUpsertSql` 消费 `MappedData`。

- [ ] **Step 1: 写失败测试**

Create `server/src/utils/import-mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapBackupData, MappingError } from './import-mapping.js';
import type { BackupFile } from '../../../shared/src/schemas/backup.js';

const data: BackupFile['data'] = {
  presets: [{ id: 'p1', name: '数学 25min', subject: 'math', subSubject: null, durationMinutes: 25, lastUsedAt: null, createdAt: '2026-08-01 08:00:00', updatedAt: '2026-08-01 08:00:00' }],
  tasks: [{ id: 't1', taskDate: '2026-08-16', content: '做题', subject: 'math', subSubject: null, isCompleted: false, isImportant: true, sortOrder: 0, createdAt: '2026-08-16 08:00:00', updatedAt: '2026-08-16 08:00:00' }],
  reviews: [{ id: 'r1', reviewDate: '2026-08-16', content: '复盘', createdAt: '2026-08-16 20:00:00', updatedAt: '2026-08-16 20:00:00' }],
  courses: [{ id: 'c1', name: '高数基础', subject: 'math', subSubject: null, createdAt: '2026-08-01 08:00:00', updatedAt: '2026-08-01 08:00:00' }],
  episodes: [{ id: 'e1', courseId: 'c1', title: '第1讲', durationSeconds: 1200, durationText: '20:00', sortOrder: 0, isCompleted: true, completedAt: '2026-08-16 10:00:00', createdAt: '2026-08-01 08:00:00', updatedAt: '2026-08-16 10:00:00' }],
  focusSessions: [{ id: 'f1', presetId: null, presetNameSnapshot: '数学 25min', subjectSnapshot: 'math', subSubjectSnapshot: null, plannedDurationSeconds: 1500, actualDurationSeconds: null, startedAt: '2026-08-16 09:00:00', plannedEndAt: '2026-08-16 09:25:00', completedAt: null, status: 'in_progress', source: 'pomodoro', courseEpisodeId: null, taskId: 't1', createdAt: '2026-08-16 09:00:00', updatedAt: '2026-08-16 09:00:00' }],
  studyRecords: [{ id: 's1', presetNameSnapshot: '数学 25min', subjectSnapshot: 'math', subSubjectSnapshot: null, actualDurationSeconds: 1500, focusSessionId: null, taskId: null, courseEpisodeId: null, courseNameSnapshot: null, episodeTitleSnapshot: null, source: 'focus_session', notes: null, createdAt: '2026-08-16 09:25:00', updatedAt: '2026-08-16 09:25:00' }],
  settings: [{ key: 'pomodoro_sound_enabled', value: '1' }],
};

describe('mapBackupData', () => {
  it('合法条目映射为 snake_case 行（camelCase→snake_case）', () => {
    const mapped = mapBackupData(data);
    expect(mapped.presets[0]).toMatchObject({ id: 'p1', sub_subject: null, duration_minutes: 25 });
    expect(mapped.tasks[0]).toMatchObject({ task_date: '2026-08-16', is_completed: false, is_important: true });
    expect(mapped.episodes[0]).toMatchObject({ course_id: 'c1', duration_seconds: 1200, is_completed: true });
    expect(mapped.focusSessions[0]).toMatchObject({ actual_duration_seconds: null, status: 'in_progress', task_id: 't1' });
    expect(mapped.settings[0]).toMatchObject({ setting_key: 'pomodoro_sound_enabled', setting_value: '1' });
  });

  it('未知字段被丢弃（不进入映射结果）', () => {
    const evil = { ...data, tasks: [{ ...data.tasks[0]!, hacker: 'x', user_id: 'other' }] };
    const mapped = mapBackupData(evil);
    expect(mapped.tasks[0]).not.toHaveProperty('hacker');
    expect(mapped.tasks[0]).not.toHaveProperty('user_id');
  });

  it('布尔严格归一化：拒绝字符串 yes', () => {
    const bad = { ...data, tasks: [{ ...data.tasks[0]!, isCompleted: 'yes' }] };
    expect(() => mapBackupData(bad)).toThrow(MappingError);
  });

  it('整数严格归一化：拒绝小数与字符串数字', () => {
    const bad1 = { ...data, presets: [{ ...data.presets[0]!, durationMinutes: 25.5 }] };
    const bad2 = { ...data, presets: [{ ...data.presets[0]!, durationMinutes: '25' }] };
    expect(() => mapBackupData(bad1)).toThrow(MappingError);
    expect(() => mapBackupData(bad2)).toThrow(MappingError);
  });

  it('枚举严格校验：非法 subject/status/source 拒绝', () => {
    const bad1 = { ...data, tasks: [{ ...data.tasks[0]!, subject: 'chinese' }] };
    const bad2 = { ...data, focusSessions: [{ ...data.focusSessions[0]!, status: 'paused' }] };
    expect(() => mapBackupData(bad1)).toThrow(MappingError);
    expect(() => mapBackupData(bad2)).toThrow(MappingError);
  });

  it('错误信息包含字段路径', () => {
    const bad = { ...data, tasks: [{ ...data.tasks[0]!, isCompleted: 'yes' }] };
    try {
      mapBackupData(bad);
      expect.unreachable('应抛出 MappingError');
    } catch (err) {
      expect(err).toBeInstanceOf(MappingError);
      const issues = (err as MappingError).issues;
      expect(issues[0]!.path).toContain('tasks');
      expect(issues[0]!.path).toContain('isCompleted');
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run server/src/utils/import-mapping.test.ts`
Expected: FAIL——`Cannot find module './import-mapping.js'`

- [ ] **Step 3: 实现映射**

Create `server/src/utils/import-mapping.ts`:

```ts
import type { BackupFile } from '../../../shared/src/schemas/backup.js';
import { SubjectEnum, SubSubjectEnum } from '../../../shared/src/schemas/common.js';

/**
 * 导入字段白名单严格映射（camelCase 条目 → snake_case DB 行）。
 * 只取已知字段（未知键丢弃）；类型严格归一化（非法整体 400，事务回滚）。
 */

export interface MappingIssue {
  path: string;
  message: string;
}

export class MappingError extends Error {
  constructor(public issues: MappingIssue[]) {
    super('导入数据校验失败');
    this.name = 'MappingError';
  }
}

type Row = Record<string, unknown>;

const fail = (path: string, message: string): never => {
  throw new MappingError([{ path, message }]);
};

const strRequired = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v.length === 0) fail(path, '必须为非空字符串');
  return v;
};

const strNullable = (v: unknown, path: string): string | null => {
  if (v === null || v === undefined) return null;
  return strRequired(v, path);
};

const boolStrict = (v: unknown, path: string): boolean => {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  fail(path, '必须为布尔值（true/false/1/0）');
};

const intRequired = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(path, '必须为整数');
  return v;
};

const intNullable = (v: unknown, path: string): number | null => {
  if (v === null || v === undefined) return null;
  return intRequired(v, path);
};

const enumStrict = (allowed: readonly string[]) => (v: unknown, path: string): string => {
  const s = strRequired(v, path);
  if (!allowed.includes(s)) fail(path, `必须为 ${allowed.join('/')}`);
  return s;
};

const SUBJECTS = SubjectEnum.options;
const SUB_SUBJECTS = SubSubjectEnum.options;
const SESSION_SUBJECTS = ['math', 'english', '408', 'free'] as const;
const FOCUS_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;
const FOCUS_SOURCES = ['pomodoro', 'plan', 'course'] as const;
const RECORD_SOURCES = ['focus_session', 'course_video'] as const;

const mapPreset = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  name: strRequired(e.name, `${p}.name`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`),
  sub_subject: strNullable(e.subSubject, `${p}.subSubject`),
  duration_minutes: intRequired(e.durationMinutes, `${p}.durationMinutes`),
  last_used_at: strNullable(e.lastUsedAt, `${p}.lastUsedAt`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapTask = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  task_date: strRequired(e.taskDate, `${p}.taskDate`),
  content: strRequired(e.content, `${p}.content`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`),
  sub_subject: strNullable(e.subSubject, `${p}.subSubject`),
  is_completed: boolStrict(e.isCompleted, `${p}.isCompleted`),
  is_important: boolStrict(e.isImportant, `${p}.isImportant`),
  sort_order: intRequired(e.sortOrder, `${p}.sortOrder`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapReview = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  review_date: strRequired(e.reviewDate, `${p}.reviewDate`),
  content: strRequired(e.content, `${p}.content`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapCourse = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  name: strRequired(e.name, `${p}.name`),
  subject: enumStrict(SUBJECTS)(e.subject, `${p}.subject`),
  sub_subject: strNullable(e.subSubject, `${p}.subSubject`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapEpisode = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  course_id: strRequired(e.courseId, `${p}.courseId`),
  title: strRequired(e.title, `${p}.title`),
  duration_seconds: intRequired(e.durationSeconds, `${p}.durationSeconds`),
  duration_text: strRequired(e.durationText, `${p}.durationText`),
  sort_order: intRequired(e.sortOrder, `${p}.sortOrder`),
  is_completed: boolStrict(e.isCompleted, `${p}.isCompleted`),
  completed_at: strNullable(e.completedAt, `${p}.completedAt`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapFocusSession = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  preset_id: strNullable(e.presetId, `${p}.presetId`),
  preset_name_snapshot: strRequired(e.presetNameSnapshot, `${p}.presetNameSnapshot`),
  subject_snapshot: enumStrict(SESSION_SUBJECTS)(e.subjectSnapshot, `${p}.subjectSnapshot`),
  sub_subject_snapshot: strNullable(e.subSubjectSnapshot, `${p}.subSubjectSnapshot`),
  planned_duration_seconds: intRequired(e.plannedDurationSeconds, `${p}.plannedDurationSeconds`),
  actual_duration_seconds: intNullable(e.actualDurationSeconds, `${p}.actualDurationSeconds`),
  started_at: strRequired(e.startedAt, `${p}.startedAt`),
  planned_end_at: strRequired(e.plannedEndAt, `${p}.plannedEndAt`),
  completed_at: strNullable(e.completedAt, `${p}.completedAt`),
  status: enumStrict(FOCUS_STATUSES)(e.status, `${p}.status`),
  source: enumStrict(FOCUS_SOURCES)(e.source, `${p}.source`),
  course_episode_id: strNullable(e.courseEpisodeId, `${p}.courseEpisodeId`),
  task_id: strNullable(e.taskId, `${p}.taskId`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapStudyRecord = (e: Record<string, unknown>, p: string): Row => ({
  id: strRequired(e.id, `${p}.id`),
  preset_name_snapshot: strRequired(e.presetNameSnapshot, `${p}.presetNameSnapshot`),
  subject_snapshot: enumStrict(SESSION_SUBJECTS)(e.subjectSnapshot, `${p}.subjectSnapshot`),
  sub_subject_snapshot: strNullable(e.subSubjectSnapshot, `${p}.subSubjectSnapshot`),
  actual_duration_seconds: intRequired(e.actualDurationSeconds, `${p}.actualDurationSeconds`),
  focus_session_id: strNullable(e.focusSessionId, `${p}.focusSessionId`),
  task_id: strNullable(e.taskId, `${p}.taskId`),
  course_episode_id: strNullable(e.courseEpisodeId, `${p}.courseEpisodeId`),
  course_name_snapshot: strNullable(e.courseNameSnapshot, `${p}.courseNameSnapshot`),
  episode_title_snapshot: strNullable(e.episodeTitleSnapshot, `${p}.episodeTitleSnapshot`),
  source: enumStrict(RECORD_SOURCES)(e.source, `${p}.source`),
  notes: strNullable(e.notes, `${p}.notes`),
  created_at: strRequired(e.createdAt, `${p}.createdAt`),
  updated_at: strRequired(e.updatedAt, `${p}.updatedAt`),
});

const mapSetting = (e: Record<string, unknown>, p: string): Row => ({
  setting_key: strRequired(e.key, `${p}.key`),
  setting_value: strRequired(e.value, `${p}.value`),
});

export interface MappedData {
  presets: Row[];
  tasks: Row[];
  reviews: Row[];
  courses: Row[];
  episodes: Row[];
  focusSessions: Row[];
  studyRecords: Row[];
  settings: Row[];
}

/** 把备份文件 data 映射为 snake_case 行集合（未知键丢弃；任一非法立即抛 MappingError） */
export function mapBackupData(data: BackupFile['data']): MappedData {
  return {
    presets: data.presets.map((e, i) => mapPreset(e as Record<string, unknown>, `data.presets[${i}]`)),
    tasks: data.tasks.map((e, i) => mapTask(e as Record<string, unknown>, `data.tasks[${i}]`)),
    reviews: data.reviews.map((e, i) => mapReview(e as Record<string, unknown>, `data.reviews[${i}]`)),
    courses: data.courses.map((e, i) => mapCourse(e as Record<string, unknown>, `data.courses[${i}]`)),
    episodes: data.episodes.map((e, i) => mapEpisode(e as Record<string, unknown>, `data.episodes[${i}]`)),
    focusSessions: data.focusSessions.map((e, i) => mapFocusSession(e as Record<string, unknown>, `data.focusSessions[${i}]`)),
    studyRecords: data.studyRecords.map((e, i) => mapStudyRecord(e as Record<string, unknown>, `data.studyRecords[${i}]`)),
    settings: data.settings.map((e, i) => mapSetting(e as Record<string, unknown>, `data.settings[${i}]`)),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run server/src/utils/import-mapping.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit（检查点）**

```bash
git add server/src/utils/import-mapping.ts server/src/utils/import-mapping.test.ts
git commit -m "feat(import): 字段白名单严格映射（camelCase→snake_case，未知键丢弃，类型严格归一化）"
```

---

### Task 3: 差异计算 / 账号判定 / SQL 构造

**Files:**
- Create: `server/src/utils/import.ts`
- Create: `server/src/utils/import.test.ts`

**Interfaces:**
- Consumes: `MappedData`（Task 2）
- Produces: `computeDiffCounts(fileCandidateKeys: string[][], existingKeys: Set<string>): DiffCounts`、`computeDiffSummary(fileData: MappedData, existing: ExistingKeys): DiffSummary`、`resolveImportTarget(opts): ImportTargetDecision`、`buildUpsertSql(table: string, rows: Row[], updateColumns: string[]): { sql: string; params: unknown[] } | null`、`TABLE_DEFS`（每表：列/更新列/冲突键）。Task 4 路由消费全部。

- [ ] **Step 1: 写失败测试**

Create `server/src/utils/import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeDiffCounts, computeDiffSummary, resolveImportTarget, buildUpsertSql, TABLE_DEFS,
} from './import.js';
import type { MappedData } from './import-mapping.js';

const emptyMapped: MappedData = {
  presets: [], tasks: [], reviews: [], courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [],
};

describe('computeDiffCounts', () => {
  it('added/updated/kept 统计正确（普通表：按 id）', () => {
    const fileKeys = [['a'], ['b'], ['c']];
    const existing = new Set(['b', 'c', 'd']);
    expect(computeDiffCounts(fileKeys, existing)).toEqual({ added: 1, updated: 2, kept: 1 });
  });

  it('reviews 复合键：id 或 reviewDate 任一冲突即 updated', () => {
    const fileKeys = [['r1', 'date:2026-08-16'], ['r2', 'date:2026-08-17']];
    const existing = new Set(['r9', 'date:2026-08-16']);
    // r1：id 不冲突但 date 冲突 → updated；r2：全不冲突 → added；kept：r9 不在文件键 → 1
    expect(computeDiffCounts(fileKeys, existing)).toEqual({ added: 1, updated: 1, kept: 1 });
  });
});

describe('computeDiffSummary', () => {
  it('汇总 8 资源（reviews 用复合键、settings 用 key）', () => {
    const fileData: MappedData = {
      ...emptyMapped,
      tasks: [{ id: 't1' }, { id: 't2' }],
      reviews: [{ id: 'r1', review_date: '2026-08-16' }],
      settings: [{ setting_key: 'pomodoro_sound_enabled' }],
    };
    const existing = {
      presets: [], tasks: ['t1', 't9'], reviews: { ids: [], dates: ['2026-08-16'] },
      courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: ['theme'],
    };
    const summary = computeDiffSummary(fileData, existing);
    expect(summary.tasks).toEqual({ added: 1, updated: 1, kept: 1 });
    expect(summary.reviews).toEqual({ added: 0, updated: 1, kept: 0 });
    expect(summary.settings).toEqual({ added: 1, updated: 0, kept: 1 });
    expect(summary.presets).toEqual({ added: 0, updated: 0, kept: 0 });
  });
});

describe('resolveImportTarget', () => {
  const fileEmail = 'user@example.com';

  it('未登录 + 邮箱未占用 → create', () => {
    const d = resolveImportTarget({ sessionUserId: undefined, fileEmail, existingAccountByEmail: null, currentUser: null });
    expect(d.ok).toBe(true);
    expect(d.target).toEqual({ kind: 'create', fileEmail, filePasswordHash: 'h', fileCreatedAt: 'c' });
    expect(d.existingAccount).toBe(false);
  });

  it('未登录 + 邮箱已占用 → EMAIL_TAKEN', () => {
    const d = resolveImportTarget({ sessionUserId: undefined, fileEmail, existingAccountByEmail: { id: 'x', email: fileEmail }, currentUser: null });
    expect(d.ok).toBe(false);
    expect(d.errorCode).toBe('EMAIL_TAKEN');
  });

  it('已登录 + 邮箱一致 → existing', () => {
    const d = resolveImportTarget({ sessionUserId: 'u1', fileEmail, existingAccountByEmail: { id: 'u1', email: fileEmail }, currentUser: { id: 'u1', email: fileEmail } });
    expect(d.ok).toBe(true);
    expect(d.target).toEqual({ kind: 'existing', userId: 'u1' });
  });

  it('已登录 + 邮箱不一致 → EMAIL_MISMATCH', () => {
    const d = resolveImportTarget({ sessionUserId: 'u1', fileEmail, existingAccountByEmail: null, currentUser: { id: 'u1', email: 'other@example.com' } });
    expect(d.ok).toBe(false);
    expect(d.errorCode).toBe('EMAIL_MISMATCH');
  });
});

describe('buildUpsertSql', () => {
  it('生成批量 upsert SQL（列固定、参数展开、更新列 VALUES）', () => {
    const rows = [{ id: 'a', content: 'x', sort_order: 1 }, { id: 'b', content: 'y', sort_order: 2 }];
    const r = buildUpsertSql('daily_tasks', rows, ['content', 'sort_order']);
    expect(r).not.toBeNull();
    expect(r!.sql).toContain('INSERT INTO daily_tasks (id, content, sort_order) VALUES');
    expect(r!.sql).toContain('ON DUPLICATE KEY UPDATE content=VALUES(content), sort_order=VALUES(sort_order)');
    expect(r!.params).toEqual(['a', 'x', 1, 'b', 'y', 2]);
  });

  it('空行返回 null', () => {
    expect(buildUpsertSql('daily_tasks', [], ['content'])).toBeNull();
  });

  it('TABLE_DEFS 覆盖 8 表且 reviews 更新列不含 id', () => {
    expect(Object.keys(TABLE_DEFS)).toEqual(['presets', 'tasks', 'reviews', 'courses', 'episodes', 'focusSessions', 'studyRecords', 'settings']);
    expect(TABLE_DEFS.reviews.updateColumns).not.toContain('id');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run server/src/utils/import.test.ts`
Expected: FAIL——`Cannot find module './import.js'`

- [ ] **Step 3: 实现**

Create `server/src/utils/import.ts`:

```ts
import type { MappedData } from './import-mapping.js';
import type { DiffSummary } from '../../../shared/src/schemas/import.js';

/**
 * 导入核心纯函数：差异计算 / 账号判定 / 批量 upsert SQL 构造。
 */

/* ---- 差异计算 ---- */

export interface DiffCounts {
  added: number;
  updated: number;
  kept: number;
}

/**
 * 按冲突键集合对比：
 * - 文件条目任一候选键命中现有键 → updated；否则 added
 * - kept = 现有键中不在文件候选键集合的数量
 * reviews 用复合候选键 [id, `date:${reviewDate}`]；其余表用 [id]。
 */
export function computeDiffCounts(fileCandidateKeys: string[][], existingKeys: Set<string>): DiffCounts {
  let added = 0;
  let updated = 0;
  for (const candidates of fileCandidateKeys) {
    if (candidates.some((c) => existingKeys.has(c))) updated++;
    else added++;
  }
  const fileSet = new Set(fileCandidateKeys.flat());
  let kept = 0;
  for (const k of existingKeys) {
    if (!fileSet.has(k)) kept++;
  }
  return { added, updated, kept };
}

export interface ExistingKeys {
  presets: string[];
  tasks: string[];
  reviews: { ids: string[]; dates: string[] };
  courses: string[];
  episodes: string[];
  focusSessions: string[];
  studyRecords: string[];
  settings: string[];
}

const toSet = (arr: string[]): Set<string> => new Set(arr);
const idKeys = (rows: Record<string, unknown>[]): string[][] => rows.map((r) => [String(r.id)]);

/** 汇总 8 资源差异摘要（口径见设计文档：每表冲突键集合对比） */
export function computeDiffSummary(fileData: MappedData, existing: ExistingKeys): DiffSummary {
  const reviewKeys = fileData.reviews.map((r) => [String(r.id), `date:${String(r.review_date)}`]);
  const reviewExisting = new Set([...existing.reviews.ids, ...existing.reviews.dates.map((d) => `date:${d}`)]);
  return {
    presets: computeDiffCounts(idKeys(fileData.presets), toSet(existing.presets)),
    tasks: computeDiffCounts(idKeys(fileData.tasks), toSet(existing.tasks)),
    reviews: computeDiffCounts(reviewKeys, reviewExisting),
    courses: computeDiffCounts(idKeys(fileData.courses), toSet(existing.courses)),
    episodes: computeDiffCounts(idKeys(fileData.episodes), toSet(existing.episodes)),
    focusSessions: computeDiffCounts(idKeys(fileData.focusSessions), toSet(existing.focusSessions)),
    studyRecords: computeDiffCounts(idKeys(fileData.studyRecords), toSet(existing.studyRecords)),
    settings: computeDiffCounts(
      fileData.settings.map((r) => [String(r.setting_key)]),
      toSet(existing.settings)
    ),
  };
}

/* ---- 账号判定 ---- */

export type ImportTarget =
  | { kind: 'create'; fileEmail: string; filePasswordHash: string; fileCreatedAt: string }
  | { kind: 'existing'; userId: string };

export interface ImportTargetDecision {
  ok: boolean;
  errorCode?: 'EMAIL_TAKEN' | 'EMAIL_MISMATCH';
  target?: ImportTarget;
  existingAccount: boolean;
}

export interface ResolveImportTargetOptions {
  sessionUserId: string | undefined;
  fileEmail: string;
  filePasswordHash: string;
  fileCreatedAt: string;
  /** 文件邮箱在 users 表中的匹配行（无则 null） */
  existingAccountByEmail: { id: string; email: string } | null;
  /** 已登录用户的当前行（未登录传 null） */
  currentUser: { id: string; email: string } | null;
}

/** 判定导入目标：未登录建号 / 未登录邮箱占用 409 / 已登录邮箱一致 / 不一致 409 */
export function resolveImportTarget(opts: ResolveImportTargetOptions): ImportTargetDecision {
  const { sessionUserId, fileEmail, filePasswordHash, fileCreatedAt, existingAccountByEmail, currentUser } = opts;

  if (!sessionUserId) {
    if (existingAccountByEmail) {
      return { ok: false, errorCode: 'EMAIL_TAKEN', existingAccount: true };
    }
    return {
      ok: true,
      target: { kind: 'create', fileEmail, filePasswordHash, fileCreatedAt },
      existingAccount: false,
    };
  }

  if (!currentUser || currentUser.email.toLowerCase() !== fileEmail.toLowerCase()) {
    return { ok: false, errorCode: 'EMAIL_MISMATCH', existingAccount: Boolean(existingAccountByEmail) };
  }
  return { ok: true, target: { kind: 'existing', userId: sessionUserId }, existingAccount: true };
}

/* ---- 批量 upsert SQL 构造 ---- */

export interface TableDef {
  table: string;
  /** ON DUPLICATE KEY UPDATE 的列（业务列，不含 id/user_id；reviews 不含 id 保留现有行 id） */
  updateColumns: string[];
  /** overwrite 模式的删除顺序（先删引用方） */
}

/** 8 表定义：表名 + upsert 更新列（删除顺序在路由中固定） */
export const TABLE_DEFS: Record<keyof MappedData, { table: string; updateColumns: string[] }> = {
  presets: { table: 'study_presets', updateColumns: ['name', 'subject', 'sub_subject', 'duration_minutes', 'last_used_at', 'created_at', 'updated_at'] },
  tasks: { table: 'daily_tasks', updateColumns: ['task_date', 'content', 'subject', 'sub_subject', 'is_completed', 'is_important', 'sort_order', 'created_at', 'updated_at'] },
  reviews: { table: 'daily_reviews', updateColumns: ['content', 'created_at', 'updated_at'] },
  courses: { table: 'online_courses', updateColumns: ['name', 'subject', 'sub_subject', 'created_at', 'updated_at'] },
  episodes: { table: 'course_episodes', updateColumns: ['course_id', 'title', 'duration_seconds', 'duration_text', 'sort_order', 'is_completed', 'completed_at', 'created_at', 'updated_at'] },
  focusSessions: { table: 'focus_sessions', updateColumns: ['preset_id', 'preset_name_snapshot', 'subject_snapshot', 'sub_subject_snapshot', 'planned_duration_seconds', 'actual_duration_seconds', 'started_at', 'planned_end_at', 'completed_at', 'status', 'source', 'course_episode_id', 'task_id', 'created_at', 'updated_at'] },
  studyRecords: { table: 'study_records', updateColumns: ['preset_name_snapshot', 'subject_snapshot', 'sub_subject_snapshot', 'actual_duration_seconds', 'focus_session_id', 'task_id', 'course_episode_id', 'course_name_snapshot', 'episode_title_snapshot', 'source', 'notes', 'created_at', 'updated_at'] },
  settings: { table: 'user_settings', updateColumns: ['setting_value'] },
};

/**
 * 构造批量 upsert：INSERT INTO t (cols) VALUES (...) ON DUPLICATE KEY UPDATE col=VALUES(col)...
 * 行对象键序即列序（映射函数产出固定键序）；空行返回 null。
 */
export function buildUpsertSql(
  table: string,
  rows: Record<string, unknown>[],
  updateColumns: string[]
): { sql: string; params: unknown[] } | null {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]!);
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const params = rows.flatMap((r) => columns.map((c) => r[c]));
  const updates = updateColumns.map((c) => `${c}=VALUES(${c})`).join(', ');
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
    params,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run server/src/utils/import.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit（检查点）**

```bash
git add server/src/utils/import.ts server/src/utils/import.test.ts
git commit -m "feat(import): 差异计算/账号判定/批量 upsert SQL 构造纯函数"
```

---

### Task 4: 导入路由 + 挂载

**Files:**
- Create: `server/src/routes/import.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: Task 1-3 全部（schema、mapBackupData、computeDiffSummary、resolveImportTarget、buildUpsertSql、TABLE_DEFS）
- Produces: `POST /api/v1/import/preview`、`POST /api/v1/import`。Task 5 前端 API 消费。

- [ ] **Step 1: 实现路由**

Create `server/src/routes/import.ts`:

```ts
import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { BackupFileSchema } from '../../../shared/src/schemas/backup.js';
import { ImportRequestSchema, ImportModeSchema } from '../../../shared/src/schemas/import.js';
import pool from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { generateUUID } from '../utils/uuid.js';
import { AppError } from '../middleware/errorHandler.js';
import { mapBackupData, MappingError } from '../utils/import-mapping.js';
import {
  computeDiffSummary, resolveImportTarget, buildUpsertSql, TABLE_DEFS,
  type ExistingKeys,
} from '../utils/import.js';
import type { RowDataPacket } from 'mysql2';

const router = Router();

// 导入限流：1 小时 5 次 / IP（防批量建号；与注册限流同级防护）
const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '导入过于频繁，请 1 小时后再试', details: [] } },
});

// 哈希格式校验：bcrypt 60 字符（cost 10 与项目一致）；不匹配即拒绝，防脏数据
const BCRYPT_RE = /^\$(2a|2b|2y)\$10\$[./A-Za-z0-9]{53}$/;

interface AccountRow extends RowDataPacket {
  id: string;
  email: string;
}

function assertHash(hash: string): void {
  if (!BCRYPT_RE.test(hash)) {
    throw new AppError(400, 'VALIDATION_ERROR', '备份文件账号密码哈希格式非法', [{ field: 'account.passwordHash', message: '不是合法的 bcrypt 哈希' }]);
  }
}

/** 查询文件邮箱对应账号（未登录判定用） */
async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const [rows] = await pool.query<AccountRow[]>('SELECT id, email FROM users WHERE email = ?', [email]);
  return rows[0] ?? null;
}

/** 查询当前会话用户（已登录判定用） */
async function findUserById(id: string): Promise<AccountRow | null> {
  const [rows] = await pool.query<AccountRow[]>('SELECT id, email FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/** 查询目标账号现有冲突键集合（preview 与 import 的 kept 统计） */
async function loadExistingKeys(userId: string): Promise<ExistingKeys> {
  const [presets] = await pool.query<RowDataPacket[]>('SELECT id FROM study_presets WHERE user_id = ?', [userId]);
  const [tasks] = await pool.query<RowDataPacket[]>('SELECT id FROM daily_tasks WHERE user_id = ?', [userId]);
  const [reviews] = await pool.query<RowDataPacket[]>('SELECT id, review_date FROM daily_reviews WHERE user_id = ?', [userId]);
  const [courses] = await pool.query<RowDataPacket[]>('SELECT id FROM online_courses WHERE user_id = ?', [userId]);
  const [episodes] = await pool.query<RowDataPacket[]>('SELECT id FROM course_episodes WHERE user_id = ?', [userId]);
  const [focusSessions] = await pool.query<RowDataPacket[]>('SELECT id FROM focus_sessions WHERE user_id = ?', [userId]);
  const [studyRecords] = await pool.query<RowDataPacket[]>('SELECT id FROM study_records WHERE user_id = ?', [userId]);
  const [settings] = await pool.query<RowDataPacket[]>('SELECT setting_key FROM user_settings WHERE user_id = ?', [userId]);
  return {
    presets: presets.map((r) => String(r.id)),
    tasks: tasks.map((r) => String(r.id)),
    reviews: { ids: reviews.map((r) => String(r.id)), dates: reviews.map((r) => String(r.review_date)) },
    courses: courses.map((r) => String(r.id)),
    episodes: episodes.map((r) => String(r.id)),
    focusSessions: focusSessions.map((r) => String(r.id)),
    studyRecords: studyRecords.map((r) => String(r.id)),
    settings: settings.map((r) => String(r.setting_key)),
  };
}

// POST /api/v1/import/preview — 差异对比（无副作用）
router.post('/preview', importLimiter, validate(BackupFileSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as typeof BackupFileSchema._type;
    const fileEmail = payload.account.email.trim().toLowerCase();
    const sessionUserId = req.session.userId;

    const existing = await findAccountByEmail(fileEmail);
    const currentUser = sessionUserId ? await findUserById(sessionUserId) : null;

    const decision = resolveImportTarget({
      sessionUserId,
      fileEmail,
      filePasswordHash: payload.account.passwordHash,
      fileCreatedAt: payload.account.createdAt,
      existingAccountByEmail: existing,
      currentUser,
    });

    const mapped = mapBackupData(payload.data);
    const diff = decision.target && decision.target.kind === 'existing'
      ? computeDiffSummary(mapped, await loadExistingKeys(decision.target.userId))
      : computeDiffSummary(mapped, {
          presets: [], tasks: [], reviews: { ids: [], dates: [] },
          courses: [], episodes: [], focusSessions: [], studyRecords: [], settings: [],
        });

    res.json({
      accountEmail: fileEmail,
      modeOptions: sessionUserId ? ['overwrite', 'merge'] : ['merge'],
      diff,
      existingAccount: decision.existingAccount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/import — 执行导入（未登录建号+数据+自动登录；已登录覆盖/合并）
router.post('/', importLimiter, validate(ImportRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as typeof ImportRequestSchema._type;
    const fileEmail = payload.account.email.trim().toLowerCase();
    const sessionUserId = req.session.userId;

    assertHash(payload.account.passwordHash);
    const existing = await findAccountByEmail(fileEmail);
    const currentUser = sessionUserId ? await findUserById(sessionUserId) : null;

    const decision = resolveImportTarget({
      sessionUserId,
      fileEmail,
      filePasswordHash: payload.account.passwordHash,
      fileCreatedAt: payload.account.createdAt,
      existingAccountByEmail: existing,
      currentUser,
    });
    if (!decision.ok || !decision.target) {
      const message = decision.errorCode === 'EMAIL_TAKEN'
        ? '该邮箱已注册，请登录后从账户菜单导入'
        : '备份文件属于其他账号，无法导入当前账号';
      throw new AppError(409, decision.errorCode!, message);
    }

    // 先映射（纯函数早失败，避免事务空转）；失败整体 400
    let mapped: ReturnType<typeof mapBackupData>;
    try {
      mapped = mapBackupData(payload.data);
    } catch (err) {
      if (err instanceof MappingError) {
        throw new AppError(400, 'VALIDATION_ERROR', '导入数据校验失败', err.issues.map((i) => ({ field: i.path, message: i.message })));
      }
      throw err;
    }

    const mode: 'overwrite' | 'merge' = decision.target.kind === 'create'
      ? 'merge'
      : (payload.mode ?? 'merge');
    if (decision.target.kind === 'existing' && payload.mode && !ImportModeSchema.safeParse(payload.mode).success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'mode 必须为 overwrite 或 merge');
    }

    const targetUserId = await withTransaction(async (connection) => {
      let userId = decision.target!.kind === 'existing' ? decision.target!.userId : '';

      if (decision.target!.kind === 'create') {
        const newId = generateUUID();
        await connection.query(
          'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
          [newId, fileEmail, payload.account.passwordHash, payload.account.createdAt]
        );
        userId = newId;
      }

      if (mode === 'overwrite') {
        // 删除顺序：先删引用方（episodes 引用 courses），其余无交叉外键
        const order: (keyof typeof TABLE_DEFS)[] = ['episodes', 'courses', 'focusSessions', 'studyRecords', 'tasks', 'reviews', 'presets', 'settings'];
        for (const key of order) {
          await connection.query(`DELETE FROM ${TABLE_DEFS[key].table} WHERE user_id = ?`, [userId]);
        }
      }

      const write = async (key: keyof typeof TABLE_DEFS, rows: Record<string, unknown>[]) => {
        const withUser = rows.map((r) => ({ ...r, user_id: userId }));
        const stmt = buildUpsertSql(TABLE_DEFS[key].table, withUser, TABLE_DEFS[key].updateColumns);
        if (stmt) await connection.query(stmt.sql, stmt.params);
      };

      await write('presets', mapped.presets);
      await write('tasks', mapped.tasks);
      await write('reviews', mapped.reviews);
      await write('courses', mapped.courses);
      await write('episodes', mapped.episodes);
      await write('focusSessions', mapped.focusSessions);
      await write('studyRecords', mapped.studyRecords);
      await write('settings', mapped.settings);

      return userId;
    });

    // 未登录导入：事务提交后建立会话（自动登录）
    if (decision.target.kind === 'create') {
      req.session.userId = targetUserId;
    }

    res.json({ id: targetUserId, email: fileEmail });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: 挂载与 limit**

Modify `server/src/index.ts`：

1. `app.use(express.json());` 改为 `app.use(express.json({ limit: '20mb' }));`（注释：备份文件可达 MB 级，默认 100KB 不够）
2. import 区追加：`import importRouter from './routes/import.js';`
3. 挂载（与 auth 并列，**不挂 requireAuth**，未登录也要能导入）：

```ts
app.use('/api/v1/import', importRouter);
```

4. 启动日志追加：`console.log('  /api/v1/import');`

- [ ] **Step 3: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 集成手测（curl）**

前置：`npm run dev` 运行中（若未运行则启动）。

准备两个测试账号的数据（A 环境 = export-test2@yantai.local / abc12345，已有数据）：
```bash
# 1. 导出 A 环境文件
curl -s -c /tmp/yt-a.txt -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"export-test2@yantai.local","password":"abc12345"}'
curl -s -b /tmp/yt-a.txt http://localhost:3001/api/v1/export -o /tmp/backup-a.json

# 2. 未登录 preview（应 modeOptions=["merge"]、existingAccount=false）
curl -s -X POST http://localhost:3001/api/v1/import/preview -H 'Content-Type: application/json' --data @/tmp/backup-a.json | head -c 400

# 3. 未登录导入（新账号 import-test@yantai.local）→ 200 + 新账号 + 会话 cookie
sed 's/export-test2@yantai.local/import-test@yantai.local/g' /tmp/backup-a.json > /tmp/backup-b.json
curl -s -c /tmp/yt-b.txt -X POST http://localhost:3001/api/v1/import -H 'Content-Type: application/json' --data @/tmp/backup-b.json

# 4. 用新会话导出对比（数据一致；tasks 数与 A 相同）
curl -s -b /tmp/yt-b.txt http://localhost:3001/api/v1/export -o /tmp/backup-b2.json
python3 -c "import json;a=json.load(open('/tmp/backup-b2.json'));print('tasks',len(a['data']['tasks']),'records',len(a['data']['studyRecords']))"

# 5. 未登录重复导入同邮箱 → 409 EMAIL_TAKEN
curl -s -X POST http://localhost:3001/api/v1/import -H 'Content-Type: application/json' --data @/tmp/backup-b.json

# 6. 已登录 preview（B 账号会话；文件邮箱不一致 → 该分支由 import 拦截；preview 无 EMAIL_MISMATCH 校验，看 diff）
# 7. 已登录 + 邮箱一致：把文件邮箱改回 import-test 再导入（merge）
sed 's/export-test2@yantai.local/import-test@yantai.local/g' /tmp/backup-a.json > /tmp/backup-b3.json
python3 -c "import json;d=json.load(open('/tmp/backup-b3.json'));d['mode']='merge';json.dump(d,open('/tmp/import-merge.json','w'))"
curl -s -b /tmp/yt-b.txt -X POST http://localhost:3001/api/v1/import -H 'Content-Type: application/json' --data @/tmp/import-merge.json

# 8. 边界：schemaVersion 2 → 400
python3 -c "import json;d=json.load(open('/tmp/backup-a.json'));d['schemaVersion']=2;json.dump(d,open('/tmp/backup-v2.json','w'))"
curl -s -X POST http://localhost:3001/api/v1/import -H 'Content-Type: application/json' --data @/tmp/backup-v2.json
```

Expected：步骤 2 返回 200 与摘要；3 返回新账号并建会话；4 数据条数一致；5 返回 409 EMAIL_TAKEN；7 返回 200；8 返回 400 VALIDATION_ERROR。手测中的实际输出记录到报告。

- [ ] **Step 5: 全量验证**

```bash
npx vitest run
npm run lint
```

Expected：vitest 全绿（含既有 17 条 + 新增）；lint 无新增问题（既有 Modal.tsx error 除外）。

- [ ] **Step 6: Commit（检查点）**

```bash
git add server/src/routes/import.ts server/src/index.ts
git commit -m "feat(import): POST /import/preview 差异对比 + POST /import 执行导入（建号/覆盖/合并）"
```

（路由逻辑无独立纯函数可单测——纯函数已由 Task 2/3 单测覆盖，路由由本步 curl 集成验证。）

---

### Task 5: 前端 backup API 扩展

**Files:**
- Modify: `client/src/api/backup.ts`

**Interfaces:**
- Consumes: Task 1 类型（`ImportMode` / `ImportPreviewResponse`）
- Produces: `backupApi.previewImport(file: BackupFile): Promise<ImportPreviewResponse>`、`backupApi.importData(file: BackupFile, mode?: ImportMode): Promise<{ id: string; email: string }>`。Task 6 的 ImportBackupModal 消费。

- [ ] **Step 1: 实现**

Modify `client/src/api/backup.ts`（整体替换为）：

```ts
import { api } from './client';
import { today } from '../utils/date';
import type { BackupFile } from '@shared/types';
import type { ImportMode, ImportPreviewResponse } from '@shared/types';

/**
 * 备份导出/导入（P1 导出 + P2 导入）。
 * P3 本地模式时本模块切换为本地实现，组件不变。
 */
export const backupApi = {
  /** 导出当前账号全部数据为 yantai-backup-YYYY-MM-DD.json */
  exportData: () => api.download('/export', `yantai-backup-${today()}.json`),

  /** 差异对比（未登录/已登录均可用）：返回摘要与邮箱占用状态 */
  previewImport: (file: BackupFile) => api.post<ImportPreviewResponse>('/import/preview', file),

  /** 执行导入；mode 已登录必填（overwrite/merge），未登录省略 */
  importData: (file: BackupFile, mode?: ImportMode) =>
    api.post<{ id: string; email: string }>('/import', mode ? { ...file, mode } : file),
};
```

- [ ] **Step 2: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit（检查点）**

```bash
git add client/src/api/backup.ts
git commit -m "feat(import): 前端 backupApi 增加 previewImport/importData"
```

---

### Task 6: ImportBackupModal 组件

**Files:**
- Create: `client/src/components/ui/ImportBackupModal.tsx`
- Create: `client/src/components/ui/ImportBackupModal.css`

**Interfaces:**
- Consumes: `backupApi.previewImport/importData`（Task 5）、`Modal`、`Button`、`ConfirmDialog`、`showToast`、`ApiError`
- Produces: `ImportBackupModal({ isOpen, onClose, onImported })`。Task 7 的 LoginPage 与 ProfileDropdown 接入。

- [ ] **Step 1: 实现组件**

Create `client/src/components/ui/ImportBackupModal.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import { Upload, FileJson, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { showToast } from './Toast';
import { backupApi } from '../../api/backup';
import { ApiError } from '../../api/client';
import type { BackupFile } from '@shared/types';
import type { ImportMode, ImportPreviewResponse, DiffSummary } from '@shared/types';
import './ImportBackupModal.css';

const RESOURCE_LABELS: Record<keyof DiffSummary, string> = {
  presets: '学习预设',
  tasks: '每日任务',
  reviews: '每日复盘',
  courses: '网课',
  episodes: '网课集数',
  focusSessions: '专注会话',
  studyRecords: '学习记录',
  settings: '用户设置',
};

interface ImportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 导入成功回调（调用方决定跳转/刷新） */
  onImported: (result: { id: string; email: string }) => void;
}

type Step = 'pick' | 'preview' | 'done';

export function ImportBackupModal({ isOpen, onClose, onImported }: ImportBackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const reset = () => {
    setStep('pick');
    setFileName('');
    setPreview(null);
    setError(null);
    setBusy(false);
    setConfirmOverwrite(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const pickFile = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFile;
      // 本地形状检查（服务端仍会完整校验 BackupFileSchema）
      if (parsed.format !== 'kaoyandaily-backup' || parsed.schemaVersion !== 1 || !parsed.account || !parsed.data) {
        throw new Error('不是有效的砚台备份文件');
      }
      const result = await backupApi.previewImport(parsed);
      setFileName(file.name);
      setPreview(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '文件读取失败');
      setStep('pick');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (mode?: ImportMode) => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      // 重新读取文件内容（组件不缓存文件对象，避免大文件驻留内存）
      const file = fileInputRef.current?.files?.[0];
      if (!file) throw new Error('文件已失效，请重新选择');
      const parsed = JSON.parse(await file.text()) as BackupFile;
      const result = await backupApi.importData(parsed, mode);
      showToast('success', '导入完成');
      onImported(result);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const canImport = preview && !preview.existingAccount;

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="从备份文件导入">
        <div className="import-modal">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="import-modal__input"
            onChange={(e) => { void handleFile(e); }}
            aria-hidden="true"
            tabIndex={-1}
          />

          {step === 'pick' && (
            <div className="import-modal__pick">
              <button type="button" className="import-modal__pick-btn" onClick={pickFile} disabled={busy}>
                <Upload size={20} strokeWidth={1.75} aria-hidden="true" />
                {busy ? '正在分析文件...' : '选择备份文件（.json）'}
              </button>
              <p className="import-modal__hint">
                支持 P1 导出的 yantai-backup-*.json（schemaVersion 1）
              </p>
              {error && (
                <p className="import-modal__error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="import-modal__preview">
              <div className="import-modal__file">
                <FileJson size={16} strokeWidth={1.75} aria-hidden="true" />
                {fileName}
              </div>

              <div className="import-modal__account">
                备份账号：<strong>{preview.accountEmail}</strong>
              </div>

              {preview.existingAccount && (
                <p className="import-modal__warning" role="alert">
                  <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
                  该邮箱已注册。请登录该账号后，从账户菜单的「导入数据」导入。
                </p>
              )}

              {!preview.existingAccount && (
                <>
                  <table className="import-modal__diff">
                    <thead>
                      <tr>
                        <th>数据</th>
                        <th>新增</th>
                        <th>更新</th>
                        <th>保留</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(preview.diff) as (keyof DiffSummary)[]).map((key) => {
                        const d = preview.diff[key];
                        if (d.added === 0 && d.updated === 0 && d.kept === 0) return null;
                        return (
                          <tr key={key}>
                            <td>{RESOURCE_LABELS[key]}</td>
                            <td>{d.added}</td>
                            <td>{d.updated}</td>
                            <td>{d.kept}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="import-modal__hint">
                    更新 = 与现有数据冲突，将以备份文件为准；保留 = 仅当前账号有，不受影响。
                  </p>
                </>
              )}

              {error && (
                <p className="import-modal__error" role="alert">
                  {error}
                </p>
              )}

              {canImport && (
                <div className="import-modal__actions">
                  {preview.modeOptions.includes('merge') && (
                    <Button variant="primary" loading={busy} onClick={() => { void runImport('merge'); }}>
                      合并导入
                    </Button>
                  )}
                  {preview.modeOptions.includes('overwrite') && (
                    <Button variant="danger" loading={busy} onClick={() => setConfirmOverwrite(true)}>
                      覆盖导入
                    </Button>
                  )}
                  <Button variant="ghost" disabled={busy} onClick={handleClose}>
                    取消
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOverwrite}
        onClose={() => setConfirmOverwrite(false)}
        onConfirm={() => { void runImport('overwrite'); }}
        title="确认覆盖导入？"
        message="覆盖将清空当前账号的全部数据（任务/复盘/预设/网课/专注/记录/设置），以备份文件为准。"
        detail="强烈建议先「导出数据」备份当前数据。"
        confirmLabel="确认覆盖"
        destructive
      />
    </>
  );
}
```

**已核实**：`Button` 的 variant 支持 `primary/glass/ghost/danger`（含 `loading` prop）；`ConfirmDialog` 的 props 为 `isOpen/onClose/onConfirm/title/message/detail?/confirmLabel?/cancelLabel?/destructive?`（默认 destructive=true，确认后自动 onClose）。

- [ ] **Step 2: 实现样式**

Create `client/src/components/ui/ImportBackupModal.css`:

```css
/* 导入备份 Modal（P2）：选文件 → 差异预览 → 覆盖/合并 */
.import-modal__input {
  display: none;
}

.import-modal__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) 0;
}

.import-modal__pick-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 12px var(--space-lg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out);
}

.import-modal__pick-btn:hover:not(:disabled) {
  border-color: var(--color-accent-primary);
  background: var(--color-glass-bg-strong);
}

.import-modal__pick-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.import-modal__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.import-modal__error {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-accent-primary-light);
  color: var(--color-accent-danger);
  font-size: var(--text-sm);
}

.import-modal__file {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.import-modal__account {
  margin: var(--space-sm) 0;
  color: var(--color-text-primary);
  font-size: var(--text-base);
}

.import-modal__warning {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: var(--space-sm) 0;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-accent-warning-light);
  color: var(--color-accent-warning-strong);
  font-size: var(--text-sm);
}

.import-modal__diff {
  width: 100%;
  margin: var(--space-sm) 0;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.import-modal__diff th,
.import-modal__diff td {
  padding: 6px var(--space-sm);
  border-bottom: 1px solid var(--color-border);
  text-align: right;
}

.import-modal__diff th:first-child,
.import-modal__diff td:first-child {
  text-align: left;
  color: var(--color-text-secondary);
}

.import-modal__diff th {
  color: var(--color-text-muted);
  font-weight: var(--font-medium);
}

.import-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}
```

- [ ] **Step 3: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无错误（Button/ConfirmDialog 签名已核实匹配）

- [ ] **Step 4: Commit（检查点）**

```bash
git add client/src/components/ui/ImportBackupModal.tsx client/src/components/ui/ImportBackupModal.css
git commit -m "feat(import): ImportBackupModal 导入向导（选文件/差异预览/覆盖合并）"
```

---

### Task 7: 登录页与 ProfileDropdown 接入 + 全量验证

**Files:**
- Modify: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/pages/AuthPage.css`
- Modify: `client/src/components/ui/ProfileDropdown.tsx`

**Interfaces:**
- Consumes: `ImportBackupModal`（Task 6）、`applyAuthUser`（useAuth）

- [ ] **Step 1: LoginPage 接入**

Modify `client/src/pages/LoginPage.tsx`：

1. import 追加：

```tsx
import { useState } from 'react';
import { ImportBackupModal } from '../components/ui/ImportBackupModal';
```

2. 组件内加 state：`const [importOpen, setImportOpen] = useState(false);`

3. 「还没有账号？免费注册」p 标签后追加：

```tsx
          <button
            type="button"
            className="auth-card__import"
            onClick={() => setImportOpen(true)}
          >
            从备份文件导入
          </button>
```

4. `</div>`（auth-card 闭合）前追加 Modal：

```tsx
          <ImportBackupModal
            isOpen={importOpen}
            onClose={() => setImportOpen(false)}
            onImported={(user) => {
              applyAuthUser(user);
              window.location.hash = '#/';
            }}
          />
```

Modify `client/src/pages/AuthPage.css` 追加：

```css
/* 从备份文件导入（P2）：次要链接样式 */
.auth-card__import {
  display: block;
  margin: var(--space-sm) auto 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-decoration: underline;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}

.auth-card__import:hover {
  color: var(--color-accent-primary-strong);
}
```

- [ ] **Step 2: ProfileDropdown 接入**

Modify `client/src/components/ui/ProfileDropdown.tsx`：

1. import 追加：`import { Upload } from 'lucide-react';`、`import { ImportBackupModal } from './ImportBackupModal';`
2. 组件内加 state：`const [importOpen, setImportOpen] = useState(false);`
3. 菜单项数组在 export 之后插入：

```tsx
    {
      key: 'import',
      label: '导入数据',
      icon: <Upload size={16} strokeWidth={1.75} aria-hidden="true" />,
      action: () => setImportOpen(true),
    },
```

4. 根 div 内（AnimatePresence 之后）追加：

```tsx
      <ImportBackupModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          // 导入改变了当前账号数据：刷新页面让所有页面拉到最新数据
          window.location.reload();
        }}
      />
```

- [ ] **Step 3: 全量验证**

```bash
cd client && npx tsc --noEmit
cd .. && npm run build
npx vitest run
npm run lint
```

Expected：全部通过；lint 无新增问题（既有 Modal.tsx error 除外）。

- [ ] **Step 4: 浏览器手测（Playwright 截图 + 断言）**

写临时脚本（放 `e2e/` 内运行，跑完删除，勿提交）：
1. 登录 export-test2@yantai.local → 打开 Profile 菜单 → 截图含「导入数据」项
2. 点击「导入数据」→ Modal 出现 → 选择 `/tmp/backup-a.json`（Task 4 手测产物；若无则先登录导出）→ 等待 preview → 截图差异摘要
3. 点「合并导入」→ 等待 toast「导入完成」→ 页面 reload 后仍登录
4. 明暗主题各截一张 Modal
5. 登出 → 登录页 → 截图含「从备份文件导入」链接

截图存 `.superpowers/sdd/screenshots/p2-*.png`；脚本断言 Modal/菜单/摘要文本存在。截图清单与断言结果写入报告。

- [ ] **Step 5: Commit（检查点）**

```bash
git add client/src/pages/LoginPage.tsx client/src/pages/AuthPage.css client/src/components/ui/ProfileDropdown.tsx
git commit -m "feat(import): 登录页与 Profile 下拉接入导入入口（自动登录/刷新）"
```

---

## Self-Review 记录

- **Spec 覆盖**：preview 端点→T4；import 端点（建号/覆盖/合并/409/400）→T4；字段白名单严格映射→T2；差异口径→T3；共享类型→T1；前端 backupApi→T5；ImportBackupModal→T6；登录页/ProfileDropdown 入口→T7；限流/20MB/schemaVersion→T4；测试（单测+curl+前端手测）→各任务与 T4/T7。
- **占位符**：无 TBD/TODO；Task 6 的 Button/ConfirmDialog 签名标注了"先读实际签名再适配"的实现指引（既有组件 API 未知部分，属于必须现场核对项，非占位）。
- **类型一致性**：`mapBackupData(data: BackupFile['data']): MappedData`（T2 定义、T3/T4 消费）；`computeDiffSummary(fileData: MappedData, existing: ExistingKeys): DiffSummary`（T3 定义、T4 消费）；`resolveImportTarget(opts): ImportTargetDecision`（T3 定义、T4 消费）；`buildUpsertSql(table, rows, updateColumns)` 与 `TABLE_DEFS`（T3 定义、T4 消费）；`backupApi.previewImport/importData`（T5 定义、T6 消费）；`ImportBackupModal({isOpen,onClose,onImported})`（T6 定义、T7 消费）。
