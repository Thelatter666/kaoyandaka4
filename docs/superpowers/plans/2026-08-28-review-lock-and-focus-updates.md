# 复盘锁 + 专注暂停等四项增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (决策门已判定 Q1-B 本对话内执行 + Q2-A 完整审核,不采用子代理派发)。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 复盘页二重密码(每次启动输一次)+ 继续专注恢复上次预设 + 专注暂停(每次≤5 分钟,服务端感知)+ 休息结束独立提示音(顺带修复响铃开关未生效)。

**Architecture:** 见 spec `docs/superpowers/specs/2026-08-28-review-lock-and-focus-updates-design.md` 与 ADR-0005/0006。要点:暂停 = `focus_sessions` 加 `paused_at`/`paused_total_seconds` 两列(status 不动),resume 顺延 `planned_end_at` 并累计,complete 扣除;解锁标记 = 会话 cookie;锁哈希 = `user_settings` 键 `review_lock_hash`(服务器 bcrypt / 本地 SHA-256+salt);`RingCountdown` 是受控组件,冻结暂停不改砚池组件。

**Tech Stack:** React 18 + TS + Vite / Express 4 + mysql2 / Zod / Vitest(node 环境 + fake-indexeddb)。

## Global Constraints

- 判断「暂停中」一律看 `paused_at IS NOT NULL`,**禁止**新增 status 判断(ADR-0006)
- 组件禁止硬编码颜色,必须用 `var(--color-xxx)`(`client/src/styles/tokens.css`)
- 新动效必须支持 `prefers-reduced-motion`(本计划 UI 改动均为状态切换,无新动画;如实施中新增动画须补门控)
- 测试环境为 **node** 非 jsdom;本地模式单测文件头部须 `import 'fake-indexeddb/auto'`
- commit 格式 `<type>(<scope>): <中文描述>`;每任务一 commit;**用户下令前不 merge / 不 push**
- 本地归属一律 `accountId`,绝不复用服务器 user_id
- 术语遵循 `CONTEXT.md`(复盘锁/解锁标记/暂停/暂停总量/休息提示音)
- 所有服务端输入过 Zod + `validate()`;错误 `AppError(status, code, message)`;`user_id` 取自 `req.userId`

## 分批(每批结束停下做效果确认,用户批准后进下一批)

- **批 A(Task 1-8)**:暂停 + 继续专注恢复预设
- **批 B(Task 9-12)**:复盘锁
- **批 C(Task 13)**:休息提示音 + 开关修复;Task 14 文档同步与全量验证

---

### Task 1: shared 常量 + 客户端 focus 类型与 API 扩展

**Files:**
- Modify: `shared/src/constants.ts`
- Modify: `client/src/api/focus.ts`

**Interfaces:**
- Produces: `FOCUS_PAUSE_MAX_SECONDS = 300`(后续所有任务引用);`ActiveSession.pausedAt: string | null`、`ActiveSession.pausedTotalSeconds: number`;`focusApi.pause(id)` / `focusApi.resume(id)`

- [ ] **Step 1: constants.ts 追加常量**

在 `shared/src/constants.ts` 的 `LONG_BREAK_AFTER_ROUNDS = 4;` 之后追加:

```ts
/** 专注暂停单次上限(秒),到点自动恢复;暂停语义见 CONTEXT.md / ADR-0006 */
export const FOCUS_PAUSE_MAX_SECONDS = 300;
```

- [ ] **Step 2: client/src/api/focus.ts 扩展 ActiveSession 与方法**

`ActiveSession` 接口在 `source` 字段后追加两个字段:

```ts
export interface ActiveSession {
  id: string;
  presetNameSnapshot: string;
  subjectSnapshot: 'math' | 'english' | '408' | 'free';
  subSubjectSnapshot: string | null;
  plannedDurationSeconds: number;
  startedAt: string;
  plannedEndAt: string;
  status: 'in_progress';
  source: 'pomodoro' | 'plan' | 'course';
  /** 非空 = 暂停中(ISO 时间戳);判断暂停一律看本字段,勿发明 status 判断(ADR-0006) */
  pausedAt: string | null;
  /** 会话累计暂停秒数(完成时服务端/本地已扣除,展示用) */
  pausedTotalSeconds: number;
}
```

`focusApi` 对象追加两个方法(放在 `cancel` 与 `getActive` 之间):

```ts
  pause: (id: string) =>
    isLocalMode() ? localStore.focus.pause(id) : api.post<void>(`/focus/${id}/pause`),

  resume: (id: string) =>
    isLocalMode() ? localStore.focus.resume(id) : api.post<void>(`/focus/${id}/resume`),
```

- [ ] **Step 3: 类型核对(此时 localStore 尚无 pause/resume,预期报错)**

Run: `cd client && npx tsc --noEmit`
Expected: FAIL——`localStore.focus.pause/resume` 不存在(Task 5 补齐)。这是预期中间态,**不要**回退本任务。

- [ ] **Step 4: Commit**

```bash
git add shared/src/constants.ts client/src/api/focus.ts
git commit -m "feat(pause): 暂停上限常量 + 客户端 focus 类型与 pause/resume API"
```

---

### Task 2: focus_sessions 暂停两列迁移(关键任务·全量审核)

**Files:**
- Modify: `server/src/db/schema.sql`(focus_sessions 表定义,~121-144 行)
- Modify: `server/src/db/migrate.ts`(migrateUsers 内追加第 4 节)

**Interfaces:**
- Produces: 列 `paused_at DATETIME NULL`、`paused_total_seconds INT NOT NULL DEFAULT 0`(Task 3 服务端、Task 5 本地模式依赖)

- [ ] **Step 1: schema.sql 同步新库最终形态**

在 `CREATE TABLE IF NOT EXISTS focus_sessions` 的 `status ENUM(...) NOT NULL DEFAULT 'in_progress',` 行之后、`source` 行之前插入:

```sql
    paused_at               DATETIME NULL,
    paused_total_seconds    INT NOT NULL DEFAULT 0,
```

并在该表上方注释区(如有)确认无冲突。注意列顺序仅影响新库可读性,迁移按列名幂等。

- [ ] **Step 2: migrate.ts 幂等加列**

在 `migrateUsers` 函数中,业务表循环(`for (const spec of BUSINESS_TABLES) { ... }`)结束之后、函数收尾前追加第 4 节:

```ts
  // 4. focus_sessions 暂停两列(专注暂停功能,ADR-0006:加列而非新增 status 值)
  if (!(await columnExists(conn, dbName, 'focus_sessions', 'paused_at'))) {
    await conn.query(
      'ALTER TABLE `focus_sessions` ADD COLUMN `paused_at` DATETIME NULL AFTER `status`'
    );
    console.log('  [focus_sessions] added column paused_at');
  } else {
    console.log('  [focus_sessions] column paused_at already exists, skip');
  }
  if (!(await columnExists(conn, dbName, 'focus_sessions', 'paused_total_seconds'))) {
    await conn.query(
      'ALTER TABLE `focus_sessions` ADD COLUMN `paused_total_seconds` INT NOT NULL DEFAULT 0 AFTER `paused_at`'
    );
    console.log('  [focus_sessions] added column paused_total_seconds');
  } else {
    console.log('  [focus_sessions] column paused_total_seconds already exists, skip');
  }
```

- [ ] **Step 3: 验证迁移**

Run: `npm run db:migrate`
Expected: 日志出现 `added column paused_at` / `added column paused_total_seconds`(或 already exists, skip),退出码 0;重复执行第二次全部 skip。

