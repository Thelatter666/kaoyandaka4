# 单词本「提示词管理 + 批量查词」实施计划

> **For agentic workers:** 按卡（P1–P3）派发子代理执行。步骤用 `- [ ]` 勾选跟踪。
> **本仓执行纪律（硬性）**：子代理只写代码与测试、不执行 `git commit/push`；主代理（PM）逐卡验收（亲跑 lint/test/build，不轻信汇报）；提交与推送由主代理在用户明确下令后进行。
> **spec**：`docs/superpowers/specs/2026-09-30-vocabulary-module-design.md` §13（提示词管理）、§14（批量查词）、§1 决策 9/10。
> **本批次纯客户端**（无需 server/shared 数据层改动，仅 shared/constants.ts 加一个常量）；提示词与批量均为 client 概念。

**Goal:** LLM 配置弹窗支持提示词预设管理（契约骨架固定、仅 `extra` 要求可自定义、多条预设可切换）；查询弹窗支持一次输入多个词、串行分别生成并入库、失败自动暂存。

**Architecture:** 提示词构建与预设 CRUD 收在 `client/src/utils/vocabLlm.ts`（`buildVocabSystemPrompt` 固定骨架 + 用户片段；预设存 localStorage）；`lookupWord` 内部解析激活预设、签名不变，故单查/批量/补全全部自动生效。批量流程复刻 K4 批量补全的串行状态机（AbortController、逐项状态、汇总 Toast），UI 落在 `VocabQueryModal`。

**Tech Stack:** React 18 + TS + Vite；localStorage 设备级存储；framer-motion（如需要）；Vitest（node 环境）。

## Global Constraints（每张卡默认继承）

- 分支：继续在 `feat/vocab-module` 上改；子代理不建分支不提交。
- **零新依赖**；无 server/shared 数据层改动（唯一例外：P1 在 `shared/src/constants.ts` 加 `VOCAB_BATCH_MAX`）。
- 颜色一律 `var(--color-*)`；BEM `vocab-*`；co-located CSS；动效 `useShouldReduceMotion()` 降级；**禁常驻无限动画**；禁 `dangerouslySetInnerHTML`。
- **禁从 `@shared/schemas/*` 值导入**（zod 红线）；类型 `import type` 允许。
- **契约骨架红线**：JSON 结构与格式/数量/转义要求由代码持有，用户仅可编辑 `extra` 要求描述——任何"让用户改契约"的实现都是错的。
- 提示词预设与 LLM 连接配置同为**设备级 localStorage、不进备份、不上传服务器**。
- node 测试环境：纯函数与 localStorage 逻辑可测；UI 走 lint/build/浏览器实测。
- 每卡返回物：改动文件清单（含行数）+ 验证命令输出与 exit code + 未尽事项。

## 拆卡总览

```
P1 数据层（vocabLlm 提示词构建+预设 CRUD+parseWordList）──> P2 UI（配置弹窗提示词区 + 查询弹窗批量流程）──> P3 E2E + 文档
```

| 卡 | 档位 | 领地（互斥） | 依赖 |
|---|---|---|---|
| P1 client 数据层 | **L1** | `client/src/utils/vocabLlm.ts` + `.test.ts`、`shared/src/constants.ts` | 无 |
| P2 client UI | **L2** | `client/src/components/vocab/VocabLlmConfigModal.tsx`、`client/src/components/vocab/VocabQueryModal.tsx`、`client/src/pages/VocabularyPage.tsx` + `VocabularyPage.css` | P1 |
| P3 E2E+文档 | **L1** | `e2e/**`、`AGENT.md`、`ARCHITECTURE.md`、`CONTEXT.md`、spec | P2 |

功能整体：**L1→L2**（本批次跨层但单端）。

---

## Task P1: client 数据层（提示词构建/预设 CRUD/批量解析）

**Files:**
- Modify: `client/src/utils/vocabLlm.ts`、`shared/src/constants.ts`
- Test: `client/src/utils/vocabLlm.test.ts`

**Interfaces（Produces，P2 按此消费）:**

```ts
// shared/src/constants.ts
export const VOCAB_BATCH_MAX = 20;

// client/src/utils/vocabLlm.ts
export interface VocabPromptPreset { id: string; name: string; extraRequirement: string }
export interface VocabPromptStore { presets: VocabPromptPreset[]; activeId: string | null }
export const VOCAB_PROMPT_STORE_KEY = 'kaoyandaily-vocab-prompt-presets';
export const DEFAULT_EXTRA_REQUIREMENT = '词根词缀拆解、2-4 组高频易混词辨析、一句话记忆法';
export function buildVocabSystemPrompt(extraRequirement?: string | null): string;
export function loadPromptStore(): VocabPromptStore;          // 读取失败/不存在 → { presets: [], activeId: null }
export function savePromptStore(store: VocabPromptStore): void;
export function getActiveExtraRequirement(): string | null;    // activeId 解析失败 → null（= 用默认）
export function parseWordList(raw: string, max?: number): { words: string[]; truncated: number };
// lookupWord 签名不变（内部改用 getActiveExtraRequirement()）
```

