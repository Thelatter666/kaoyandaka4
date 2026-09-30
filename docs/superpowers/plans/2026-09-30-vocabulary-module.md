# 单词本模块实施计划（Vocabulary Module）

> **For agentic workers:** 本计划按卡（Task C1–C5）派发子代理执行（配合 superpowers:subagent-driven-development 的两段式审查）。步骤用 `- [ ]` 勾选跟踪。
> **本仓执行纪律（硬性）**：子代理只写代码与测试、不执行 `git commit/push`；主代理（PM）逐卡验收（亲跑 lint/test/build，不轻信汇报）；提交与推送由主代理在用户明确下令后进行。spec：`docs/superpowers/specs/2026-09-30-vocabulary-module-design.md`。

**Goal:** 新增单词本模块：LLM 查词生成考研向词卡（浏览器直连 OpenAI 兼容接口）+ 扇贝式「新词首学/到期复习」简化 SRS + 三索引词库，双数据模式（MySQL + IndexedDB）并纳入备份。

**Architecture:** 契约与 SRS 纯函数收在 `shared/`（双端同源）；服务器新增 `vocab_cards` 表与 `/api/v1/vocab` 路由；本地新增 IndexedDB store（DB v1→2）；前端 `#/vocabulary` 单页双视图 + TopNav 第 8 项。

**Tech Stack:** React 18 + TS + Vite 6 / Express 4 + MySQL 8 (mysql2) / Zod 3.24（shared schemas）/ Vitest（node 环境）+ fake-indexeddb / framer-motion。

## Global Constraints（每张卡默认继承）

- 分支：从 `main` 新建 `feat/vocab-module`；子代理在工作区直接改，**不建分支不提交**。
- **零新依赖**：Markdown 渲染手写 React 组件、发音用 `speechSynthesis`、LLM 用原生 `fetch`。
- 颜色一律 `var(--color-xxx)`（`client/src/styles/tokens.css`），禁硬编码；CSS co-located，BEM（`vocab-xxx__yyy--zzz`）。
- 动效：framer-motion；新组件的动效分支一律 `useShouldReduceMotion()`（节能模式超集，勿手写 `matchMedia`）；**禁止常驻（无限）动画**（`power-save.spec.ts` 全页扫描会拦）。
- `VocabularyPage` 必须留在 lazy chunk：不改 `client/vite.config.ts` 的 `manualChunks`；完工后首屏 JS ≤ 200KB（`node e2e/check-perf-budget.mjs`）。
- 数据隔离：所有 SQL `WHERE user_id = ?`（`req.session.userId` 注入，绝不收客户端 user_id）；本地归属 `accountId`。
- 错误形状：`AppError(status, code, message)` → `{error:{code,message,details}}`。
- 测试环境为 **node**（无 jsdom）：只测纯函数与数据层；UI 卡无单测，验收走 lint/build/手工清单。
- 日期：`nextReviewDate` 用 `YYYY-MM-DD`；datetime 字符串化**对照既有 transform 惯例**（C2 对照 `server/src/routes/tasks.ts` 的 transform，C3 对照 `client/src/utils/localStatistics.ts` 的今日口径），双模式保持一致。
- 每卡返回物：改动文件清单（含行数）+ 验证命令与输出（exit code）+ 未尽事项。

## 拆卡总览与档位记账

```
C1 shared 契约层 ──┬──> C2 server 层（可与 C3 并行）
                   └──> C3 client 数据层 ──> C4 client UI 层
C2 + C4 ──> C5 E2E + 文档同步 + 全量门禁
```

| 卡 | 档位 | 领地（互斥） | 依赖 |
|---|---|---|---|
| C1 shared 契约与纯函数 | **L1** | `shared/src/**` | 无 |
| C2 server 层 | **L2** | `server/src/**` | C1 |
| C3 client 数据层 | **L2** | `client/src/local/**`、`client/src/api/vocab.ts`、`client/src/utils/vocabLlm.ts`、`client/src/utils/localImport.ts` | C1 |
| C4 client UI 层 | **L2** | `client/src/pages/VocabularyPage*`、`client/src/components/vocab/**`、`client/src/App.tsx`、`client/src/components/layout/TopNav*` | C1+C3 |
| C5 E2E+文档+门禁 | **L1** | `e2e/**`、`AGENT.md`、`ARCHITECTURE.md`、`CONTEXT.md` | C2+C4 |

功能整体档位：**L2**（跨模块多卡）。

---

## Task C1: shared 契约与纯函数层

**Files:**
- Create: `shared/src/schemas/vocab.ts`、`shared/src/srs.ts`
- Modify: `shared/src/constants.ts`（追加常量）、`shared/src/types/index.ts`（追加 re-export）、`shared/src/schemas/backup.ts`（data 加 vocabCards）、`shared/src/schemas/import.ts`（DiffSummarySchema 加 vocabCards）
- Test: `shared/src/schemas/vocab.test.ts`（Create）、`shared/src/srs.test.ts`（Create）

**Interfaces（Produces，后续卡按此签名消费）:**
- `normalizeWord(word: string): string`
- `VocabContentSchema / VocabLookupResultSchema / CreateVocabCardSchema / UpdateVocabCardSchema / ReviewGradeSchema / VocabCardSchema` 及类型 `VocabDefinition / VocabExample / VocabContent / VocabCard / ReviewGrade`
- `VOCAB_MASTERY_MAX = 5`、`VOCAB_SRS_INTERVALS = [0,1,2,4,7,15]`
- `addDays(dateStr: 'YYYY-MM-DD', days: number): string`
- `applyReview(state: SrsState, grade: ReviewGrade, today: string): SrsState`，`SrsState = { masteryLevel; intervalDays; nextReviewDate; isMastered; correctCount; wrongCount }`
- `buildReviewQueue(cards: VocabCard[], today: string, quota: number | null): { newCards: VocabCard[]; dueCards: VocabCard[] }`
- `BackupFileSchema.data.vocabCards?: BackupRecordSchema[]`（可选）

- [ ] **Step 1: 写失败测试** `shared/src/schemas/vocab.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { CreateVocabCardSchema, UpdateVocabCardSchema, normalizeWord } from './vocab.js';

const content = {
  definitions: [{ pos: 'v.', meaning: '放弃' }],
  examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }],
};

describe('vocab schemas', () => {
  it('normalizeWord: trim + lowercase', () => {
    expect(normalizeWord('  Abandon ')).toBe('abandon');
  });
  it('CreateVocabCardSchema: 合法输入通过且 word 未强制小写（归一在调用方）', () => {
    expect(CreateVocabCardSchema.parse({ word: 'Abandon', content })).toMatchObject({ word: 'Abandon' });
  });
  it('CreateVocabCardSchema: 空 definitions 拒绝', () => {
    expect(() => CreateVocabCardSchema.parse({ word: 'a', content: { ...content, definitions: [] } })).toThrow();
  });
  it('UpdateVocabCardSchema: masteryLevel 与 reset 二选一', () => {
    expect(UpdateVocabCardSchema.safeParse({ masteryLevel: 3 }).success).toBe(true);
    expect(UpdateVocabCardSchema.safeParse({}).success).toBe(false);
    expect(UpdateVocabCardSchema.safeParse({ masteryLevel: 3, reset: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 写失败测试** `shared/src/srs.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { addDays, applyReview, buildReviewQueue } from './srs.js';