- [ ] **Step 4: Commit**

```bash
git add server/src/db/schema.sql server/src/db/migrate.ts
git commit -m "feat(pause): focus_sessions 加 paused_at/paused_total_seconds 两列(幂等迁移)"
```

---

### Task 3: 服务端 focus 路由 pause/resume + complete/active 改造(关键任务·全量审核)

**Files:**
- Modify: `server/src/routes/focus.ts`

**Interfaces:**
- Consumes: `FOCUS_PAUSE_MAX_SECONDS`(Task 1)
- Produces: `POST /api/v1/focus/:id/pause`、`POST /api/v1/focus/:id/resume`(均 204/409);`transformSession` 响应新增 `pausedAt`(ISO 字符串或 null)与 `pausedTotalSeconds`

- [ ] **Step 1: import 与 FocusRow/transformSession 扩展**

文件顶部追加常量导入:

```ts
import { FOCUS_PAUSE_MAX_SECONDS } from '../../../shared/src/constants.js';
```

`FocusRow` 接口追加(`status` 字段声明之后):

```ts
  paused_at: string | null;
  paused_total_seconds: number;
```

`transformSession` 返回对象追加两个字段(`source: row.source,` 之后):

```ts
    pausedAt: row.paused_at,
    pausedTotalSeconds: row.paused_total_seconds ?? 0,
```

- [ ] **Step 2: pause 端点(放在 cancel 端点之后)**

```ts
// POST /api/v1/focus/:id/pause — 暂停:写 paused_at,学习时钟停走(ADR-0006)
router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE focus_sessions SET paused_at = NOW() WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NULL",
      [id, req.userId]
    );
    if (result.affectedRows === 0) {
      throw new AppError(409, 'CONFLICT', '当前不可暂停(会话不存在、已结束或已在暂停中)');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/focus/:id/resume — 恢复:顺延 planned_end_at 并累计暂停总量
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<FocusRow[]>(
      "SELECT * FROM focus_sessions WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NOT NULL",
      [id, req.userId]
    );
    if (rows.length === 0) {
      throw new AppError(409, 'CONFLICT', '当前没有暂停中的专注会话');
    }
    const pausedSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(rows[0].paused_at as string).getTime()) / 1000)
    );
    await pool.query<ResultSetHeader>(
      `UPDATE focus_sessions
       SET planned_end_at = DATE_ADD(planned_end_at, INTERVAL ? SECOND),
           paused_total_seconds = paused_total_seconds + ?,
           paused_at = NULL
       WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NOT NULL`,
      [pausedSeconds, pausedSeconds, id, req.userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: complete 端点改造**

在 `POST /:id/complete` 中,状态检查 `if (session.status !== 'in_progress')` 之后追加暂停检查:

```ts
    if (session.paused_at) {
      throw new AppError(409, 'CONFLICT', '暂停中,请先继续专注再完成');
    }
```

实际时长计算改为扣除暂停总量(W4:暂停中禁止完成,双保险靠乐观锁):

```ts
    const actualDurationSeconds = Math.max(
      0,
      Math.round((now.getTime() - startedAt.getTime()) / 1000) - (session.paused_total_seconds ?? 0)
    );
```

乐观锁 UPDATE 的 WHERE 追加暂停条件(事务内那条):

```ts
         WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NULL`,
```

- [ ] **Step 4: getActive 惰性恢复链**

`GET /active` 中,取到 `const session = rows[0];` 与 `const plannedEndAt = ...` 之间插入惰性恢复,并把后续对 `session` 的引用改为 `effective`(过期自动完成分支里的 `session.xxx` 一并改):

```ts
    const session = rows[0];
    let effective = session;

    if (session.paused_at) {
      const pausedElapsed = Math.round((now.getTime() - new Date(session.paused_at).getTime()) / 1000);
      if (pausedElapsed < FOCUS_PAUSE_MAX_SECONDS) {
        // 暂停中且未超时:原样返回,不做过期自动完成(学习时钟停走,ADR-0006)
        return res.json(transformSession(session));
      }
      // 暂停超时:惰性恢复(顺延 + 累计),与「过期自动完成惰性触发」同构;无服务端定时器
      const pausedSeconds = Math.round((now.getTime() - new Date(session.paused_at).getTime()) / 1000);
      await pool.query<ResultSetHeader>(
        `UPDATE focus_sessions
         SET planned_end_at = DATE_ADD(planned_end_at, INTERVAL ? SECOND),
             paused_total_seconds = paused_total_seconds + ?,
             paused_at = NULL
         WHERE id = ? AND user_id = ? AND status = 'in_progress' AND paused_at IS NOT NULL`,
        [pausedSeconds, pausedSeconds, session.id, req.userId]
      );
      const [refreshed] = await pool.query<FocusRow[]>(
        'SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?',
        [session.id, req.userId]
      );
      effective = refreshed[0];
    }

    const plannedEndAt = new Date(effective.planned_end_at);
```

其后的过期判断与自动完成分支中 `session.planned_duration_seconds`、`session.id`、`session.preset_name_snapshot`、`session.subject_snapshot`、`session.sub_subject_snapshot`、`session.task_id`、`session.course_episode_id` 全部改用 `effective`。

- [ ] **Step 5: 类型检查与 lint**

Run: `cd server && npx tsc --noEmit && npx eslint src/routes/focus.ts`
Expected: PASS(0 error)

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/focus.ts
git commit -m "feat(pause): 服务端 pause/resume 端点 + complete 扣除暂停 + active 惰性恢复链"
```

---

### Task 4: 暂停时间纯函数(TDD)

**Files:**
- Create: `client/src/utils/focusPause.ts`
- Test: `client/src/utils/focusPause.test.ts`

**Interfaces:**
- Consumes: `FOCUS_PAUSE_MAX_SECONDS`
- Produces: `pauseRemainingSeconds(pausedAtMs: number, nowMs: number): number`;`sessionRemainingSeconds(plannedEndAtMs: number, pausedAtMs: number | null, nowMs: number): number`(Task 6/7 引用)

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { pauseRemainingSeconds, sessionRemainingSeconds } from './focusPause';

describe('pauseRemainingSeconds', () => {
  it('自 pausedAt 起算,上限 300 秒', () => {
    expect(pauseRemainingSeconds(1_000_000, 1_000_000 + 120_000)).toBe(180);
  });

  it('超过 5 分钟归零,不为负', () => {
    expect(pauseRemainingSeconds(1_000_000, 1_000_000 + 400_000)).toBe(0);
  });
});

describe('sessionRemainingSeconds', () => {
  it('未暂停按当前时刻计算', () => {
    const end = 1_000_000 + 600_000;
    expect(sessionRemainingSeconds(end, null, 1_000_000)).toBe(600);
  });

  it('暂停中冻结在暂停时刻(学习时钟停走,ADR-0006)', () => {
    const pauseAt = 1_000_000;
    const end = pauseAt + 600_000;
    // 挂钟已前进 120 秒,剩余仍按暂停时刻冻结
    expect(sessionRemainingSeconds(end, pauseAt, pauseAt + 120_000)).toBe(600);
  });

  it('暂停中剩余不为负', () => {
    expect(sessionRemainingSeconds(1_000_000, 500_000, 2_000_000)).toBe(500);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run client/src/utils/focusPause.test.ts`
Expected: FAIL(module not found)

- [ ] **Step 3: 实现**