- [ ] **Step 1: 改 `buildVocabSystemPrompt`**（固定骨架 + 可自定义片段；`VOCAB_SYSTEM_PROMPT` 保留为默认构建结果，向后兼容既有断言）：

```ts
export const DEFAULT_EXTRA_REQUIREMENT = '词根词缀拆解、2-4 组高频易混词辨析、一句话记忆法';

/** 契约骨架固定（JSON 结构/格式/数量/转义要求不可自定义），仅 extra 部分要求可由用户改写 */
export function buildVocabSystemPrompt(extraRequirement?: string | null): string {
  const extra = extraRequirement?.trim() ? extraRequirement.trim() : DEFAULT_EXTRA_REQUIREMENT;
  return `你是一位考研英语辅导老师。用户会给你一个英语单词或短语，请输出考研备考者需要的单词详解。
只输出一个 JSON 对象，不要输出任何解释、不要使用 Markdown 代码围栏。JSON 结构：
{"phonetic":"美式音标，如 /əˈbændən/，查不到给 null",
 "definitions":[{"pos":"词性缩写如 v./n./adj.","meaning":"简明中文释义，考研核心义在前"}],
 "examples":[{"en":"英文例句，风格贴近考研真题长难句","zh":"对应的准确中文翻译"}],
 "extra":"Markdown 字符串，没有可靠内容给 null",
 "examFreq":"该词在考研英语中的考频：高 / 中 / 低，不确定给 null"}
要求：definitions 覆盖该词全部常用词性（1-10 条）；examples 给 1-10 条；字符串内不得出现未转义的换行。
extra 部分的要求：${extra}`;
}

export const VOCAB_SYSTEM_PROMPT = buildVocabSystemPrompt(null);
```

- [ ] **Step 2: 预设 CRUD + 激活解析**（存 `VOCAB_PROMPT_STORE_KEY`；校验宽松：非法结构回落空 store）：

```ts
export interface VocabPromptPreset { id: string; name: string; extraRequirement: string }
export interface VocabPromptStore { presets: VocabPromptPreset[]; activeId: string | null }
export const VOCAB_PROMPT_STORE_KEY = 'kaoyandaily-vocab-prompt-presets';

export function loadPromptStore(): VocabPromptStore {
  try {
    const raw = localStorage.getItem(VOCAB_PROMPT_STORE_KEY);
    if (!raw) return { presets: [], activeId: null };
    const parsed = JSON.parse(raw) as Partial<VocabPromptStore>;
    const presets = Array.isArray(parsed.presets)
      ? parsed.presets.filter(
          (p): p is VocabPromptPreset =>
            !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.extraRequirement === 'string'
        )
      : [];
    const activeId = typeof parsed.activeId === 'string' ? parsed.activeId : null;
    return { presets, activeId };
  } catch {
    return { presets: [], activeId: null };
  }
}

export function savePromptStore(store: VocabPromptStore): void {
  localStorage.setItem(VOCAB_PROMPT_STORE_KEY, JSON.stringify(store));
}

export function getActiveExtraRequirement(): string | null {
  const store = loadPromptStore();
  if (!store.activeId) return null;
  return store.presets.find((p) => p.id === store.activeId)?.extraRequirement ?? null;
}
```

- [ ] **Step 3: `lookupWord` 内部注入激活预设**（签名不变）：把两处 `VOCAB_SYSTEM_PROMPT` 引用改为：

```ts
const prompt = buildVocabSystemPrompt(getActiveExtraRequirement());
const messages: ChatMessage[] = [
  { role: 'system', content: prompt },
  { role: 'user', content: `${prompt}\n现在查询单词：${word}` },
];
```

- [ ] **Step 4: `parseWordList`**：

```ts
/** 批量输入解析：切分 → 归一 → 去空/超长 → 保序去重 → 截断（max 默认 VOCAB_BATCH_MAX） */
export function parseWordList(raw: string, max: number = VOCAB_BATCH_MAX): { words: string[]; truncated: number } {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const piece of raw.split(/[\s,;，；]+/)) {
    const word = normalizeWord(piece);
    if (!word || word.length > 100 || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  if (words.length <= max) return { words, truncated: 0 };
  return { words: words.slice(0, max), truncated: words.length - max };
}
```