import type { VocabCard } from './schemas/vocab.js';

const base = { masteryLevel: 0, intervalDays: 0, nextReviewDate: '2026-09-30', isMastered: false, correctCount: 0, wrongCount: 0 };

describe('applyReview', () => {
  it('known: 升档并按新档间隔安排', () => {
    expect(applyReview(base, 'known', '2026-09-30')).toEqual({
      masteryLevel: 1, intervalDays: 1, nextReviewDate: '2026-10-01', isMastered: false, correctCount: 1, wrongCount: 0,
    });
  });
  it('known: 4 档答对毕业，间隔取 SRS_INTERVALS[5]=15', () => {
    expect(applyReview({ ...base, masteryLevel: 4, intervalDays: 7 }, 'known', '2026-09-30')).toMatchObject({
      masteryLevel: 5, intervalDays: 15, nextReviewDate: '2026-10-15', isMastered: true,
    });
  });
  it('known: 5 档封顶不再升、保持毕业', () => {
    expect(applyReview({ ...base, masteryLevel: 5, isMastered: true, correctCount: 9 }, 'known', '2026-09-30'))
      .toMatchObject({ masteryLevel: 5, isMastered: true, correctCount: 10 });
  });
  it('fuzzy: 档位不变、间隔重置 1 天、不计对错', () => {
    expect(applyReview({ ...base, masteryLevel: 3, correctCount: 2 }, 'fuzzy', '2026-09-30')).toEqual({
      masteryLevel: 3, intervalDays: 1, nextReviewDate: '2026-10-01', isMastered: false, correctCount: 2, wrongCount: 0,
    });
  });
  it('unknown: 降 2 档下限 0、当天到期、计错', () => {
    expect(applyReview({ ...base, masteryLevel: 1 }, 'unknown', '2026-09-30')).toEqual({
      masteryLevel: 0, intervalDays: 0, nextReviewDate: '2026-09-30', isMastered: false, correctCount: 0, wrongCount: 1,
    });
  });
});

const mkCard = (over: Partial<VocabCard>): VocabCard => ({
  id: 'x', word: 'w', phonetic: null,
  definitions: [{ pos: 'n.', meaning: 'm' }], examples: [{ en: 'a', zh: 'b' }],
  extra: null, examFreq: null, masteryLevel: 0, intervalDays: 0,
  nextReviewDate: '2026-09-30', isMastered: false, firstLearnedAt: null,
  correctCount: 0, wrongCount: 0, lastReviewedAt: null,
  createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', ...over,
});

describe('buildReviewQueue', () => {
  it('新词区=未首学，按 createdAt 升序；到期区=已首学未毕业且到期，按掌握档升序、同级按到期日', () => {
    const cards = [
      mkCard({ id: 'due-m2', firstLearnedAt: '2026-09-29T00:00:00.000Z', masteryLevel: 2 }),
      mkCard({ id: 'new-2', createdAt: '2026-09-30T02:00:00.000Z' }),
      mkCard({ id: 'due-m0', firstLearnedAt: '2026-09-29T00:00:00.000Z', masteryLevel: 0 }),
      mkCard({ id: 'mastered', firstLearnedAt: '2026-09-29T00:00:00.000Z', isMastered: true }),
      mkCard({ id: 'new-1', createdAt: '2026-09-30T01:00:00.000Z' }),
      mkCard({ id: 'future', firstLearnedAt: '2026-09-29T00:00:00.000Z', nextReviewDate: '2026-10-01' }),
    ];
    const q = buildReviewQueue(cards, '2026-09-30', null);
    expect(q.newCards.map((c) => c.id)).toEqual(['new-1', 'new-2']);
    expect(q.dueCards.map((c) => c.id)).toEqual(['due-m0', 'due-m2']);
  });
  it('配额截断：新词优先占额度，余量给到期词', () => {
    const cards = [
      mkCard({ id: 'n1' }), mkCard({ id: 'n2' }),
      mkCard({ id: 'd1', firstLearnedAt: 'x' }), mkCard({ id: 'd2', firstLearnedAt: 'x' }),
    ];
    expect(buildReviewQueue(cards, '2026-09-30', 3)).toEqual({
      newCards: [expect.objectContaining({ id: 'n1' }), expect.objectContaining({ id: 'n2' })],
      dueCards: [expect.objectContaining({ id: 'd1' })],
    });
  });
});
```

- [ ] **Step 3: 跑测试确认失败**：`npx vitest run shared/src/srs.test.ts shared/src/schemas/vocab.test.ts` → FAIL（模块不存在）
- [ ] **Step 4: 实现** `shared/src/schemas/vocab.ts`：

```ts
import { z } from 'zod';

export const VocabDefinitionSchema = z.object({ pos: z.string().min(1).max(30), meaning: z.string().min(1).max(500) });
export const VocabExampleSchema = z.object({ en: z.string().min(1).max(1000), zh: z.string().min(1).max(1000) });
export const ExamFreqEnum = z.enum(['高', '中', '低']);

export const VocabContentSchema = z.object({
  phonetic: z.string().min(1).max(100).nullable().optional(),
  definitions: z.array(VocabDefinitionSchema).min(1).max(10),
  examples: z.array(VocabExampleSchema).min(1).max(10),
  extra: z.string().max(20000).nullable().optional(),
  examFreq: ExamFreqEnum.nullable().optional(),
});
export const VocabLookupResultSchema = VocabContentSchema; // LLM 输出契约 = 词卡内容

export const CreateVocabCardSchema = z.object({ word: z.string().min(1).max(100), content: VocabContentSchema });

export const UpdateVocabCardSchema = z
  .object({ masteryLevel: z.number().int().min(0).max(5).optional(), reset: z.boolean().optional() })
  .refine((v) => (v.masteryLevel !== undefined) !== (v.reset === true), { message: 'masteryLevel 与 reset 必须二选一' });

export const ReviewGradeSchema = z.enum(['known', 'fuzzy', 'unknown']);

export const VocabCardSchema = z.object({
  id: z.string(), word: z.string(), phonetic: z.string().nullable(),
  definitions: z.array(VocabDefinitionSchema), examples: z.array(VocabExampleSchema),
  extra: z.string().nullable(), examFreq: ExamFreqEnum.nullable(),
  masteryLevel: z.number().int().min(0).max(5), intervalDays: z.number().int().min(0),
  nextReviewDate: z.string(), isMastered: z.boolean(), firstLearnedAt: z.string().nullable(),
  correctCount: z.number().int().min(0), wrongCount: z.number().int().min(0),
  lastReviewedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});

export type VocabDefinition = z.infer<typeof VocabDefinitionSchema>;
export type VocabExample = z.infer<typeof VocabExampleSchema>;
export type VocabContent = z.infer<typeof VocabContentSchema>;
export type CreateVocabCardInput = z.infer<typeof CreateVocabCardSchema>;
export type UpdateVocabCardInput = z.infer<typeof UpdateVocabCardSchema>;
export type ReviewGrade = z.infer<typeof ReviewGradeSchema>;
export type VocabCard = z.infer<typeof VocabCardSchema>;

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}
```

`shared/src/srs.ts`：

```ts
import { VOCAB_MASTERY_MAX, VOCAB_SRS_INTERVALS } from './constants.js';
import type { ReviewGrade, VocabCard } from './schemas/vocab.js';