```ts
import { FOCUS_PAUSE_MAX_SECONDS } from '@shared/constants';

/** 暂停剩余秒数:自 pausedAt 起算,上限 FOCUS_PAUSE_MAX_SECONDS(5 分钟,到点自动恢复) */
export function pauseRemainingSeconds(pausedAtMs: number, nowMs: number): number {
  return Math.max(0, FOCUS_PAUSE_MAX_SECONDS - Math.floor((nowMs - pausedAtMs) / 1000));
}

/** 会话剩余秒数:暂停中冻结在暂停时刻(学习时钟停走,ADR-0006);未暂停按当前时刻 */
export function sessionRemainingSeconds(
  plannedEndAtMs: number,
  pausedAtMs: number | null,
  nowMs: number
): number {
  const referenceMs = pausedAtMs ?? nowMs;
  return Math.max(0, Math.round((plannedEndAtMs - referenceMs) / 1000));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run client/src/utils/focusPause.test.ts`
Expected: PASS(5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/focusPause.ts client/src/utils/focusPause.test.ts
git commit -m "feat(pause): 暂停剩余/会话冻结剩余纯函数(含单测)"
```

---

### Task 5: 本地模式 localStore 暂停(TDD)

**Files:**
- Modify: `client/src/local/types.ts`(LocalFocusSession)
- Modify: `client/src/local/localStore.ts`(transformSession/start/pause/resume/complete/getActive)
- Test: `client/src/local/localStore.test.ts`(追加 describe)

**Interfaces:**
- Consumes: `focusPause` 无需(Task 内联计算);`formatDateTime`/`parseDateTime`(既有)
- Produces: `localStore.focus.pause(id)` / `localStore.focus.resume(id)`(Task 1 的 API 分支依赖);本地 `ActiveSession` 含 `pausedAt`/`pausedTotalSeconds`

- [ ] **Step 1: types.ts 扩展**

`LocalFocusSession` 的 `status` 字段后追加:

```ts
  pausedAt: string | null;
  pausedTotalSeconds: number;
```

- [ ] **Step 2: 写失败测试(localStore.test.ts 追加)**

```ts
describe('focus 暂停(ADR-0006)', () => {
  beforeEach(async () => {
    await resetDb();
    setLocalContext(false);
    setActiveLocalAccount(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pause/resume:顺延结束时间并累计暂停总量', async () => {
    await activate();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));
    const s = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'pomodoro' });

    vi.setSystemTime(new Date(2026, 7, 28, 10, 5, 0));
    await localStore.focus.pause(s.id);

    vi.setSystemTime(new Date(2026, 7, 28, 10, 8, 0));
    await localStore.focus.resume(s.id);

    const active = await localStore.focus.getActive();
    expect(active).not.toBeNull();
    expect(active!.pausedAt).toBeNull();
    expect(active!.pausedTotalSeconds).toBe(180);
    // 25 分钟会话自 10:00 起、暂停 3 分钟顺延 → 结束 10:28
    expect(active!.plannedEndAt).toBe('2026-08-28 10:28:00');
  });

  it('getActive:暂停未超时返回暂停态;超时惰性恢复(顺延 300 秒)', async () => {
    await activate();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));
    const s = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'pomodoro' });

    vi.setSystemTime(new Date(2026, 7, 28, 10, 2, 0));
    await localStore.focus.pause(s.id);
    vi.setSystemTime(new Date(2026, 7, 28, 10, 3, 0));
    const paused = await localStore.focus.getActive();
    expect(paused).not.toBeNull();
    expect(paused!.pausedAt).not.toBeNull();

    vi.setSystemTime(new Date(2026, 7, 28, 10, 10, 0));
    const resumed = await localStore.focus.getActive();
    expect(resumed).not.toBeNull();
    expect(resumed!.pausedAt).toBeNull();
    expect(resumed!.pausedTotalSeconds).toBe(300);
    // 10:25 结束点 + 300 秒顺延 → 10:30
    expect(resumed!.plannedEndAt).toBe('2026-08-28 10:30:00');
    void s;
  });

  it('complete:实际时长扣除暂停总量;暂停中完成被拒', async () => {
    await activate();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));
    const s = await localStore.focus.start({ plannedDurationMinutes: 25, source: 'pomodoro' });

    vi.setSystemTime(new Date(2026, 7, 28, 10, 5, 0));
    await localStore.focus.pause(s.id);
    vi.setSystemTime(new Date(2026, 7, 28, 10, 6, 0));
    await expect(localStore.focus.complete(s.id)).rejects.toThrow('暂停中');

    vi.setSystemTime(new Date(2026, 7, 28, 10, 8, 0));
    await localStore.focus.resume(s.id);
    vi.setSystemTime(new Date(2026, 7, 28, 10, 20, 0));
    await localStore.focus.complete(s.id);

    const records = await localStore.statistics.getTodaySummary();
    // 挂钟 20 分钟 - 3 分钟暂停 = 17 分钟 = 1020 秒
    expect(records.totalSeconds).toBe(1020);
  });
});
```

注意:`getTodaySummary` 返回字段名以 `client/src/api/statistics.ts` 的 `TodaySummary` 为准(实现时核对,若为 `totalFocusSeconds` 等请用实际字段断言同一数值)。

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run client/src/local/localStore.test.ts`
Expected: FAIL(pause/resume 不存在)

- [ ] **Step 4: 实现 localStore.focus 改造**

`transformSession` 追加:

```ts
    pausedAt: row.pausedAt,
    pausedTotalSeconds: row.pausedTotalSeconds ?? 0,
```

`start()` 的 session 字面量在 `status: 'in_progress',` 前追加:

```ts
      pausedAt: null,
      pausedTotalSeconds: 0,
```

`focus` 对象在 `cancel` 之后追加两个方法,并改造 `complete`/`getActive`:

```ts
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
      const pausedSeconds = Math.max(
        0,
        Math.round((Date.now() - parseDateTime(session.pausedAt).getTime()) / 1000)
      );
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
```

`complete()` 在 `if (session.status !== 'in_progress')` 检查后追加,并改实际时长计算:

```ts
      if (session.pausedAt) throw new Error('暂停中,请先继续专注');
```

```ts
      const actualDurationSeconds = Math.max(
        0,
        Math.round((completedAtDate.getTime() - parseDateTime(session.startedAt).getTime()) / 1000) -
          (session.pausedTotalSeconds ?? 0)
      );
```

`getActive()` 在 `const nowDate = new Date();` 与过期判断之间插入惰性恢复链,并把过期分支对 `active` 的引用改为恢复后的行:

```ts
      if (active.pausedAt) {
        const pausedElapsed = Math.round((nowDate.getTime() - parseDateTime(active.pausedAt).getTime()) / 1000);
        if (pausedElapsed < FOCUS_PAUSE_MAX_SECONDS) {
          return transformSession(active);
        }
        // 暂停超时:惰性恢复(顺延 5 分钟上限),随后继续既有过期判断
        await idbPut(t, 'focusSessions', {
          ...active,
          plannedEndAt: formatDateTime(
            new Date(parseDateTime(active.plannedEndAt).getTime() + FOCUS_PAUSE_MAX_SECONDS * 1000)
          ),
          pausedTotalSeconds: (active.pausedTotalSeconds ?? 0) + FOCUS_PAUSE_MAX_SECONDS,
          pausedAt: null,
          updatedAt: now(),
        });
        active = {
          ...active,
          plannedEndAt: formatDateTime(
            new Date(parseDateTime(active.plannedEndAt).getTime() + FOCUS_PAUSE_MAX_SECONDS * 1000)
          ),
          pausedTotalSeconds: (active.pausedTotalSeconds ?? 0) + FOCUS_PAUSE_MAX_SECONDS,
          pausedAt: null,
        };
      }
```