注：`normalizeWord` 从 `client/src/local/types` 导入（zod-free 版，勿从 `@shared/schemas/vocab` 值导入）。

- [ ] **Step 5: 测试**（`vocabLlm.test.ts` 扩展，最小增量，既有 15+ 用例语义不动）：
  - `buildVocabSystemPrompt()` 含契约骨架（"只输出一个 JSON"、`"definitions"`）与 `DEFAULT_EXTRA_REQUIREMENT`
  - `buildVocabSystemPrompt('只讲词根')` 含「extra 部分的要求：只讲词根」且**不含**默认文案；`buildVocabSystemPrompt('  ')` 回落默认
  - `loadPromptStore/savePromptStore` 往返；坏 JSON / 缺字段 → 空 store
  - `getActiveExtraRequirement`：activeId 命中 → 返回；activeId 指向不存在 → null；无 activeId → null
  - `lookupWord` 在预设生效时：fetch mock 捕获的 system/user 消息含用户自定义文案（stub localStorage 写入预设）
  - `parseWordList`：`"abandon, Benefit\nabandon;  x  "` → `['abandon','benefit','x']`（去重、小写、去空）；超长项（101 字符）丢弃；`max=2` 时 `truncated` 正确

- [ ] **Step 6: 验证**（附输出与 exit code）：`npx vitest run client/src/utils/vocabLlm.test.ts` → PASS；`npx vitest run` → 全绿；`npx eslint .` → 0/0；`cd client && npx tsc --noEmit` → 0 error

---

## Task P2: client UI（配置弹窗提示词区 + 查询弹窗批量流程）

**Files:**
- Modify: `client/src/components/vocab/VocabLlmConfigModal.tsx`、`client/src/components/vocab/VocabQueryModal.tsx`、`client/src/pages/VocabularyPage.tsx`、`client/src/pages/VocabularyPage.css`

**Interfaces:**
- Consumes（P1）：`VocabPromptPreset / VocabPromptStore / loadPromptStore / savePromptStore / buildVocabSystemPrompt / parseWordList / VOCAB_BATCH_MAX / DEFAULT_EXTRA_REQUIREMENT`
- Produces：无下游（UI 层终卡）

- [ ] **Step 1: 配置弹窗—提示词区**（在现有三字段与「测试连接」之间插入一个可展开区「提示词」）：
  - 预设列表：首项常驻「默认」，其后为已存预设（单选，选中即 `savePromptStore({...store, activeId})` 即时生效并 Toast）；每项带「编辑/删除」小按钮；删除生效中的预设 → ConfirmDialog → 删除并 `activeId=null` 回落默认
  - 新建/编辑表单：名称（max 30，必填）+ extra 要求（textarea，max 2000，可空=默认）；「提示词预览」折叠区显示 `buildVocabSystemPrompt(当前编辑值)` 只读全文（让用户看到契约骨架不可改）
  - 保存预设：`crypto.randomUUID()` 生成 id（照 `client/src/utils/uuid.ts` 惯例）
  - 提示词区不参与「测试连接」（连接测试与提示词无关）
- [ ] **Step 2: 查询弹窗—批量流程**（在现有单查状态机上叠加）：
  - 输入框改 textarea（rows=2，`maxLength={2400}`）；输入时实时计算 `parseWordList` 结果数，>1 时按钮文案「批量生成（N）」并在输入区下方显示「将处理 N 个词」+ 超限提示（truncated>0 时「最多一次 20 个词，已截取前 20 个」）
  - 提交：解析结果 1 个 → 现有 `runLookup`（不变）；≥2 个 → `startBatch(words)`
  - `startBatch`：`async for` 串行（AbortController 可在「取消」时中止）；逐词状态对象 `{ word, state: 'queued'|'running'|'success'|'duplicate'|'staged'|'error'|'cancelled', message? }`；执行序：跳过词库已有（`cards` + 本批已成功集合查重）→ `lookupWord` → 成功 `vocabApi.create({word, content})` → `onCreated` → state='success'；抛 `LlmError`（非 not_configured）→ `vocabApi.create({word})` → state='staged'；暂存失败或非 LLM 错误 → state='error' + message；`not_configured` 抛错中断全批并调 `onOpenLlmConfig`
  - 进度列表 UI：每词一行（词 + 状态徽标 + 失败原因摘要），顶部 `生成中 x/y` + 「取消」；结束后汇总 Toast `成功 x · 已存在 y · 已暂存 z · 失败 w`（error 级当 w>0，info 级当取消）
  - 完成后：单查/批量共用的输入态清理逻辑；父级 `onCreated` 已支持逐卡插入，无需改协议