export interface SrsState {
  masteryLevel: number; intervalDays: number; nextReviewDate: string;
  isMastered: boolean; correctCount: number; wrongCount: number;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyReview(state: SrsState, grade: ReviewGrade, today: string): SrsState {
  const correctCount = state.correctCount + (grade === 'known' ? 1 : 0);
  const wrongCount = state.wrongCount + (grade === 'unknown' ? 1 : 0);
  if (grade === 'known') {
    const masteryLevel = Math.min(VOCAB_MASTERY_MAX, state.masteryLevel + 1);
    const intervalDays = VOCAB_SRS_INTERVALS[masteryLevel];
    return {
      masteryLevel, intervalDays, nextReviewDate: addDays(today, intervalDays),
      isMastered: masteryLevel === VOCAB_MASTERY_MAX, correctCount, wrongCount,
    };
  }
  if (grade === 'fuzzy') {
    return { ...state, intervalDays: 1, nextReviewDate: addDays(today, 1), correctCount, wrongCount };
  }
  return {
    masteryLevel: Math.max(0, state.masteryLevel - 2), intervalDays: 0, nextReviewDate: today,
    isMastered: false, correctCount, wrongCount,
  };
}

export function buildReviewQueue(cards: VocabCard[], today: string, quota: number | null) {
  const newCards = cards
    .filter((c) => c.firstLearnedAt === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dueCards = cards
    .filter((c) => c.firstLearnedAt !== null && !c.isMastered && c.nextReviewDate <= today)
    .sort((a, b) => a.masteryLevel - b.masteryLevel || a.nextReviewDate.localeCompare(b.nextReviewDate));
  if (quota === null) return { newCards, dueCards };
  const newTaken = newCards.slice(0, quota);
  const dueTaken = dueCards.slice(0, Math.max(0, quota - newTaken.length));
  return { newCards: newTaken, dueCards: dueTaken };
}
```

`shared/src/constants.ts` 追加：

```ts
export const VOCAB_MASTERY_MAX = 5;
export const VOCAB_SRS_INTERVALS: readonly number[] = [0, 1, 2, 4, 7, 15];
```

`shared/src/types/index.ts` 追加 re-export（照既有 `export type { ... } from '../schemas/vocab.js'` 风格）：`VocabDefinition / VocabExample / VocabContent / VocabCard / CreateVocabCardInput / UpdateVocabCardInput / ReviewGrade`。

`shared/src/schemas/backup.ts`：`data` 对象加一行 `vocabCards: z.array(BackupRecordSchema).optional(),`（**schemaVersion 保持 1**）。

`shared/src/schemas/import.ts`：`DiffSummarySchema` 加 `vocabCards: DiffItemSchema`（DiffItem 结构不变）。

- [ ] **Step 5: 跑测试确认通过**：`npx vitest run shared/` → 全 PASS
- [ ] **Step 6: 回归**：`npx vitest run && npx eslint .` → 全绿 0/0（backup/import schema 改动不得破坏既有测试）

---

## Task C2: server 层（表 + 路由 + 备份导入导出）

**Files:**
- Modify: `server/src/db/schema.sql`（追加表）、`server/src/db/migrate.ts`（追加幂等建表步骤）、`server/src/index.ts`（挂载路由）、`server/src/utils/backup.ts`（组装 vocabCards）、`server/src/utils/import-mapping.ts`（映射 vocab）、`server/src/utils/import.ts`（TABLE_DEFS/冲突键/差异摘要）、`server/src/routes/export.ts`（导出快照查询加 vocab_cards）
- Create: `server/src/routes/vocab.ts`
- Test: 扩展 `server/src/utils/backup.test.ts`、`server/src/utils/import-mapping.test.ts`、`server/src/utils/import.test.ts`

**Interfaces:**
- Consumes（C1）：`CreateVocabCardSchema / UpdateVocabCardSchema / ReviewGradeSchema / normalizeWord / applyReview / addDays / VOCAB_SRS_INTERVALS`、类型 `VocabCard`
- Produces：REST 端点（见下）、备份 `data.vocabCards`、`ER_DUP_ENTRY → 409 WORD_EXISTS`

- [ ] **Step 1: schema.sql 追加表**（文件末尾，照既有 FK/索引风格）

```sql
CREATE TABLE IF NOT EXISTS vocab_cards (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  word VARCHAR(100) NOT NULL,
  phonetic VARCHAR(100) NULL,
  definitions JSON NOT NULL,
  examples JSON NOT NULL,
  extra TEXT NULL,
  exam_freq VARCHAR(20) NULL,
  mastery_level TINYINT NOT NULL DEFAULT 0,
  interval_days INT NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL,
  is_mastered BOOLEAN NOT NULL DEFAULT FALSE,
  first_learned_at DATETIME NULL,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  last_reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_vocab_user_word (user_id, word),
  KEY idx_vocab_user_next_review (user_id, next_review_date),
  KEY idx_vocab_user_mastery (user_id, mastery_level),
  CONSTRAINT fk_vocab_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`migrate.ts`：按既有幂等步骤风格（information_schema 检查或 `CREATE TABLE IF NOT EXISTS`，与 `user_settings` 步骤同法）追加 vocab_cards 建表步骤。

- [ ] **Step 2: 路由** `server/src/routes/vocab.ts`（完整；日期序列化对照 `routes/tasks.ts` transform 惯例）

```ts
import { Router } from 'express';
import {
  CreateVocabCardSchema, ReviewGradeSchema, UpdateVocabCardSchema, normalizeWord,
} from '../../../shared/src/schemas/vocab.js';
import { VOCAB_SRS_INTERVALS, addDays, applyReview } from '../../../shared/src/srs.js';
import { pool } from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { today } from '../utils/date.js';
import { generateUUID } from '../utils/uuid.js';

const router = Router();

interface VocabRow {
  id: string; word: string; phonetic: string | null;
  definitions: string; examples: string; extra: string | null; exam_freq: string | null;
  mastery_level: number; interval_days: number; next_review_date: string | Date;
  is_mastered: number | boolean; first_learned_at: Date | null;
  correct_count: number; wrong_count: number; last_reviewed_at: Date | null;
  created_at: Date; updated_at: Date;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function transformVocabCard(row: VocabRow) {
  return {
    id: row.id, word: row.word, phonetic: row.phonetic,
    definitions: JSON.parse(row.definitions), examples: JSON.parse(row.examples),
    extra: row.extra, examFreq: row.exam_freq,
    masteryLevel: row.mastery_level, intervalDays: row.interval_days,
    nextReviewDate: typeof row.next_review_date === 'string' ? row.next_review_date : String(row.next_review_date).slice(0, 10),
    isMastered: Boolean(row.is_mastered), firstLearnedAt: toIso(row.first_learned_at),
    correctCount: row.correct_count, wrongCount: row.wrong_count,
    lastReviewedAt: toIso(row.last_reviewed_at), createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  };
}

async function fetchCard(id: string, userId: string): Promise<VocabRow> {
  const [rows] = await pool.query<VocabRow[]>('SELECT * FROM vocab_cards WHERE id = ? AND user_id = ?', [id, userId]);
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', '词卡不存在');
  return rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query<VocabRow[]>(
      'SELECT * FROM vocab_cards WHERE user_id = ? ORDER BY created_at ASC', [req.userId],
    );
    res.json(rows.map(transformVocabCard));
  } catch (err) { next(err); }
});

router.post('/', validate(CreateVocabCardSchema), async (req, res, next) => {
  try {
    const word = normalizeWord(req.body.word);
    const { content } = req.body;
    const id = generateUUID();
    try {
      await pool.query(
        `INSERT INTO vocab_cards
           (id, user_id, word, phonetic, definitions, examples, extra, exam_freq,
            mastery_level, interval_days, next_review_date, is_mastered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, FALSE)`,
        [id, req.userId, word, content.phonetic ?? null, JSON.stringify(content.definitions),
         JSON.stringify(content.examples), content.extra ?? null, content.examFreq ?? null, addDays(today(), 1)],
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') throw new AppError(409, 'WORD_EXISTS', '该单词已在词库中');
      throw err;
    }
    res.status(201).json(transformVocabCard(await fetchCard(id, req.userId)));
  } catch (err) { next(err); }
});

router.patch('/:id', validate(UpdateVocabCardSchema), async (req, res, next) => {
  try {
    const row = await fetchCard(req.params.id, req.userId);
    let mastery: number; let interval: number; let next: string; let mastered: boolean;
    if (req.body.reset === true) {
      mastery = 0; interval = 0; next = addDays(today(), 1); mastered = false;
    } else {
      mastery = req.body.masteryLevel;
      interval = VOCAB_SRS_INTERVALS[mastery];
      next = addDays(today(), interval);
      mastered = mastery === VOCAB_SRS_INTERVALS.length - 1;
    }
    await pool.query(
      `UPDATE vocab_cards SET mastery_level = ?, interval_days = ?, next_review_date = ?, is_mastered = ?,
         last_reviewed_at = NOW() WHERE id = ? AND user_id = ?`,
      [mastery, interval, next, mastered, req.params.id, req.userId],
    );
    res.json(transformVocabCard(await fetchCard(req.params.id, req.userId)));
  } catch (err) { next(err); }
});

router.post('/:id/review', validate(ReviewGradeSchema), async (req, res, next) => {
  try {
    const row = await fetchCard(req.params.id, req.userId);
    const next = applyReview(
      {
        masteryLevel: row.mastery_level, intervalDays: row.interval_days,
        nextReviewDate: String(row.next_review_date).slice(0, 10),
        isMastered: Boolean(row.is_mastered), correctCount: row.correct_count, wrongCount: row.wrong_count,
      },
      req.body, today(),
    );
    await pool.query(
      `UPDATE vocab_cards SET mastery_level = ?, interval_days = ?, next_review_date = ?, is_mastered = ?,
         correct_count = ?, wrong_count = ?, last_reviewed_at = NOW() WHERE id = ? AND user_id = ?`,
      [next.masteryLevel, next.intervalDays, next.nextReviewDate, next.isMastered,
       next.correctCount, next.wrongCount, req.params.id, req.userId],
    );
    res.json(transformVocabCard(await fetchCard(req.params.id, req.userId)));
  } catch (err) { next(err); }
});

router.post('/:id/learn', async (req, res, next) => {
  try {
    await fetchCard(req.params.id, req.userId); // 不存在 → 404
    await pool.query(
      'UPDATE vocab_cards SET first_learned_at = NOW() WHERE id = ? AND user_id = ? AND first_learned_at IS NULL',
      [req.params.id, req.userId],
    );
    res.json(transformVocabCard(await fetchCard(req.params.id, req.userId)));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM vocab_cards WHERE id = ? AND user_id = ?', [req.params.id, req.userId],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) throw new AppError(404, 'NOT_FOUND', '词卡不存在');
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
```

`server/src/index.ts`：import `vocabRouter`（照既有 import 风格），在 settings 挂载行后加：

```ts
app.use('/api/v1/vocab', requireAuth, vocabRouter);
```

注：若 `today()` 在 `utils/date.ts` 的实际导出名不同，用该文件现有等价函数（读文件确认，勿新造）。`mastered = mastery === 5` 用 `VOCAB_MASTERY_MAX` 亦可。

- [ ] **Step 3: 备份导出**：`routes/export.ts` 的事务快照查询加 `SELECT * FROM vocab_cards WHERE user_id = ?`（进 ExportRows）；`utils/backup.ts` 加 `mapVocabCard(row)`：

```ts
// 照既有 str/num/bool helper 风格；产出 camelCase、无 user_id、无 snake_case 键
{
  id, word, phonetic: strNullable(phonetic),
  definitions: JSON.parse(definitions), examples: JSON.parse(examples),
  extra: strNullable(extra), examFreq: strNullable(exam_freq),
  masteryLevel: num(mastery_level), intervalDays: num(interval_days),
  nextReviewDate: str(next_review_date).slice(0, 10), isMastered: bool(is_mastered),
  firstLearnedAt: toIsoNullable(first_learned_at), correctCount: num(correct_count),
  wrongCount: num(wrong_count), lastReviewedAt: toIsoNullable(last_reviewed_at), createdAt: toIso(created_at),
}
```

`buildBackupPayload` 的 `data.vocabCards = rows.vocabCards.map(mapVocabCard)`。

- [ ] **Step 4: 备份导入**：`utils/import-mapping.ts` 加 `mapVocabCards(items: unknown[])`——沿用 `strRequired/strNullable/boolStrict/intRequired/enumStrict/enumNullable` 白名单风格：`id` strRequired；`word` strRequired 后 lowercase；`definitions/examples` 逐项白名单 `{pos,meaning}/{en,zh}` strRequired、多余键丢弃；`masteryLevel` intRequired 且 clamp 后须在 0-5（越界报 MappingError）；`examFreq` enumNullable(['高','中','低'])；`nextReviewDate` strRequired；`isMastered` boolStrict；`firstLearnedAt/lastReviewedAt/phonetic/extra` strNullable；`correctCount/wrongCount/intervalDays` intRequired ≥0；`createdAt` strRequired。`utils/import.ts`：`TABLE_DEFS` 加 `vocab_cards`（列清单与映射键一致）；`collectConflictKeys` 加 vocab 模式（候选键 `id` 与 `'word:'+word`，merge 时按 `id IN (...) OR word IN (...)` 先删）；`computeDiffCounts/computeDiffSummary` 加 vocab（候选键同上）。导入插入 `user_id` 取目标账户（照既有各表做法）。

- [ ] **Step 5: 测试**（扩展三个 utils 测试文件，断言具体值）：
  - `backup.test.ts`：构造含 definitions/examples JSON 字符串的行 → 断言产出 `data.vocabCards[0]` 无 `user_id`/无 snake_case 键、`definitions` 已反序列化为数组、过 `BackupFileSchema`。
  - `import-mapping.test.ts`：合法 vocab 条目通过；`masteryLevel: 9` 报 MappingError；未知键（hacker/user_id）被丢弃；`word` 被 lowercase。
  - `import.test.ts`：`computeDiffCounts` vocab 用 id 与 `word:` 复合候选键（命中 existing word → updated）；`computeDiffSummary` 含 `vocabCards` 字段；`TABLE_DEFS` 含 9 表。
- [ ] **Step 6: 跑** `npx vitest run server/ shared/` → 全 PASS；`npx eslint .` → 0/0
- [ ] **Step 7: 手工验证（需本地 MySQL）**：`npm run db:init`（或 db:migrate）→ 表存在；`npm run dev` 后用 curl 走登录→建卡→重复建卡 409→review 后 next_review_date 符合间隔表。若无 DB 环境，明确报告跳过并给 curl 脚本。

---

## Task C3: client 数据层（IndexedDB + api + LLM 客户端）

**Files:**
- Modify: `client/src/local/db.ts`（DB_VERSION 2 + vocabCards store）、`client/src/local/types.ts`（LocalVocabCard）、`client/src/local/localStore.ts`（vocab 命名空间 + backup 往返）、`client/src/utils/localImport.ts`（vocab 映射与差异）
- Create: `client/src/api/vocab.ts`、`client/src/utils/vocabLlm.ts`
- Test: `client/src/utils/vocabLlm.test.ts`（Create）、扩展 `client/src/local/localStore.test.ts`、`client/src/utils/localImport.test.ts`

**Interfaces:**
- Consumes（C1）：`VocabCard / VocabContent / CreateVocabCardInput / UpdateVocabCardInput / ReviewGrade / normalizeWord / applyReview / addDays / VocabContentSchema / VOCAB_SRS_INTERVALS / VOCAB_MASTERY_MAX`
- Produces（C4 消费）：

```ts
// client/src/api/vocab.ts
export const vocabApi: {
  list(): Promise<VocabCard[]>;
  create(input: CreateVocabCardInput): Promise<VocabCard>;   // 重复词 → throw ApiError(409,'WORD_EXISTS')
  update(id: string, patch: UpdateVocabCardInput): Promise<VocabCard>;
  remove(id: string): Promise<void>;
  review(id: string, grade: ReviewGrade): Promise<VocabCard>;
  learn(id: string): Promise<VocabCard>;
};
// client/src/utils/vocabLlm.ts
export interface VocabLlmConfig { baseUrl: string; apiKey: string; model: string }
export type LlmErrorKind = 'not_configured' | 'network' | 'unauthorized' | 'rate_limit' | 'contract' | 'cors';
export class LlmError extends Error { kind: LlmErrorKind }
export function loadLlmConfig(): VocabLlmConfig | null;   // 三字段均非空才算配置
export function saveLlmConfig(config: VocabLlmConfig): void;
export function extractJsonContent(raw: string): string;  // 剥 ```json 围栏
export function lookupWord(config: VocabLlmConfig, word: string, signal?: AbortSignal): Promise<VocabContent>;
export const VOCAB_SYSTEM_PROMPT: string;
```

- [ ] **Step 1: db.ts**：`DB_VERSION` 1→2；`onupgradeneeded` 追加（新旧安装都覆盖）：

```ts
if (!db.objectStoreNames.contains('vocabCards')) {
  const store = db.createObjectStore('vocabCards', { keyPath: 'id' });
  store.createIndex('accountId', 'accountId', { unique: false });
  store.createIndex('accountId_word', ['accountId', 'word'], { unique: true });
  store.createIndex('accountId_nextReviewDate', ['accountId', 'nextReviewDate'], { unique: false });
  store.createIndex('accountId_masteryLevel', ['accountId', 'masteryLevel'], { unique: false });
}
```

`types.ts` 追加（复用 shared 类型 + 既有 `Accountless<T>` 惯例的反向）：

```ts
import type { VocabCard } from '@shared/types';
export type LocalVocabCard = VocabCard & { accountId: string };
```

- [ ] **Step 2: vocabLlm.ts**（完整实现如下；提示词全文内置）

```ts
import { VocabContentSchema } from '@shared/schemas/vocab';
import type { VocabContent } from '@shared/types';

export interface VocabLlmConfig { baseUrl: string; apiKey: string; model: string }
export const VOCAB_LLM_CONFIG_KEY = 'kaoyandaily-vocab-llm-config';
export type LlmErrorKind = 'not_configured' | 'network' | 'unauthorized' | 'rate_limit' | 'contract' | 'cors';
export class LlmError extends Error {
  constructor(public kind: LlmErrorKind, message: string) { super(message); this.name = 'LlmError'; }
}

export function loadLlmConfig(): VocabLlmConfig | null {
  try {
    const raw = localStorage.getItem(VOCAB_LLM_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VocabLlmConfig>;
    if (!parsed.baseUrl || !parsed.apiKey || !parsed.model) return null;
    return { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey, model: parsed.model };
  } catch { return null; }
}

export function saveLlmConfig(config: VocabLlmConfig): void {
  localStorage.setItem(VOCAB_LLM_CONFIG_KEY, JSON.stringify(config));
}

export function extractJsonContent(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : raw).trim();
}

export const VOCAB_SYSTEM_PROMPT = `你是一位考研英语辅导老师。用户会给你一个英语单词或短语，请输出考研备考者需要的单词详解。
只输出一个 JSON 对象，不要输出任何解释、不要使用 Markdown 代码围栏。JSON 结构：
{"phonetic":"美式音标，如 /əˈbændən/，查不到给 null",
 "definitions":[{"pos":"词性缩写如 v./n./adj.","meaning":"简明中文释义，考研核心义在前"}],
 "examples":[{"en":"英文例句，风格贴近考研真题长难句","zh":"对应的准确中文翻译"}],
 "extra":"Markdown 字符串：词根词缀拆解、2-4 组高频易混词辨析、一句话记忆法；没有可靠内容给 null",
 "examFreq":"该词在考研英语中的考频：高 / 中 / 低，不确定给 null"}
要求：definitions 覆盖该词全部常用词性（1-10 条）；examples 给 1-10 条；字符串内不得出现未转义的换行。`;

function parseContent(raw: string): VocabContent | null {
  try { return VocabContentSchema.parse(JSON.parse(extractJsonContent(raw))); } catch { return null; }
}

function failureReason(raw: string): string {
  try { VocabContentSchema.parse(JSON.parse(extractJsonContent(raw))); return '未知'; }
  catch (err) { return (err as Error).message.slice(0, 300); }
}

export async function lookupWord(config: VocabLlmConfig, word: string, signal?: AbortSignal): Promise<VocabContent> {
  const base = config.baseUrl.replace(/\/+$/, '');
  const call = async (messages: Array<{ role: string; content: string }>): Promise<string> => {
    const timeout = AbortSignal.timeout(30_000);
    const combined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, temperature: 0.3 }),
        signal: combined,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      if ((err as Error).name === 'TimeoutError') throw new LlmError('network', '请求超时（30 秒），请检查网络或服务商状态');
      throw new LlmError('cors', '无法连接 LLM 服务：该服务商可能不允许浏览器直连（CORS），或地址/网络有误');
    }
    if (res.status === 401 || res.status === 403) throw new LlmError('unauthorized', `API Key 无效或无权限（HTTP ${res.status}）`);
    if (res.status === 429) throw new LlmError('rate_limit', '触发服务商限流（HTTP 429），请稍后重试');
    if (!res.ok) throw new LlmError('network', `服务商返回 HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  };

  const messages = [
    { role: 'system', content: VOCAB_SYSTEM_PROMPT },
    { role: 'user', content: word },
  ];
  const first = await call(messages);
  const parsed = parseContent(first);
  if (parsed) return parsed;
  const retry = await call([
    ...messages,
    { role: 'assistant', content: first },
    { role: 'user', content: `你上次的输出不符合 JSON 契约（${failureReason(first)}）。请严格按要求重新输出纯 JSON。` },
  ]);
  const retried = parseContent(retry);
  if (retried) return retried;
  throw new LlmError('contract', 'LLM 两次输出都不符合词卡 JSON 契约，请更换模型或重试');
}
```

- [ ] **Step 3: api/vocab.ts**（完整实现如下）

```ts
import { normalizeWord } from '@shared/schemas/vocab';
import type { CreateVocabCardInput, ReviewGrade, UpdateVocabCardInput, VocabCard } from '@shared/types';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import { ApiError, api } from './client';

function rethrowLocalConflict(err: unknown): unknown {
  if (err instanceof Error && err.message === 'WORD_EXISTS') {
    return new ApiError(409, 'WORD_EXISTS', '该单词已在词库中');
  }
  return err;
}

export const vocabApi = {
  async list(): Promise<VocabCard[]> {
    if (isLocalMode()) return localStore.vocab.list();
    return api.get<VocabCard[]>('/vocab');
  },
  async create(input: CreateVocabCardInput): Promise<VocabCard> {
    const body: CreateVocabCardInput = { word: normalizeWord(input.word), content: input.content };
    if (isLocalMode()) {
      try { return await localStore.vocab.create(body); }
      catch (err) { throw rethrowLocalConflict(err); }
    }
    return api.post<VocabCard>('/vocab', body);
  },
  async update(id: string, patch: UpdateVocabCardInput): Promise<VocabCard> {
    if (isLocalMode()) return localStore.vocab.update(id, patch);
    return api.patch<VocabCard>(`/vocab/${id}`, patch);
  },
  async remove(id: string): Promise<void> {
    if (isLocalMode()) { await localStore.vocab.remove(id); return; }
    await api.delete(`/vocab/${id}`);
  },
  async review(id: string, grade: ReviewGrade): Promise<VocabCard> {
    if (isLocalMode()) return localStore.vocab.review(id, grade);
    return api.post<VocabCard>(`/vocab/${id}/review`, grade);
  },
  async learn(id: string): Promise<VocabCard> {
    if (isLocalMode()) return localStore.vocab.learn(id);
    return api.post<VocabCard>(`/vocab/${id}/learn`, {});
  },
};
```

（若 `ApiError` 构造签名与 `client.ts` 实际不一致，以 `client.ts` 现签名为准并保持 `(409,'WORD_EXISTS',文案)` 语义。）

- [ ] **Step 4: localStore.ts vocab 命名空间**（在 `localStore` 对象内加 `vocab` 键；下述 `todayLocal()` 为代称——实际用 `utils/localStatistics.ts` 现行的本地今日口径 helper，勿新造第二份今日计算）：

```ts
vocab: {
  async list(): Promise<VocabCard[]> {
    const accountId = requireAccountId();
    const rows = await idbGetAllByIndex<LocalVocabCard>('vocabCards', 'accountId', accountId);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(({ accountId: _a, ...card }) => card);
  },
  async getByWord(word: string): Promise<VocabCard | null> {
    const accountId = requireAccountId();
    const row = await idbGetByIndex<LocalVocabCard>('vocabCards', 'accountId_word', [accountId, normalizeWord(word)]);
    return row ? stripVocab(row) : null;
  },
  async create(input: CreateVocabCardInput): Promise<VocabCard> {
    const accountId = requireAccountId();
    const word = normalizeWord(input.word);
    const dup = await localStore.vocab.getByWord(word); // 显式引用，勿用 this
    if (dup) throw new Error('WORD_EXISTS');
    const nowIso = new Date().toISOString();
    const row: LocalVocabCard = {
      accountId, id: uuid(), word,
      phonetic: input.content.phonetic ?? null,
      definitions: input.content.definitions, examples: input.content.examples,
      extra: input.content.extra ?? null, examFreq: input.content.examFreq ?? null,
      masteryLevel: 0, intervalDays: 0, nextReviewDate: addDays(todayLocal(), 1),
      isMastered: false, firstLearnedAt: null, correctCount: 0, wrongCount: 0,
      lastReviewedAt: null, createdAt: nowIso, updatedAt: nowIso,
    };
    await idbPut('vocabCards', row);
    return stripVocab(row);
  },
  async update(id: string, patch: UpdateVocabCardInput): Promise<VocabCard> {
    const row = await requireCard(id);
    const today = todayLocal();
    let next: LocalVocabCard;
    if (patch.reset === true) {
      next = { ...row, masteryLevel: 0, intervalDays: 0, nextReviewDate: addDays(today, 1), isMastered: false };
    } else {
      const m = patch.masteryLevel ?? row.masteryLevel;
      next = {
        ...row, masteryLevel: m, intervalDays: VOCAB_SRS_INTERVALS[m],
        nextReviewDate: addDays(today, VOCAB_SRS_INTERVALS[m]), isMastered: m === VOCAB_MASTERY_MAX,
      };
    }
    next.updatedAt = new Date().toISOString();
    await idbPut('vocabCards', next);
    return stripVocab(next);
  },
  async remove(id: string): Promise<void> { await idbDelete('vocabCards', id); },
  async review(id: string, grade: ReviewGrade): Promise<VocabCard> {
    const row = await requireCard(id);
    const nextState = applyReview(
      { masteryLevel: row.masteryLevel, intervalDays: row.intervalDays, nextReviewDate: row.nextReviewDate,
        isMastered: row.isMastered, correctCount: row.correctCount, wrongCount: row.wrongCount },
      grade, todayLocal(),
    );
    const next: LocalVocabCard = { ...row, ...nextState, lastReviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await idbPut('vocabCards', next);
    return stripVocab(next);
  },
  async learn(id: string): Promise<VocabCard> {
    const row = await requireCard(id);
    if (row.firstLearnedAt) return stripVocab(row); // 幂等
    const now = new Date().toISOString();
    const next = { ...row, firstLearnedAt: now, updatedAt: now };
    await idbPut('vocabCards', next);
    return stripVocab(next);
  },
},
```

`requireCard(id)`：按 accountId 索引取单卡，找不到 throw `new Error('NOT_FOUND')`。`stripVocab(row)`：剔除 `accountId` 返回 `VocabCard`。

- [ ] **Step 5: 备份往返**：`localStore.backup.exportBackup` 加 `vocabCards`（strip accountId，其余字段原样）；`writeImportData` 处理 `data.vocabCards`（overwrite 模式清空该账户 store、merge 模式先按 id 或 word 删冲突再插，`accountId` 注入，字段映射 camelCase 直通——备份即 camelCase，无需转换）。
- [ ] **Step 6: localImport.ts**：`mapLocalBackupData` 加 vocab（宽松直通 + accountId 注入 + word lowercase 归一）；`computeDiffCounts` 加 vocab 候选键（`id`、`'word:'+word`）；`computeDiffSummary` 加 `vocabCards`。
- [ ] **Step 7: 测试**：
  - `vocabLlm.test.ts`：stub `globalThis.localStorage`（内存实现）与 `globalThis.fetch`；断言 `loadLlmConfig`（无/缺字段/完整三态）、`extractJsonContent`（无围栏/带围栏/带前后杂文）、`lookupWord` 成功路径（fetch mock 返回合法 JSON content）、401→LlmError('unauthorized')、坏 JSON 两次→LlmError('contract')、重试第二次成功。
  - `localStore.test.ts` 扩展（文件头已有 `fake-indexeddb/auto`）：创建→查重抛 WORD_EXISTS→list 排序；review 调度（固定日期断言 nextReviewDate/isMastered）；learn 幂等；update 调档/重置；backup 导出含 vocabCards 且无 accountId；导入往返恢复。
  - `localImport.test.ts` 扩展：vocab diff（added/updated/kept）与映射小写归一。
- [ ] **Step 8: 跑** `npx vitest run client/ shared/` → 全 PASS；`npx eslint .` → 0/0

---

## Task C4: client UI 层（页面 + 组件 + 路由 + 导航）

**Files:**
- Create: `client/src/pages/VocabularyPage.tsx` + `client/src/pages/VocabularyPage.css`、`client/src/components/vocab/{VocabQueryModal,VocabLlmConfigModal,VocabCardItem,VocabReviewCard,VocabIndexSwitcher,VocabMasteryDots,markdown}.tsx`（+ 各自 co-located css，小组件可合并 css 到 VocabularyPage.css）、`client/src/components/vocab/speak.ts`
- Modify: `client/src/App.tsx`（四位点）、`client/src/components/layout/TopNav.tsx` + `TopNav.css`（第 8 项 + 让宽）
- Test: 无单测（node 环境）；验收 = lint + build + 手工清单 + C5 门禁

**Interfaces:**
- Consumes（C1+C3）：`vocabApi`、`loadLlmConfig/saveLlmConfig/lookupWord/LlmError`、`buildReviewQueue/normalizeWord`、类型 `VocabCard/ReviewGrade/VocabContent`

- [ ] **Step 1: App.tsx 四位点**（精确 diff）：
  1. `pageLoaders` 加 `vocab: () => import('./pages/VocabularyPage').then((m) => ({ default: m.VocabularyPage })),`
  2. lazy 区加 `const VocabularyPage = lazy(pageLoaders.vocab);`
  3. `NAV_PREFETCH` 加 `'/vocabulary': pageLoaders.vocab,`（hash 键 `#/vocabulary`，照既有键写法）
  4. 受保护页 `switch` 加 `case '/vocabulary': return <VocabularyPage />;`（放在 default 之前）
  `PUBLIC_PAGES`/`GUEST_ONLY_PAGES` 不动。

- [ ] **Step 2: TopNav**：`NAV_ITEMS` 加 `{ path: '/vocabulary', label: '单词本', icon: BookMarked }`（lucide-react，import 照既有 16px/stroke 1.75 用法）。**让宽**：胶囊已满（余 1px），在 `TopNav.css` 压缩 `.top-nav` gap（6→5px）、`.top-nav__links` gap（3→2px）、`.top-nav__link` 水平 padding（各 -2px）起步，实测调到 **960px 视口下 8 项不换行不溢出**（DevTools 960px 宽度人工核验）。

- [ ] **Step 3: 页面结构**（`VocabularyPage.tsx`，单页双视图）：

```
<div class="vocab-page">（PageShell 包裹，title「单词本」）
  <div class="vocab-page__tabs"> 词库 | 复习 </div>
  view === 'library' → LibraryView
  view === 'review'  → ReviewView
</div>
```

LibraryView：状态 `cards: VocabCard[]`（mount 时 `vocabApi.list()`，增删改后 refetch 或本地 setState 更新）。
- 工具行：`[查询单词]` 按钮（开 VocabQueryModal）、`VocabIndexSwitcher`（乱序/顺序/掌握程度，glass 分段控件）、设置图标钮（开 VocabLlmConfigModal）
- 排序逻辑：`乱序` 每次进入词库视图/重选乱序时洗牌（`[...cards].sort(() => Math.random() - 0.5)`）；`顺序` createdAt 升序；`掌握程度` `(a,b) => a.masteryLevel - b.masteryLevel || a.word.localeCompare(b.word)`
- 列表：`VocabCardItem`（word + phonetic + 首条 meaning + `VocabMasteryDots(5)`；点击展开：全部 definitions、examples（en/zh）、extra（`<MarkdownText>`）、发音钮、手动调档（下拉 0-5 或 +1/-1 按钮，调 `vocabApi.update(id,{masteryLevel})`）、重置进度、删除（ConfirmDialog → `vocabApi.remove`）
- 空态：`EmptyState`（文案「词库还是空的，查一个单词开始吧」+ 查询按钮）

ReviewView（session 逻辑，完整状态机）：

```ts
interface ReviewSession {
  queueIds: string[];
  index: number;
  phase: 'front' | 'back';
  learnedCount: number;   // 已首学
  reviewedCount: number;  // 首次评分数（不含重现）
  relearnedCount: number; // 重现轮评分数
  isNewTotal: number; dueTotal: number; // 供完成态展示
}
const SESSION_KEY = 'kaoyandaily-vocab-review';
```

- 空闲态：`buildReviewQueue(cards, today, null)` 得今日概况（x 新词 · y 到期）；配额选择（5/10/20/30/全部，默认 10）；「开始复习」（x+y=0 时禁用并显示完成态）
- 开始：`queueIds = [...newCards, ...dueCards].map(id)`（配额截断后的队列），写 sessionStorage
- 当前卡：`cards.find(c => c.id === queueIds[index])`；若 `firstLearnedAt === null` → 新词首学卡：正面即完整详解（含 extra），按钮「知道了」→ `vocabApi.learn(id)` → learnedCount++ → advance
- 否则复习卡 `VocabReviewCard`：front = word + phonetic + 发音钮 + 「点击翻面」；点击 → phase='back'（framer-motion rotateY 翻面，`useShouldReduceMotion()` 时瞬时切换）；back = 完整详解 + 三键（认识/模糊/不认识）→ `vocabApi.review(id, grade)` → `grade==='unknown'` 时 `queueIds.push(id)`（队尾重现，本轮后续评分计入 relearnedCount）→ reviewedCount++（重现轮则 relearnedCount++）→ advance
- advance：`index+1 === queueIds.length` → 完成态（「今日新学 learnedCount · 复习 reviewedCount · 重练 relearnedCount」+ 返回词库按钮）并清 sessionStorage；否则 index++、phase='front'
- 每次变更写 sessionStorage；mount 时若有存档则恢复（找不到对应卡则丢弃存档）；「退出复习」中途退出保留存档
- 顶部 `ProgressBar`（index/queueIds.length）

- [ ] **Step 4: 组件契约**：
  - `VocabQueryModal`：输入框（placeholder「输入单词或短语」）→ 提交时 `normalizeWord` 后在 `cards` 里查重：命中 → 内嵌已有卡详情 + Toast「已在词库中」；未命中 → `loadLlmConfig()` 为 null → 引导跳 LlmConfigModal；否则 `lookupWord` → 预览（结构化渲染同卡片详情）→「加入单词本」→ `vocabApi.create({word, content})` → 成功 Toast + 关闭 + 刷新列表；`LlmError` 按 kind 给文案（kind→message 已含），Toast + 「重试」按钮；loading 态用 `.btn__spinner`（节能白名单类）。提交时传 `AbortSignal`，关闭弹窗 abort。
  - `VocabLlmConfigModal`：三输入（apiKey `type="password"`）；保存 → `saveLlmConfig` + Toast；页头设置钮显示配置状态（已配置/未配置）。
  - `markdown.tsx`：`MarkdownText({ text }: { text: string })`——**纯 React 文本节点，禁 dangerouslySetInnerHTML**；支持：按空行分段、`- ` 开头行聚合成 ul、行内 `**bold**`、单 `*斜体*` 可不做；其余按纯文本。
  - `speak.ts`：`speakWord(word: string): void`——`speechSynthesis`，`lang='en-US'`，先 `cancel()`；环境不支持则 no-op。
  - `VocabMasteryDots({ level }: { level: number })`：5 圆点，filled 用主色 token。
- [ ] **Step 5: 样式**：全部 `var(--color-*)`/`--dur-*`/`--ease-*`；卡片沿用 glass 层级类（`glass-1/2/3`）；翻面 `transform-style: preserve-3d` + framer-motion 控制旋转；**无任何 infinite 动画**；`.vocab-page` 用 PageShell maxWidth 1200。
- [ ] **Step 6: 验证**：`npx eslint .` → 0/0；`npx vitest run` → 全绿（不得破坏既有）；`npm run build` → 成功；手工清单（`npm run dev`）：
  - 未登录访问 `#/vocabulary` → 重定向 `#/`；登录后顶栏出现「单词本」且 960px 不溢出
  - 词库空态 → 查询（配置/未配置两条路径）→ 加入 → 列表出现
  - 重复查询 → 提示已在词库
  - 复习：首学 → 翻面 → 三键 → 答错重现 → 完成态；刷新页面恢复进度
  - 三索引行为；手动调档/重置/删除
  - 节能模式开启 + 系统 reduced-motion：翻面无过渡动画
  - 双模式：`#/local` 本地账户同样可用（无 LLM 配置时引导）

---

## Task C5: E2E + 文档同步 + 全量门禁

**Files:**
- Create: `e2e/tests/vocab.spec.ts`、`docs/adr/0008-vocab-llm-browser-direct-and-local-config.md`
- Modify: `AGENT.md`、`ARCHITECTURE.md`、`CONTEXT.md`
- Test: `npx playwright test`（本地模式，不调真 LLM）

**Interfaces:** Consumes：C2 的 REST、C3 的 IndexedDB store `vocabCards`、C4 的 UI。

- [ ] **Step 0: ADR-0008**（照 ADR-0007 的结构：背景/决策/后果）：记录两个决策——① LLM 调用统一浏览器直连（OpenAI 兼容），服务器代理仅留后路（备选：服务器代理+key 存 MySQL，因双份实现与本地模式无后端被否）；② LLM 配置存 localStorage 设备级、不进备份不进服务器（备选：user_settings 云存，因 key 泄漏面与设备语义被否）；附 CORS 被拒时的降级文案约定。

- [ ] **Step 1: E2E** `e2e/tests/vocab.spec.ts`（照 power-save.spec.ts 的本地模式进场方式：`#/local` 创建账户进入）。LLM 不可真调，用 **IndexedDB 播种**：`page.evaluate` 内打开 `kaoyandaily_local`，读 `localStorage['kaoyandaily_local_activeAccount']` 得 accountId，向 `vocabCards` put 两条卡（一条 `firstLearnedAt: null` 新词、一条已学到期 `masteryLevel: 1, nextReviewDate: 今天`），刷新页面。断言：
  1. 词库列表出现两个词；三索引切换后顺序改变/符合预期
  2. 复习 tab 概况「1 新词 · 1 到期」；配额默认 10；开始后首学卡完整展示 →「知道了」→ 复习卡正面只有单词音标 → 翻面 → 点「认识」→ 完成态计数正确
  3. 复习后读 IndexedDB 断言调度正确：对新词「知道了」→ `firstLearnedAt` 非空、`nextReviewDate = 今天+1`；对到期卡（播种 `masteryLevel:1`）点「认识」→ `masteryLevel:2`、`intervalDays:2`（`SRS_INTERVALS[2]`）、`nextReviewDate = 今天+2`
  4. 全程无 console error（过滤 401）
- [ ] **Step 2: AGENT.md 同步**（维护规则要求）：文档地图加单词本行（spec/plan 链接）；「7 个业务模块用 isLocalMode()」→ 8 个；Front-end Routing 数字更新（pageLoaders 13 / lazy 15 / NAV_PREFETCH 8）；服务端总装端点数与限流描述不变（vocab 无新限流）；Key Conventions 加「vocab_cards 唯一约束 (user_id, word)，词归一 normalizeWord」；Testing 基线数字更新为实跑结果；Backup 相关「8 资源」→ 9；`docs(agent):` 前缀记忆。
- [ ] **Step 3: ARCHITECTURE.md 同步**：目录树（client/src/components/vocab/、api/vocab.ts、utils/vocabLlm.ts、pages/VocabularyPage、server routes/vocab.ts、shared srs.ts）；端点清单表加 vocab 6 端点；前端路由明细数字；api 模块表加行（`isLocalMode()`，方法数 6）；数据库表 9→10（vocab_cards，另注 sessions 为隐式第 11 张）；备份资源 8→9；IndexedDB store 清单 + DB_VERSION 2。
- [ ] **Step 4: CONTEXT.md 同步**：新术语组「单词本」——词卡（Vocab Card）、首学（First Learning）、到期（Due）、掌握档（Mastery Level，0-5）、毕业（Mastered）、词库索引（乱序/顺序/掌握程度）、复习配额（Daily Quota）；每条含 _Avoid_ 行（照既有格式）。
- [ ] **Step 5: 全量门禁**（逐条报告 exit code）：`npx vitest run`（全绿）；`npx eslint .`（0/0）；`npm run build` + `node e2e/check-perf-budget.mjs`（首屏 ≤200KB，VocabularyPage 留在 lazy chunk）；`PW_CHANNEL=chrome npx playwright test`（smoke + power-save + vocab 全过；需 dev server，可用 `PW_CHANNEL=chrome`）。
- [ ] **Step 6: 报告**：改动文件清单 + 各门禁输出 + E2E 截图路径（playwright-report）。

---

## 主代理集成检查单（PM 逐卡执行）

1. C1 完成后：亲跑 `npx vitest run shared/` + 全量回归，确认 C2/C3 可并行的接口与计划一致（签名 diff）。
2. C2/C3 并行回收后：分别亲跑各自测试域 + `npx eslint .`；集成点核对——`vocabApi` 的 409 映射 vs 服务器 `WORD_EXISTS`、日期序列化双模式一致（抽查 review 后 `nextReviewDate` 格式）。
3. C4 回收后：`npm run build` + 手工清单抽验（顶栏 960px、节能翻面、双模式）。
4. C5 回收后：全量门禁四连 + spec §9 验收判据逐条对照。
5. 全程不 commit；待用户下令后按卡或合并提交（建议提交序列：`feat(vocab): shared 契约与 SRS 纯函数` → `feat(vocab): 服务端词库路由与备份集成` → `feat(vocab): 本地数据层与 LLM 客户端` → `feat(vocab): 单词本页面与导航` → `docs+E2E`）。