对应地把 `const active = rows...[0];` 声明改为 `let active = ...`。文件顶部追加导入:

```ts
import { FOCUS_PAUSE_MAX_SECONDS } from '@shared/constants';
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run client/src/local/localStore.test.ts`
Expected: PASS(新增 3 条 + 既有全绿)

- [ ] **Step 6: Commit**

```bash
git add client/src/local/types.ts client/src/local/localStore.ts client/src/local/localStore.test.ts
git commit -m "feat(pause): 本地模式 pause/resume + getActive 惰性链 + complete 扣除暂停(含单测)"
```

---

### Task 6: useFocusSession + PomodoroPage 暂停 UI

**Files:**
- Modify: `client/src/hooks/useFocusSession.ts`
- Modify: `client/src/pages/PomodoroPage.tsx`
- Modify: `client/src/pages/PomodoroPage.css`

**Interfaces:**
- Consumes: `focusApi.pause/resume`(Task 1)、`localStore.focus.pause/resume`(Task 5)、`pauseRemainingSeconds`/`sessionRemainingSeconds`(Task 4)
- Produces: `useFocusSession().pauseFocus()` / `resumeFocus()`;页面暂停态 UI

- [ ] **Step 1: useFocusSession 扩展**

`ActiveSession` 接口追加两字段(与 `client/src/api/focus.ts` 对齐):

```ts
  pausedAt: string | null;
  pausedTotalSeconds: number;
```

hook 内 `cancelFocus` 之后追加(返回对象一并加 `pauseFocus, resumeFocus`):

```ts
  const pauseFocus = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await focusApi.pause(activeSession.id);
      await checkActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂停失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeSession, checkActive]);

  const resumeFocus = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await focusApi.resume(activeSession.id);
      await checkActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeSession, checkActive]);
```

- [ ] **Step 2: PomodoroPage 状态与派生**

页面解构追加 `pauseFocus, resumeFocus`。在 `const [actionLoading, setActionLoading] = useState(false);` 后追加:

```ts
  /** 暂停剩余秒数(1s 递减;0 = 已到点自动恢复) */
  const [pauseLeftSec, setPauseLeftSec] = useState(0);
```

在 `const totalPlannedSeconds = ...` 附近追加派生:

```ts
  const paused = !!activeSession?.pausedAt;
```

- [ ] **Step 3: 暂停倒计时 + 到点自动恢复 effect**

放在「会话自然结束检测」effect 之前:

```ts
  // 暂停倒计时:自 pausedAt 起算(上限 5 分钟),到点自动恢复。后台标签页 interval
  // 被节流时,回前台由 getActive 惰性恢复链兜底(spec §2,ADR-0006)
  useEffect(() => {
    if (!paused || !activeSession?.pausedAt) {
      setPauseLeftSec(0);
      return;
    }
    const pausedAtMs = new Date(activeSession.pausedAt).getTime();
    const update = () => {
      const left = pauseRemainingSeconds(pausedAtMs, Date.now());
      setPauseLeftSec(left);
      return left;
    };
    if (update() <= 0) return;
    const timer = setInterval(() => {
      if (update() <= 0) {
        clearInterval(timer);
        void resumeFocus();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, activeSession?.pausedAt, resumeFocus]);
```

顶部导入:

```ts
import { pauseRemainingSeconds, sessionRemainingSeconds } from '../utils/focusPause';
import { formatSeconds } from '../utils/duration';
```

- [ ] **Step 4: 响铃 worker 暂停中解除武装**

武装 effect 中,`if (activeSession) {` 改为 `if (activeSession && !paused) {`,并把 `paused` 加入依赖数组(`[activeSession, breakMode, breakEndsAt]` → `[activeSession, breakMode, breakEndsAt, paused]`)。暂停期间 plannedEndAt 会被顺延,旧武装到点会误响,必须解除;恢复后 effect 重跑按新结束时间重新武装。

- [ ] **Step 5: ringProps 暂停分支**

`ringProps` IIFE 的第一个分支 `if (step === 'active' && activeSession) {` 内,进入时先判暂停:

```ts
    if (step === 'active' && activeSession) {
      if (paused) {
        // 暂停:砚池冻结在暂停时刻的墨面高度,不启 rAF(endsAtMs=null 走 fallback)
        return {
          mode: 'focus' as RingMode,
          totalSeconds: totalPlannedSeconds,
          endsAtMs: null,
          fallbackRemainingSeconds: sessionRemainingSeconds(
            new Date(activeSession.plannedEndAt).getTime(),
            activeSession.pausedAt ? new Date(activeSession.pausedAt).getTime() : null,
            Date.now()
          ),
          subject: activeSession.subjectSnapshot as InkSubject,
          subtitle: focusSubtitle(activeSession),
          modeLabel: '暂停中',
        };
      }
      return {
```

(原分支其余代码不变。)

- [ ] **Step 6: 操作区 UI**

原「进行中操作区」块的条件改为 `step === 'active' && activeSession && !paused`,并在「提前完成」与「取消」之间插入暂停按钮:

```tsx
              <Button variant="glass" onClick={handlePause} disabled={actionLoading}>
                暂停
              </Button>
```

其后新增暂停态操作块:

```tsx
          {step === 'active' && activeSession && paused && (
            /* 暂停态:倒计时 + 继续专注(主)/取消;「提前完成」隐藏(W4) */
            <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
              <p className="pomodoro-pause-timer" role="timer" aria-label={`暂停剩余 ${Math.ceil(pauseLeftSec / 60)} 分钟`}>
                {formatSeconds(pauseLeftSec)}
              </p>
              <Button variant="primary" size="lg" onClick={() => void resumeFocus()} loading={actionLoading}>
                <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                继续专注
              </Button>
              <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                取消专注
              </Button>
            </div>
          )}
```

页面组件内(`handleCancel` 之后)追加:

```ts
  const handlePause = async () => {
    setActionLoading(true);
    try {
      await pauseFocus();
    } catch {
      // Error handled by hook
    } finally {
      setActionLoading(false);
    }
  };
```

- [ ] **Step 7: CSS(PomodoroPage.css 追加)**

```css
/* 暂停倒计时(暂停态操作区内,居中大字) */
.pomodoro-pause-timer {
  width: 100%;
  margin: 0 0 var(--space-sm);
  text-align: center;
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}
```

- [ ] **Step 8: 类型与 lint**

Run: `cd client && npx tsc --noEmit && npx eslint src/pages/PomodoroPage.tsx src/hooks/useFocusSession.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add client/src/hooks/useFocusSession.ts client/src/pages/PomodoroPage.tsx client/src/pages/PomodoroPage.css
git commit -m "feat(pause): 番茄钟页暂停态(冻结砚池/倒计时自动恢复/继续专注入口)"
```

---

### Task 7: 首页 mini 砚池暂停感知

**Files:**
- Modify: `client/src/pages/HomePage.tsx`(MiniSessionRing ~344-374 与调用处 ~131-150)
- Modify: `client/src/pages/HomePage.css`

**Interfaces:**
- Consumes: `ActiveSession.pausedAt`(Task 1)

- [ ] **Step 1: MiniSessionRing 加 pausedAt**