- [ ] **Step 3: 样式**（`VocabularyPage.css`）：提示词区（`vocab-llm__prompts*`）、批量进度列表（`vocab-query__batch*`）、状态徽标色板（复用 tokens；success/staged/error/duplicate/cancelled 五色）；无常驻动画
- [ ] **Step 4: 验证**：
  1. `cd client && npx tsc --noEmit` → 0 error
  2. `npx vitest run` → 全绿（P1 后的基线）
  3. `npx eslint .` → 0/0
  4. `cd client && npx vite build` + `node e2e/check-perf-budget.mjs` → exit 0，首屏 ≤200KB
  5. 浏览器实测（playwright MCP；5173；`#/local` 临时账户；真网关 `http://localhost:7863/v1` + 用户 key/model）：
     a. 配置弹窗「提示词」区：新建预设「只讲词根」（extra 要求填「只输出词根词缀拆解，不要辨析和记忆法」）→ 预览区确认契约骨架仍在、extra 要求已换成自定义 → 保存并选中 → 关闭
     b. 单查一个词 → 生成的 `extra` 内容符合自定义要求（体现"只讲词根"）；切回「默认」再查一词 → extra 恢复默认风格
     c. 批量：输入「abandon, benefit\nresilient」→ 显示「批量生成（3）」→ 提交 → 逐词状态流转（queued→running→success）→ 完成后词库出现 3 张完整卡；Toast 汇总正确
     d. 批量含重复词与坏词：输入「abandon\nabandon\nx, 」「+ 一个已存在词」→ 去重、已存在标记「已存在」；把 baseUrl 改死地址后批量 → 全部「已暂存」，词库出现待补全卡
     e. 取消：批量进行中点「取消」→ 未处理项标「已取消」、已完成项保留
     f. 收尾：删除临时账户 + localStorage 清理（配置/预设两键）
  6. `grep -rn "animation.*infinite\|iteration-count: infinite" client/src/components/vocab/ client/src/pages/VocabularyPage*` → 无结果

---

## Task P3: E2E + 文档同步

**Files:**
- Modify: `e2e/tests/vocab.spec.ts`、`AGENT.md`、`ARCHITECTURE.md`、`CONTEXT.md`、`docs/superpowers/specs/2026-09-30-vocabulary-module-design.md`（如需勘误）

- [ ] **Step 1: E2E 新用例**（不调真 LLM）：`page.evaluate` 写入提示词预设（localStorage）+ 死地址 LLM 配置 → 配置弹窗打开显示预设列表与自定义项（UI 断言）；查询弹窗输入「alpha, beta, gamma」→ 断言显示「批量生成（3）」→ 提交（死地址）→ 三个词全部落为**待补全卡**（IndexedDB 断言 `definitions: []` × 3）→ Toast 汇总含「已暂存 3」；收尾清账户与两处 localStorage
- [ ] **Step 2: 文档同步**：
  - `AGENT.md`：Key Conventions 加「提示词契约骨架固定、仅 extra 要求可自定义；预设存 localStorage `kaoyandaily-vocab-prompt-presets`（设备级不进备份）」；「查词契约双角色注入」条目补「提示词由 buildVocabSystemPrompt 构建」；Testing 基线改实跑值
  - `ARCHITECTURE.md`：utils 清单 `vocabLlm` 补 `buildVocabSystemPrompt / 预设 CRUD / parseWordList`；UI 清单补「提示词预设管理、批量查词进度」；首屏实跑值
  - `CONTEXT.md`：单词本组加「提示词预设 Prompt Preset」「批量查词」术语（含 _Avoid_）
- [ ] **Step 3: 全量门禁**（附输出与 exit code）：`npx vitest run`；`npx eslint .`；`cd client && npx vite build` + `node e2e/check-perf-budget.mjs`；`cd e2e && PW_CHANNEL=chrome npx playwright test`（全 spec 含新用例）；双端 `npx tsc --noEmit`

---

## 主代理集成检查单

1. P1 回收：亲跑四门禁；核对 `lookupWord` 签名未变（P2 依赖此契约）。
2. P2 回收：亲跑四门禁 + 抽验浏览器实测（提示词生效链路、批量含失败暂存、取消）。
3. P3 回收：全量门禁五连 + spec §13/§14 验收对照。
4. 提交序列建议：`feat(vocab): 提示词构建与预设 CRUD（契约骨架固定、extra 可自定义）` → `feat(vocab): 提示词管理界面与批量查词流程` → `docs+E2E`。