```tsx
const MiniSessionRing = React.memo(function MiniSessionRing({
  plannedEndAt,
  totalSeconds,
  subject,
  pausedAt,
}: {
  plannedEndAt: string;
  totalSeconds: number;
  subject: InkSubject;
  pausedAt: string | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (pausedAt) return; // 暂停中学习时钟停走,剩余冻结,无需每秒刷新
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pausedAt]);

  const remainingSeconds = pausedAt
    ? Math.max(0, Math.round((new Date(plannedEndAt).getTime() - new Date(pausedAt).getTime()) / 1000))
    : Math.max(0, Math.round((new Date(plannedEndAt).getTime() - nowMs) / 1000));

  return (
    <RingCountdown
      variant="mini"
      totalSeconds={totalSeconds}
      remainingSeconds={remainingSeconds}
      mode="focus"
      subject={subject}
    />
  );
});
```

调用处追加 prop 与「暂停中」标注(mini 变体不渲染模式文字,标注放 meta 区):

```tsx
              <MiniSessionRing
                plannedEndAt={activeSession.plannedEndAt}
                totalSeconds={activeSession.plannedDurationSeconds}
                subject={activeSession.subjectSnapshot as InkSubject}
                pausedAt={activeSession.pausedAt}
/>
```

```tsx
                {activeSession.pausedAt && <p className="home-focus__paused">暂停中</p>}
```

- [ ] **Step 2: CSS(HomePage.css 追加)**

```css
/* 进行中会话暂停态标注(mini 砚池旁 meta 区) */
.home-focus__paused {
  margin: 0;
  font-size: var(--text-sm, 0.875rem);
  color: var(--color-text-secondary);
}
```

- [ ] **Step 3: 类型与 lint**

Run: `cd client && npx tsc --noEmit && npx eslint src/pages/HomePage.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/HomePage.tsx client/src/pages/HomePage.css
git commit -m "feat(pause): 首页 mini 砚池暂停冻结 + 暂停中标注"
```

---

### Task 8: 继续专注恢复上次预设

**Files:**
- Modify: `client/src/pages/PomodoroPage.tsx`

**Interfaces:**
- Consumes: 既有 `presets`/`selectedPreset`/`activeSession` 状态

- [ ] **Step 1: handleContinue 保留选中**

`handleContinue` 删除 `setSelectedPreset(null);` 一行,仅保留 `setStep('idle');`。「取消/不休息/短/长休息」入口的清空行为**不变**。

- [ ] **Step 2: 刷新恢复路径按快照名匹配**

在「记录最近一次专注会话的钟参数」effect 之后追加:

```ts
  // 会话恢复(刷新后)按快照名匹配预设,恢复选中态;匹配不到(预设已删/漫游)退回漫游。
  // 仅在 activeSession 首次出现时执行一次(presetRestoreRef),不干扰用户手动取消选中
  const presetRestoreRef = useRef(false);
  useEffect(() => {
    if (!activeSession || presets.length === 0 || presetRestoreRef.current) return;
    presetRestoreRef.current = true;
    if (activeSession.subjectSnapshot === 'free') return;
    const match = presets.find((p) => p.name === activeSession.presetNameSnapshot);
    if (match) {
      setSelectedPreset(match);
      setDurationMinutes(match.durationMinutes);
    }
  }, [activeSession, presets]);
```

- [ ] **Step 3: lint**

Run: `npx eslint src/pages/PomodoroPage.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PomodoroPage.tsx
git commit -m "feat(pomodoro): 继续专注恢复上次预设(含刷新后按快照名匹配)"
```

---

### Task 9: 复盘锁 Zod schema(TDD)+ 服务端路由 + 挂载(关键任务·全量审核)

**Files:**
- Modify: `shared/src/schemas/review.ts`
- Test: `shared/src/schemas/review.test.ts`
- Create: `server/src/routes/reviewLock.ts`
- Modify: `server/src/index.ts`(挂载)

**Interfaces:**
- Produces: `SetReviewLockSchema`/`VerifyReviewLockSchema` 与输入类型;`GET/POST /api/v1/review-lock`、`POST /api/v1/review-lock/verify`

- [ ] **Step 1: 写失败测试(shared/src/schemas/review.test.ts)**

```ts
import { describe, expect, it } from 'vitest';
import { SetReviewLockSchema, VerifyReviewLockSchema } from './review.js';

describe('SetReviewLockSchema', () => {
  it('接受 4-64 位新密码,currentPassword 可选', () => {
    expect(SetReviewLockSchema.safeParse({ newPassword: '1234' }).success).toBe(true);
    expect(SetReviewLockSchema.safeParse({ currentPassword: 'abcd', newPassword: '1234' }).success).toBe(true);
  });
  it('拒绝过短/超长密码', () => {
    expect(SetReviewLockSchema.safeParse({ newPassword: '123' }).success).toBe(false);
    expect(SetReviewLockSchema.safeParse({ newPassword: 'a'.repeat(65) }).success).toBe(false);
  });
});

describe('VerifyReviewLockSchema', () => {
  it('接受 4-64 位密码,拒绝空串', () => {
    expect(VerifyReviewLockSchema.safeParse({ password: '1234' }).success).toBe(true);
    expect(VerifyReviewLockSchema.safeParse({ password: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run shared/src/schemas/review.test.ts`
Expected: FAIL(导出不存在)

- [ ] **Step 3: schema 实现(shared/src/schemas/review.ts 追加)**

```ts
const LockPassword = z.string().min(4, '密码至少 4 位').max(64, '密码最长 64 位');

export const SetReviewLockSchema = z.object({
  currentPassword: LockPassword.optional(),
  newPassword: LockPassword,
});

export const VerifyReviewLockSchema = z.object({
  password: LockPassword,
});

export type SetReviewLockInput = z.infer<typeof SetReviewLockSchema>;
export type VerifyReviewLockInput = z.infer<typeof VerifyReviewLockSchema>;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run shared/src/schemas/review.test.ts`
Expected: PASS

- [ ] **Step 5: 服务端路由(server/src/routes/reviewLock.ts,新建)**

```ts
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
// user_settings 中的复盘锁哈希键(ADR-0005)
const LOCK_KEY = 'review_lock_hash';

// 验证限流:15 分钟内同一 IP 最多 20 次,防爆破(与 loginLimiter 同型)
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '尝试次数过多,请 15 分钟后再试', details: [] } },
});

interface LockRow extends RowDataPacket {
  setting_value: string;
}

async function getLockHash(userId: string): Promise<string | null> {
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

// POST /api/v1/review-lock — 设置/修改(已有锁时必须验证当前密码)
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

// POST /api/v1/review-lock/verify — 验证(进入复盘页)
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
```

- [ ] **Step 6: index.ts 挂载(挂载层 requireAuth,勿仿 import 例外)**

顶部与其他 router import 并列追加:

```ts
import reviewLockRouter from './routes/reviewLock.js';
```

在 `app.use('/api/v1/settings', requireAuth, settingsRouter);` 之后追加:

```ts
app.use('/api/v1/review-lock', requireAuth, reviewLockRouter);
```

- [ ] **Step 7: 类型与 lint + 手动冒烟**

Run: `cd server && npx tsc --noEmit && npx eslint src/routes/reviewLock.ts src/index.ts`
Expected: PASS
手动冒烟(需 dev server):未设锁 `GET` → `{hasLock:false}`;`POST` 设锁 → 204;`verify` 错误密码 → 401、正确 → 204。

- [ ] **Step 8: Commit**

```bash
git add shared/src/schemas/review.ts shared/src/schemas/review.test.ts server/src/routes/reviewLock.ts server/src/index.ts
git commit -m "feat(review-lock): 复盘锁 Zod schema + 服务端 review-lock 路由(挂载层鉴权+验证限流)"
```

---

### Task 10: 本地模式 hash 工具(TDD)+ localStore.reviewLock + API 封装

**Files:**
- Create: `client/src/utils/reviewLockHash.ts` / Test: `client/src/utils/reviewLockHash.test.ts`
- Modify: `client/src/local/localStore.ts`(新增 reviewLock 模块并导出)
- Modify: `client/src/api/reviews.ts`(reviewLockApi)

**Interfaces:**
- Produces: `hashReviewPassword(password, saltHex?)` → `` `${salt}:${hex}` ``;`verifyReviewPassword(password, stored)`;`localStore.reviewLock.{getStatus,set,verify}`;`reviewLockApi.{getStatus,set,verify}`(Task 11/12 引用)

- [ ] **Step 1: 写失败测试(client/src/utils/reviewLockHash.test.ts)**

```ts
import { describe, expect, it } from 'vitest';
import { hashReviewPassword, verifyReviewPassword } from './reviewLockHash';

describe('reviewLockHash(本地模式 SHA-256+salt,ADR-0005 W3)', () => {
  it('同密码同 salt 得同哈希,格式 salt:hex', async () => {
    const h1 = await hashReviewPassword('1234', 'aabbccdd');
    const h2 = await hashReviewPassword('1234', 'aabbccdd');
    expect(h1).toBe(h2);
    expect(h1.startsWith('aabbccdd:')).toBe(true);
    expect(h1.split(':')[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('不同密码哈希不同;缺省 salt 自动生成', async () => {
    const h1 = await hashReviewPassword('1234');
    const h2 = await hashReviewPassword('5678');
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(await hashReviewPassword('1234'));
  });

  it('verifyReviewPassword:正确通过、错误拒绝、格式非法拒绝', async () => {
    const stored = await hashReviewPassword('1234');
    expect(await verifyReviewPassword('1234', stored)).toBe(true);
    expect(await verifyReviewPassword('9999', stored)).toBe(false);
    expect(await verifyReviewPassword('1234', 'not-a-valid-format')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run client/src/utils/reviewLockHash.test.ts`
Expected: FAIL(module not found)

- [ ] **Step 3: 实现**

```ts
/**
 * 本地模式复盘锁哈希:SHA-256 + 16 字节随机 salt,存储格式 `salt:hex`。
 * 不引 bcrypt 进 client bundle(ADR-0005 W3):本地数据本就在同一浏览器内,
 * 威胁模型等价。Node 20+/现代浏览器均有 globalThis.crypto.subtle,vitest node 环境可测。
 */
const SALT_BYTES = 16;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashReviewPassword(password: string, saltHex?: string): Promise<string> {
  const salt =
    saltHex ?? toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)).buffer);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return `${salt}:${toHex(digest)}`;
}

export async function verifyReviewPassword(password: string, stored: string): Promise<boolean> {
  const salt = stored.split(':')[0];
  if (!salt || salt.length !== SALT_BYTES * 2) return false;
  return (await hashReviewPassword(password, salt)) === stored;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run client/src/utils/reviewLockHash.test.ts`
Expected: PASS

- [ ] **Step 5: localStore.reviewLock**

localStore.ts 顶部追加导入:

```ts
import { hashReviewPassword, verifyReviewPassword } from '../utils/reviewLockHash';
import type { SetReviewLockInput, VerifyReviewLockInput } from '@shared/types';
```

`settings` 模块之后新增:

```ts
/* ---- reviewLock(复盘锁,ADR-0005:哈希入 settings 键值) ---- */

const REVIEW_LOCK_KEY = 'review_lock_hash';

async function getSettingValue(key: string): Promise<string | null> {
  const accountId = requireAccountId();
  const rows = await rowsByAccount<LocalSetting>('settings', accountId);
  return rows.find((r) => r.key === key)?.value ?? null;
}

const reviewLock = {
  async getStatus(): Promise<{ hasLock: boolean }> {
    return { hasLock: (await getSettingValue(REVIEW_LOCK_KEY)) !== null };
  },

  async set(data: SetReviewLockInput): Promise<void> {
    const accountId = requireAccountId();
    const stored = await getSettingValue(REVIEW_LOCK_KEY);
    if (stored && !(await verifyReviewPassword(data.currentPassword ?? '', stored))) {
      throw new Error('当前复盘锁密码不正确');
    }
    const value = await hashReviewPassword(data.newPassword);
    const rows = await rowsByAccount<LocalSetting>('settings', accountId);
    const existing = rows.find((r) => r.key === REVIEW_LOCK_KEY);
    await tx('settings', 'readwrite', (t) =>
      idbPut(t, 'settings', existing ? { ...existing, value } : { accountId, key: REVIEW_LOCK_KEY, value })
    );
  },

  async verify(data: VerifyReviewLockInput): Promise<void> {
    const stored = await getSettingValue(REVIEW_LOCK_KEY);
    if (!stored) throw new Error('尚未设置复盘锁');
    if (!(await verifyReviewPassword(data.password, stored))) {
      throw new Error('复盘锁密码不正确');
    }
  },
};
```

文件末尾导出对象(`export const localStore = { ... }`)追加 `reviewLock,` 一行(`settings,` 之后)。

- [ ] **Step 6: api/reviews.ts 封装(文件末尾追加)**

```ts
import type { SetReviewLockInput, VerifyReviewLockInput } from '@shared/types';

/* 复盘锁(ADR-0005):哈希存服务器 user_settings / 本地 IndexedDB settings */
export const reviewLockApi = {
  getStatus: () =>
    isLocalMode() ? localStore.reviewLock.getStatus() : api.get<{ hasLock: boolean }>('/review-lock'),

  set: (data: SetReviewLockInput) =>
    isLocalMode() ? localStore.reviewLock.set(data) : api.post<void>('/review-lock', data),

  verify: (data: VerifyReviewLockInput) =>
    isLocalMode() ? localStore.reviewLock.verify(data) : api.post<void>('/review-lock/verify', data),
};
```

- [ ] **Step 7: 类型与 lint + 全量单测**

Run: `npx vitest run && cd client && npx tsc --noEmit && npx eslint src`
Expected: 全绿

- [ ] **Step 8: Commit**

```bash
git add client/src/utils/reviewLockHash.ts client/src/utils/reviewLockHash.test.ts client/src/local/localStore.ts client/src/api/reviews.ts
git commit -m "feat(review-lock): 本地模式 SHA-256+salt 哈希与 reviewLock 存取(含单测)"
```

---

### Task 11: 解锁标记 cookie 工具 + ReviewGate + App.tsx 接入

**Files:**
- Create: `client/src/utils/unlockMarker.ts`
- Create: `client/src/components/review/ReviewGate.tsx` / `ReviewGate.css`
- Modify: `client/src/App.tsx`(`case '/review'`)

**Interfaces:**
- Consumes: `reviewLockApi`(Task 10)、`useAuth().user.id`
- Produces: `isReviewUnlocked(identityId)` / `markReviewUnlocked(identityId)`;`<ReviewGate>{children}</ReviewGate>`

- [ ] **Step 1: unlockMarker.ts(新建)**

```ts
/**
 * 复盘锁解锁标记(ADR-0005):会话 cookie——跨标签页共享、浏览器关闭即失效,
 * 精确对应「每次启动系统只需输入一次」。值 = 当前身份 id,读取时校验匹配,
 * 换账号自动失效。标记非机密,可被 JS 读写(防护本体在服务端验证与哈希)。
 */
const COOKIE_NAME = 'kaoyandaily_review_unlocked';

export function isReviewUnlocked(identityId: string): boolean {
  if (!identityId) return false;
  const entry = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return false;
  try {
    return decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) === identityId;
  } catch {
    return false;
  }
}

export function markReviewUnlocked(identityId: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(identityId)}; path=/; SameSite=Lax`;
}
```

- [ ] **Step 2: ReviewGate.tsx(新建)**

```tsx
import React, { useEffect, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { reviewLockApi } from '../../api/reviews';
import { useAuth } from '../../hooks/useAuth';
import { isReviewUnlocked, markReviewUnlocked } from '../../utils/unlockMarker';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import './ReviewGate.css';

/**
 * 复盘锁门禁(spec §1):App.tsx 以 <ReviewGate><ReviewPage/></ReviewGate> 包裹,
 * children 保持 lazy(本组件不静态 import ReviewPage,勿破坏代码分割)。
 * 三态:未设锁 → 引导设置;已锁未解锁 → 验证;解锁 → children。
 */
type GateStep = 'loading' | 'error' | 'setup' | 'verify' | 'unlocked';

export function ReviewGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [step, setStep] = useState<GateStep>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reviewLockApi
      .getStatus()
      .then(({ hasLock }) => {
        if (cancelled) return;
        const identity = user?.id ?? '';
        if (!hasLock) setStep('setup');
        else if (identity && isReviewUnlocked(identity)) setStep('unlocked');
        else setStep('verify');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('加载复盘锁状态失败');
          setStep('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4 || newPassword.length > 64) {
      setFormError('密码需 4-64 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await reviewLockApi.set({ newPassword });
      markReviewUnlocked(user?.id ?? '');
      setStep('unlocked');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '设置失败,请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await reviewLockApi.verify({ password });
      markReviewUnlocked(user?.id ?? '');
      setStep('unlocked');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '验证失败,请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'unlocked') return <>{children}</>;

  return (
    <main className="review-gate">
      <Card className="review-gate__card glass-2">
        {step === 'loading' && <LoadingState message="加载复盘锁状态中..." />}
        {step === 'error' && <ErrorState message={loadError ?? '加载失败'} onRetry={() => window.location.reload()} />}

        {step === 'setup' && (
          <>
            <h2 className="review-gate__title">
              <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
              设置复盘锁
            </h2>
            <p className="review-gate__desc">复盘属于隐私内容,设置二重密码后,每次启动系统需验证一次才能进入。</p>
            <form onSubmit={handleSetup} className="review-gate__form">
              <input
                type="password"
                className="review-gate__input"
                placeholder="新密码(4-64 位)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <input
                type="password"
                className="review-gate__input"
                placeholder="确认新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {formError && <p className="review-gate__error" role="alert">{formError}</p>}
              <Button type="submit" variant="primary" loading={submitting}>设置并进入</Button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <h2 className="review-gate__title">
              <Lock size={18} strokeWidth={1.75} aria-hidden="true" />
              复盘已加密保护
            </h2>
            <p className="review-gate__desc">请输入复盘锁密码进入。</p>
            <form onSubmit={handleVerify} className="review-gate__form">
              <input
                type="password"
                className="review-gate__input"
                placeholder="复盘锁密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
              {formError && <p className="review-gate__error" role="alert">{formError}</p>}
              <Button type="submit" variant="primary" loading={submitting}>解锁</Button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: ReviewGate.css(新建)**

```css
/* 复盘锁门禁:居中窄卡 */
.review-gate {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl) var(--space-lg);
}

.review-gate__card {
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.review-gate__title {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  color: var(--color-text-primary);
}

.review-gate__desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.review-gate__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.review-gate__input {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
}

.review-gate__input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
}

.review-gate__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-danger);
}
```

注意:实施时以 `tokens.css` 实际存在的令牌名为准核对(`--text-lg`/`--radius-md`/`--color-danger`/`--color-border` 等若名称不同,改用既有等价令牌,禁止硬编码)。

- [ ] **Step 4: App.tsx 接入**

顶部 import:`import { ReviewGate } from './components/review/ReviewGate';`(非 lazy:门禁很轻,且需在 ReviewPage chunk 加载前拦截)。

`case '/review'` 改为:

```tsx
      case '/review':
        return (
          <ReviewGate>
            <ReviewPage />
          </ReviewGate>
        );
```

- [ ] **Step 5: 类型与 lint**

Run: `cd client && npx tsc --noEmit && npx eslint src/App.tsx src/components/review src/utils/unlockMarker.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/unlockMarker.ts client/src/components/review client/src/App.tsx
git commit -m "feat(review-lock): ReviewGate 三态门禁(会话 cookie 解锁标记)+ App 路由接入"
```

---

### Task 12: ProfileDropdown 修改入口 + ReviewLockModal

**Files:**
- Create: `client/src/components/review/ReviewLockModal.tsx`
- Modify: `client/src/components/ui/ProfileDropdown.tsx`

**Interfaces:**
- Consumes: `reviewLockApi`(Task 10)

- [ ] **Step 1: ReviewLockModal.tsx(新建)**

```tsx
import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { reviewLockApi } from '../../api/reviews';
import { showToast } from '../ui/Toast';

/** 复盘锁设置/修改弹窗(顶栏账户菜单入口):已设锁时需先验证当前密码(spec §1) */
export function ReviewLockModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [hasLock, setHasLock] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    reviewLockApi
      .getStatus()
      .then(({ hasLock }) => setHasLock(hasLock))
      .catch(() => setHasLock(false));
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4 || newPassword.length > 64) {
      setError('密码需 4-64 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await reviewLockApi.set({ currentPassword: hasLock ? currentPassword : undefined, newPassword });
      showToast('success', '复盘锁已保存');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败,请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="复盘锁密码">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {hasLock && (
          <input
            type="password"
            placeholder="当前密码"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        )}
        <input
          type="password"
          placeholder="新密码(4-64 位)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          type="password"
          placeholder="确认新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>{error}</p>}
        <Button type="submit" variant="primary" loading={submitting}>保存</Button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: ProfileDropdown 接入**

顶部 import 追加:

```tsx
import { KeyRound } from 'lucide-react';
import { ReviewLockModal } from '../review/ReviewLockModal';
```

state 追加(`const [importOpen, setImportOpen] = useState(false);` 之后):

```tsx
  const [lockModalOpen, setLockModalOpen] = useState(false);
```

`menuItems` 数组中「导入数据」之后、「登出」之前插入:

```tsx
    {
      key: 'review-lock',
      label: '复盘锁密码…',
      icon: <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />,
      action: () => setLockModalOpen(true),
    },
```

`<ImportBackupModal ... />` 之后追加:

```tsx
      <ReviewLockModal isOpen={lockModalOpen} onClose={() => setLockModalOpen(false)} />
```

- [ ] **Step 3: 类型与 lint**

Run: `cd client && npx tsc --noEmit && npx eslint src/components`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/review/ReviewLockModal.tsx client/src/components/ui/ProfileDropdown.tsx
git commit -m "feat(review-lock): 顶栏账户菜单复盘锁设置/修改弹窗"
```

---

### Task 13: 休息提示音 + 响铃开关修复(批 C)

**Files:**
- Modify: `client/src/utils/sound.ts`(整文件重写)
- Modify: `client/src/components/ui/SoundToggle.tsx`
- Modify: `client/src/pages/PomodoroPage.tsx`(响铃调用点)

**Interfaces:**
- Produces: `playEndSound(kind: 'focus' | 'break')`;`setSoundEnabled(enabled: boolean)`

- [ ] **Step 1: sound.ts 重写(完整内容)**

```ts
/**
 * 提示音引擎:合成音兜底 + 可替换 mp3 + 用户手势解锁 + 开关门控
 *
 * - 浏览器自动播放策略:AudioContext 必须经用户手势(如点击「开始专注」)
 *   后创建/resume,否则后续自然结束时的播放会被拦截。
 * - mp3 可选:client/public/sounds/pomodoro-end.mp3(专注)/break-end.mp3(休息)。
 *   存在则优先用 Audio 播放(fetch HEAD 探测并校验 Content-Type),缺失用 Web Audio
 *   合成兜底,功能不依赖文件存在。
 * - setSoundEnabled 门控所有播放(修复:响铃开关此前从未被消费的 bug)。
 * - 全部失败路径静默(console.debug),绝不抛出到 UI 层。
 */
let audioCtx: AudioContext | null = null;
let soundEnabled = true;

type SoundKind = 'focus' | 'break';
const MP3_URLS: Record<SoundKind, string> = {
  focus: '/sounds/pomodoro-end.mp3',
  break: '/sounds/break-end.mp3',
};
const mp3Available: Partial<Record<SoundKind, boolean>> = {};

function getAudioContext(): AudioContext | null {
  const Ctor =
    (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function initSoundOnGesture(): void {
  try {
    if (!audioCtx) {
      audioCtx = getAudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  } catch (err) {
    console.debug('initSoundOnGesture failed', err);
  }
}

/** 响铃总开关(SoundToggle 同步;拉取失败保持默认开启) */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

async function detectMp3(kind: SoundKind): Promise<boolean> {
  if (mp3Available[kind] !== undefined) return mp3Available[kind] as boolean;
  try {
    const res = await fetch(MP3_URLS[kind], { method: 'HEAD' });
    // 仅状态码 200 不够:dev vite / 生产 nginx 的 SPA fallback 会把不存在的
    // 路径回退为 index.html(200 + text/html),须校验 Content-Type 为 audio/*
    const contentType = res.headers.get('content-type') ?? '';
    mp3Available[kind] = res.ok && contentType.startsWith('audio/');
  } catch {
    mp3Available[kind] = false;
  }
  return mp3Available[kind] as boolean;
}

interface SynthNote {
  freq: number;
  startOffset: number;
  duration: number;
}

/** 合成提示音:notes 为频率/起始/时长序列;mp3 缺失时的兜底音源 */
function playSynthesized(notes: SynthNote[]): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const { freq, startOffset, duration } of notes) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + startOffset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.85);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }
}

// 专注结束钟声:A5 → D6(既有音色,勿改——用户已有预期)
const FOCUS_NOTES: SynthNote[] = [
  { freq: 880, startOffset: 0, duration: 0.4 },
  { freq: 1174.66, startOffset: 0.18, duration: 0.4 },
];
// 休息结束提示音:D6 → A6 上行双音,更轻快,与专注钟声区分(CONTEXT.md 休息提示音)
const BREAK_NOTES: SynthNote[] = [
  { freq: 1174.66, startOffset: 0, duration: 0.3 },
  { freq: 1760, startOffset: 0.14, duration: 0.3 },
];

export async function playEndSound(kind: SoundKind = 'focus'): Promise<void> {
  if (!soundEnabled) return;
  try {
    initSoundOnGesture();
    const useMp3 = await detectMp3(kind);
    if (useMp3) {
      const AudioCtor = (globalThis as unknown as { Audio?: typeof Audio }).Audio;
      if (AudioCtor) {
        await new AudioCtor(MP3_URLS[kind]).play();
        return;
      }
    }
    playSynthesized(kind === 'break' ? BREAK_NOTES : FOCUS_NOTES);
  } catch (err) {
    // 播放被拦截/失败:静默降级,不打扰用户
    console.debug('playEndSound failed', err);
  }
}
```

- [ ] **Step 2: SoundToggle 接线**

import 追加 `import { setSoundEnabled } from '../../utils/sound';`。拉取成功回调改为:

```ts
      .then((s) => {
        if (!cancelled) {
          setEnabled(s.pomodoroSoundEnabled);
          setSoundEnabled(s.pomodoroSoundEnabled);
        }
      })
```

`handleToggle` 成功分支改为:

```ts
      const s = await settingsApi.update({ pomodoroSoundEnabled: next });
      setEnabled(s.pomodoroSoundEnabled);
      setSoundEnabled(s.pomodoroSoundEnabled);
```

- [ ] **Step 3: PomodoroPage 响铃调用点按 kind 区分**

worker `onmessage` 内播放行改为:

```ts
        if (type === 'end' && firedTag === armedTagRef.current && !selfEndedRef.current) {
          armedTagRef.current = null;
          void playEndSound(firedTag.startsWith('break:') ? 'break' : 'focus');
        }
```

专注自然结束兜底(`setNaturalRounds` 前)保持 `void playEndSound();`(focus 缺省);休息自然结束兜底改为 `void playEndSound('break');`。

- [ ] **Step 4: lint 与类型**

Run: `cd client && npx tsc --noEmit && npx eslint src/utils/sound.ts src/components/ui/SoundToggle.tsx src/pages/PomodoroPage.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/sound.ts client/src/components/ui/SoundToggle.tsx client/src/pages/PomodoroPage.tsx
git commit -m "feat(sound): 休息结束独立提示音 + 响铃开关真正生效(setSoundEnabled 门控)"
```

---

### Task 14: 文档同步(AGENT.md/ARCHITECTURE.md 维护规则)+ 全量验证

**Files:**
- Modify: `AGENT.md`、`ARCHITECTURE.md`

- [ ] **Step 1: 全量验证**

Run: `npx vitest run && npm run lint && npm run build`
Expected: 全绿;以实跑结果更新测试基线数字。

- [ ] **Step 2: AGENT.md 同步(改动其列举的事实必须同步)**

- 「服务端总装」/端点相关:路由文件 10→11(reviews 后加 reviewLock,注明挂载层 requireAuth + verifyLimiter);focus 端点清单加 `POST /:id/pause`、`POST /:id/resume`
- 「Key Conventions」加一行:**暂停判断看 `paused_at` 非空,勿发明 status 判断(ADR-0006);解锁标记为会话 cookie(ADR-0005)**
- 「Testing」基线数字改为实跑结果
- 文档地图「动砚池计时器」行之后加一行:「复盘锁/暂停 | spec `2026-08-28-review-lock-and-focus-updates-design.md` + ADR-0005/0006」

- [ ] **Step 3: ARCHITECTURE.md 同步**

- 目录结构:`components/review/`(ReviewGate/ReviewLockModal)、路由文件清单 11 个
- 服务端端点清单:reviewLock 行 + focus 行补两端点
- 客户端 API 模块表:reviews 行分支数更新(reviewLockApi 3 方法,同 `isLocalMode()`)
- UI 组件清单:通用组件加 ReviewGate、ReviewLockModal
- shared 常量说明加 `FOCUS_PAUSE_MAX_SECONDS`

- [ ] **Step 4: Commit**

```bash
git add AGENT.md ARCHITECTURE.md
git commit -m "docs(agent): 同步复盘锁与暂停(端点/组件/约定/测试基线)"
```

- [ ] **Step 5: 汇报效果(工作流第 6 步)**

只汇报不合并:逐条对照四项需求 + 双模式(服务器/本地)+ reduced-motion 回归,交用户亲自检查;commit/merge/push 等用户明确下令。
