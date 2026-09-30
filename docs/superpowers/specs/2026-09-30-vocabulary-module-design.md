# 单词本模块设计（Vocabulary Module）

> 日期：2026-09-30　状态：已与用户逐节对齐
> 关联：`AGENT.md`（路由四位点/数据隔离/备份体系）、`docs/adr/`（无新 ADR，若实现中出现架构分歧再补）
> 术语：词卡 = 一条单词详解记录；首学 = 新词第一次完整学习（不评分）；到期 = `next_review_date ≤ 今日`

## 0. 一句话

新增「单词本」模块：用户接入自己的 LLM（OpenAI 兼容，浏览器直连）查询单词生成考研向详解，以扇贝单词式翻面卡进行「新词首学 + 到期复习」的简化 SRS 循环；词库支持乱序 / 顺序 / 掌握程度三种索引，数据双模式（MySQL + IndexedDB）并纳入备份体系。

## 1. 已对齐决策

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 数据模式 | **双模式都要**（MySQL 表 + Express 路由 + IndexedDB store + localStore，与现有 7 业务模块同构） |
| 2 | LLM 路径 | **统一浏览器直连**（OpenAI 兼容 `/chat/completions`，key 存 localStorage 设备级；服务器代理仅留后路不实现） |
| 3 | 词卡结构 | **混合式**：核心字段结构化（音标/释义/例句），拓展内容（辨析/词源/记忆法）为 Markdown 富文本 |
| 4 | 复习调度 | **简化 SRS**：掌握档 0-5 + 间隔表 + 自评三键（认识/模糊/不认识） |
| 5 | 配额语义 | **新词首学 + 到期复习**合占每日配额 N（默认 10，可选 5/10/20/30/全部） |
| 6 | 备份 | **进备份**：`BackupFile.data` 加可选 `vocabCards`，schemaVersion 保持 1 |
| 7 | 页面组织 | **单页双视图**：`#/vocabulary` 内「词库 / 复习」tab 切换，TopNav 加第 8 项 |
| 8 | 暂存与补全 | **空数组即待补全标记**（无新列）：查词失败可暂存空卡，LLM 恢复后单卡 / 批量补全；空卡不进复习队列，补全后走新词首学；配置面板加「测试连接」（2026-09-30 增补，见 §12） |
| 9 | 提示词管理 | **契约骨架固定 + extra 要求可自定义**：JSON 结构不可自定义，仅 `extra`（富文本）部分的要求描述可由用户编辑；提示词预设（多条可切换）存 localStorage 设备级、不进备份（2026-09-30 增补，见 §13） |
| 10 | 批量查词 | **一次多个词、串行分别生成、生成即入库**；重复词跳过、LLM 失败自动暂存（与 §12 闭环）；上限 20 词/次（2026-09-30 增补，见 §14） |

## 2. 数据模型

### 2.1 MySQL（`server/src/db/schema.sql` 追加 + `migrate.ts` 幂等 CREATE TABLE IF NOT EXISTS）

```sql
CREATE TABLE IF NOT EXISTS vocab_cards (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  word VARCHAR(100) NOT NULL,            -- 存储 trim+lowercase 归一
  phonetic VARCHAR(100) NULL,
  definitions JSON NOT NULL,             -- [{pos, meaning}]，读时 parse / 写时 stringify（mysql2 JSON 列返回 string）
  examples JSON NOT NULL,                -- [{en, zh}]
  extra TEXT NULL,                       -- Markdown 拓展：词根词缀/易混辨析/记忆法
  exam_freq VARCHAR(20) NULL,            -- '高' | '中' | '低'，LLM 不确定给 NULL
  mastery_level TINYINT NOT NULL DEFAULT 0,   -- 0-5
  interval_days INT NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL,
  is_mastered BOOLEAN NOT NULL DEFAULT FALSE, -- 满 5 档置位，退出到期队列
  first_learned_at DATETIME NULL,        -- 首学完成标记；NULL = 新词区
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

### 2.2 IndexedDB（`client/src/local/db.ts`，DB_VERSION 1→2）

新增 store `vocabCards`：keyPath `id`；索引 `accountId`、`accountId_word`（unique）、`accountId_nextReviewDate`、`accountId_masteryLevel`。`localStore` 新增 `vocab` 命名空间，返回前 strip `accountId`，惯例与既有 8 store 一致。

### 2.3 Shared（`shared/src/schemas/vocab.ts` + `shared/src/srs.ts`）

Zod schema：
- `VocabDefinitionSchema` `{pos: string(min1), meaning: string(min1)}`
- `VocabExampleSchema` `{en: string(min1), zh: string(min1)}`
- `VocabContentSchema` `{phonetic?, definitions: min1/max10, examples: min1/max10, extra?(Markdown), examFreq?: '高'|'中'|'低'|null}` —— **同时充当 LLM 输出契约**（`VocabLookupResultSchema` 即它）
- `CreateVocabCardSchema` `{word: min1/max100, content: VocabContentSchema}`
- `UpdateVocabCardSchema` `{masteryLevel?: 0-5, reset?: boolean}`（二者互斥）
- `ReviewGradeSchema` `enum('known','fuzzy','unknown')`

常量（进 `shared/src/constants.ts`）：`VOCAB_MASTERY_MAX=5`、`VOCAB_SRS_INTERVALS=[0,1,2,4,7,15]`（下标 = 掌握档）。

SRS 纯函数（`shared/src/srs.ts`，服务器与本地**调用同一份**，杜绝口径漂移）：

```
applyReview(card, grade, today) -> Partial<VocabCard>
  known:   mastery = min(5, m+1); interval = SRS_INTERVALS[mastery];
           next = today + interval; is_mastered = (mastery === 5); correct_count+1
  fuzzy:   mastery 不变; interval = 1; next = today + 1
  unknown: mastery = max(0, m-2); interval = 0; next = today; wrong_count+1
  共通: last_reviewed_at = now
```

```
buildReviewQueue(cards, today, quota) -> {newCards, dueCards}
  newCards: first_learned_at 为空，按 created_at 升序
  dueCards: first_learned_at 非空 && !is_mastered && next_review_date ≤ today，
            按 mastery 升序、同级按 next_review_date 升序
  截断：新词优先占额度，剩余额度给到期词（总和不超 quota；quota=null = 全部）
```

手动调档（PATCH 语义）：`masteryLevel=n` → `interval=SRS_INTERVALS[n]`、`next=today+interval`、`is_mastered=(n===5)`；`reset=true` → mastery=0、interval=0、`next=today+1`、清 `is_mastered`。

### 2.4 备份（第 9 类资源）

- `shared/src/schemas/backup.ts`：`data` 加可选 `vocabCards: array(BackupRecordSchema)`，**schemaVersion 保持 1**（旧版导入新备份安全 strip；新版读旧备份得空数组）
- 服务器：`utils/backup.ts` 组装 + `utils/import-mapping.ts` 映射 + `utils/import.ts` `TABLE_DEFS`/冲突键加 `vocab`（候选键：`id` 与 `'word:xxx'`，冲突先删后插）
- 本地：`localStore.backup` 导出/导入同步加；导入合并语义与其余资源一致
- **LLM 配置不进备份**（含 apiKey，导出即泄漏）

## 3. LLM 集成

### 3.1 配置面板

单词本页右上角设置弹窗，字段：`baseURL`（如 `https://api.deepseek.com/v1`）、`apiKey`（密码型遮罩）、`model`（如 `deepseek-chat`）。存 localStorage `kaoyandaily-vocab-llm-config`（设备级，与 theme/powerSave 语义一致）；**三字段均非空才算已配置**。未配置时点「查询单词」直接引导打开面板。

### 3.2 调用与容错链

1. `POST {baseURL}/chat/completions`，`Authorization: Bearer <apiKey>`，`AbortController` 超时 30s
2. 取 `choices[0].message.content` → 剥 ` ```json ` 围栏（若有）→ `VocabContentSchema.parse` 校验
3. 校验失败自动重试 1 次（重试消息附上次的解析错误，要求修正输出）
4. 仍失败 → 分类错误提示（网络失败 / 401 key 无效 / 429 限流 / 响应不符合契约），Toast + 手动重试
5. CORS 被拒的错误文案明示「该服务商可能不允许浏览器直连」，后路 = 未来加服务器代理（本期不做）

### 3.3 提示词（全文框架，实现卡内定稿）

角色：考研英语辅导老师。输入：单词。输出：**只输出 JSON**（无围栏无解释），结构 = VocabContentSchema：
- `phonetic`：美式音标（查不到给 null）
- `definitions`：1-10 条，覆盖全部常用词性，`meaning` 简明中文释义（考研核心义在前）
- `examples`：1-10 条双语例句，风格贴近考研真题长难句，`zh` 为准确翻译
- `extra`：Markdown——词根词缀拆解、高频易混词辨析（2-4 组）、一句话记忆法
- `examFreq`：该词考研考频（高/中/低），不确定给 null

### 3.4 查询流程与查重

输入 → trim+lowercase 归一 → 先查词库（`GET /vocab` 全量已在页面状态中，本地查找即可）→
**已存在**：打开已有卡片 + Toast「已在词库中」，不重复调 LLM →
**不存在**：调 LLM → 生成预览（结构化渲染）→「加入单词本」入库：`mastery=0`、`interval=0`、`next_review_date=今天+1`、`first_learned_at=NULL`（**当天即出现在复习页新词区**）。

## 4. 复习系统（扇贝式）

- **入口**：复习 tab → 选今日配额（5/10/20/30/全部，默认 10）→ 开始
- **队列**：`buildReviewQueue`；session 内 `unknown` 的词**追加队尾立刻重现**（不占配额）；重现轮在最新卡片状态上再次调用 `applyReview` 并落库（不回滚首次评分）
- **首学卡**：正面即完整详解（不遮答案），点「知道了」→ `POST /vocab/:id/learn` 置 `first_learned_at`（不动 SRS 字段）
- **复习卡**：正面只有单词+音标+发音钮（遮全部释义）→ 点击翻面看详解 → 翻面后出现自评三键（认识/模糊/不认识）→ `POST /vocab/:id/review`
- **完成态**：配额取完显示「今日新学 x · 复习 y · 待重练 z」
- **进度恢复**：session 进度（队列 id 序列、当前下标、重练列表）存 sessionStorage `kaoyandaily-vocab-review`，刷新回到同一张卡
- **发音**：`speechSynthesis`（en-US），词库卡与复习卡均有发音钮

## 5. 词库视图与三索引

- 顶部索引切换器：**乱序**（每次进入重新洗牌）/ **顺序**（`created_at` 升序）/ **掌握程度**（`mastery` 升序，同级按 `word` 字母序，毕业词自然沉底）
- 卡片列表项：单词 + 音标 + 首要释义摘要 + 掌握档圆点（5 点）；点击展开详情：全字段（含 extra Markdown 渲染）+ 发音 + 手动调档/重置 + 删除（ConfirmDialog）
- 「查询单词」按钮置于词库视图顶部

## 6. 页面、路由与导航

- `client/src/pages/VocabularyPage.tsx`（+ co-located CSS，BEM）；子组件进 `client/src/components/vocab/`（查询弹窗、词卡、复习卡、索引切换器、LLM 配置弹窗）
- **App.tsx 四位点**：① `pageLoaders` 加 `vocab`（13 项）② `lazy()` 加 1 条（15 条）③ `NAV_PREFETCH` 加 `#/vocabulary`（8 条）④ 受保护页 `switch` 加分支；`PUBLIC_PAGES`/`GUEST_ONLY_PAGES` 不动
- **TopNav 第 8 项「单词本」**：胶囊已满宽（余 1px），按节能钮先例让宽，具体让法实现卡内实测定；**验收判据：960px 下 8 项不换行不溢出**
- **动效红线**：颜色全走 `tokens.css`；翻面用 framer-motion，`useShouldReduceMotion()`（节能模式超集）下瞬时切换；不得引入常驻（无限）动画；新页必须留在 lazy chunk

## 7. 服务端端点（`server/src/routes/vocab.ts`，挂载层 `requireAuth`）

| 端点 | 说明 |
|---|---|
| `GET /api/v1/vocab` | 全量词卡（个人量级，三索引/查重/队列计算均在客户端） |
| `POST /api/v1/vocab` | 加入词库，`CreateVocabCardSchema`；UNIQUE 冲突 → `409 WORD_EXISTS` |
| `PATCH /api/v1/vocab/:id` | 手动调档 / 重置进度 |
| `DELETE /api/v1/vocab/:id` | 204 无 body |
| `POST /api/v1/vocab/:id/review` | `{grade}` → 服务器调 shared `applyReview` 落库，返回更新后卡片 |
| `POST /api/v1/vocab/:id/learn` | 首学完成，置 `first_learned_at` |

错误形状、`validate()`、transform 惯例全沿用既有模式；单表操作无需 `withTransaction`；无新增限流。

## 8. 测试策略

- **shared**：`srs.test.ts`（三键×档位边界表驱动、毕业、负下限）、`buildReviewQueue`（新词优先/到期排序/配额截断/毕业排除/quota=null）、vocab schema 边界
- **server**：export 组装含 vocab、import-mapping 第 9 类映射与 `word:` 冲突键（沿用既有 utils 测试模式）
- **client**：localStore `vocab` 命名空间（`fake-indexeddb/auto`：CRUD/SRS/查重/strip）、LLM 响应解析纯函数（剥围栏/坏 JSON/字段缺失/重试契约）
- **E2E**：不做 LLM 真调用例；可选本地模式词库冒烟（`#/local` 进：加词→列表→翻面）；节能模式 E2E 的无限动画扫描自动覆盖新页
- **回归红线**：vitest 全绿、eslint 0/0、首屏 JS ≤200KB（`e2e/check-perf-budget.mjs`）

## 9. 用户视角验收判据

1. 未配置 LLM 查词 → 引导配置面板；配置后查 `abandon` → 结构化详解 → 加入 → 词库出现卡片
2. 重复查 `abandon` → 提示已在词库，不重复调 LLM
3. 复习流：新词首学 → 到期翻面自评 → 答错当场重现 → 完成后 DB `next_review_date` 符合间隔表
4. 三索引切换行为正确（乱序刷新即变、顺序按加入先后、掌握度低在前毕业沉底）
5. 备份导出含 `vocabCards`，导入另一模式/账户后词库与进度完整恢复；LLM 配置不出现在备份中
6. 双模式（服务器 / `#/local`）各自可用、数据独立
7. 960px 顶栏 8 项不溢出；节能模式与 `prefers-reduced-motion` 下翻面无过渡动画
8. 三条回归红线全过

## 10. 明确不做（YAGNI）

教材/词书批量导入；四选一与拼写测验；真人发音音频；服务器 LLM 代理（仅留后路）；LLM 配置云同步；词卡图片；跨用户词库分享。

## 11. 拆卡预告（领地互斥，writing-plans 阶段细化）

| 卡 | 领地 | 依赖 |
|---|---|---|
| C1 shared 纯函数层 | `shared/src/`（schemas/vocab.ts、srs.ts、constants.ts、backup.ts、types） | 无 |
| C2 server 层 | `server/src/`（schema.sql、migrate.ts、routes/vocab.ts、utils/backup+import*、index.ts 挂载） | C1 |
| C3 client 数据层 | `client/src/local/`（db.ts、localStore.ts）、`client/src/api/vocab.ts`、LLM 客户端纯函数 | C1 |
| C4 client UI 层 | `client/src/pages/VocabularyPage*`、`components/vocab/`、App.tsx、TopNav、tokens | C3 |
| C5 文档同步+E2E | `AGENT.md`/`ARCHITECTURE.md`/`CONTEXT.md`/`e2e/` | C2+C4 |

C2 与 C3 并行（都只依赖 C1、领地互斥）；C4 依赖 C3 的类型与 api；C5 收尾。

## 12. 暂存与补全（2026-09-30 增补）

> 本节为实施期增补，**覆盖**前文与之冲突的契约描述（§2.3 的 `content` 必填、§7 的 PATCH 语义）；未提及处一律不变。

### 12.1 动机

LLM 不可用（网络断、CORS 被拒、401/429、响应不合契约）时，加词不应瘫痪：先把单词以空内容卡收入词库，内容留待 LLM 恢复后补全。查词失败与「暂存」是同一弹窗内的两条出路，不是替代关系。

### 12.2 交互

- **入口**：查词失败（任何 `LlmError`，`not_configured` 除外）→ 查询弹窗错误区出现「暂存单词」按钮 + 提示文案；「未配置」仍只走「去配置 LLM」引导，其余失败分支带「重试」。
- **暂存**：以 `{word}`（不带 `content`）调 `CreateVocabCardInput` 创建**空内容卡**；Toast「已暂存，LLM 恢复后可补全」，弹窗关闭，卡片立即进入词库列表并带「待补全」徽标。
- **待补全过滤**：词库工具栏「待补全 (N)」按钮（无待补全卡时禁用）；过滤列表只显示待补全卡 + 本轮批量已处理的卡，其余词卡隐藏；过滤模式下待补全卡带勾选框（进入过滤默认全选，新暂存的卡自动补选）。
- **批量补全**：「补全选中（N）」**串行**逐卡 `lookupWord → PATCH {content}`；逐卡展示 排队中 / 补全中 / 已补全 / 补全失败（失败附原因摘要），进行中显示 `补全中 x/y` 与「取消补全」（AbortController；取消时未完成的卡标记「已取消」），结束后 Toast 汇总成功 / 失败数（有失败为 error 级、取消为 info 级）。
- **单卡补全**：展开待补全卡 → 详情显示「内容待补全」占位 + 「AI 补全」按钮；未配置 LLM 时点击引导打开配置弹窗。补全只写内容，不动 SRS。
- **补全之后**：卡片即完整卡，`first_learned_at` 仍为 NULL → 回到新词首学流程（当天出现在复习页新词区）。

### 12.3 数据模型：空数组即标记

- **待补全判据 = `definitions.length === 0`**，不新增列 / 字段；暂存卡的 `definitions` / `examples` 落空数组，`phonetic` / `extra` / `exam_freq` 为 NULL，其余字段照常初始化（`mastery_level=0`、`interval_days=0`、`next_review_date=今天+1`、`first_learned_at=NULL`）。
- **备份天然兼容**：`vocabCards` 记录结构未变，`schemaVersion` 保持 1——旧备份可导入暂存卡，新备份可被旧版本导入。
- **LLM 生成契约不变**：`VocabContentSchema` 的 `definitions` / `examples` 仍 `min(1)`——空内容只可能来自「暂存」，不可能来自 LLM 输出（契约校验同时充当输出校验）。

### 12.4 契约变更

- `CreateVocabCardSchema`：`content` 由必填改为**可选**；缺省即暂存卡。
- `UpdateVocabCardSchema`：由「`masteryLevel` / `reset` 二选一」改为「`masteryLevel` / `reset` / `content` **三选一**」（refine 保证互斥）；`content` 分支只写 `phonetic` / `definitions` / `examples` / `extra` / `exam_freq`，SRS 字段（`mastery_level` / `interval_days` / `next_review_date` / `is_mastered` / `last_reviewed_at`）一律不动——补内容不是复习。
- **队列规则**：`buildReviewQueue` 过滤 `definitions.length > 0`，待补全卡既不进新词区也不进到期队列；补全后 `first_learned_at` 仍为 NULL → 走新词首学。

### 12.5 测试连接

配置面板新增「测试连接」：以当前输入值（未保存也可）POST 一条最小对话（`max_tokens=64`），**HTTP 2xx 即成功**（不校验响应内容——思考模型可能只返回思维链，`content` 为空），15 秒超时；错误分类与查词共用同一请求层（`LlmError` 各 kind）。成功显示「连接正常」，失败显示分类原因；关闭弹窗即中止在途请求。

## 13. 提示词管理（2026-09-30 增补）

> 本节为实施期增补，**覆盖** §3.3 中「提示词全文固定」的描述；其余 LLM 集成行为（调用路径、容错链、查重流程）不变。

### 13.1 可自定义边界（红线）

- **契约骨架固定、不可自定义**：JSON 结构与字段类型说明（`phonetic` / `definitions[]` / `examples[]` / `extra` / `examFreq` 及各自的取值说明）、「只输出 JSON、不要围栏」的格式要求、`definitions` 1-10 条与 `examples` 1-10 条的数量要求、转义要求——以上一律不可编辑，由代码持有。
- **用户唯一可自定义的**：**`extra`（富文本/拓展内容）部分的要求描述**。默认值 = 现行文案「词根词缀拆解、2-4 组高频易混词辨析、一句话记忆法」；用户可改写为自己想要的（如「只讲词根词缀，不要辨析」「加入词频统计与真题出处」等）。

### 13.2 提示词构建

- `buildVocabSystemPrompt(extraRequirement?: string | null): string`：固定骨架 + 末尾拼接 `extra 部分的要求：{extraRequirement || 默认}`；`VOCAB_SYSTEM_PROMPT` 保留为默认预设的构建结果（向后兼容导出）。
- 契约 JSON 示例中 `extra` 的描述改为中性的「Markdown 字符串，没有可靠内容给 null」，具体内容要求全部移到用户的「extra 部分的要求」段——保证自定义只影响内容取向，不影响契约结构。

### 13.3 预设管理与存储

- 存储：localStorage `kaoyandaily-vocab-prompt-presets`，结构 `{ presets: VocabPromptPreset[], activeId: string | null }`；`VocabPromptPreset = { id: uuid, name: string, extraRequirement: string }`。
- **设备级、不进备份、不上传服务器**（与 LLM 连接配置同语义；ADR-0008 关联）。
- 管理入口：LLM 配置弹窗内新增「提示词」区——预设列表（选中态=当前生效）、新建（命名+填入 extra 要求）、编辑（改名/改内容）、删除（生效中的删除后回落默认，需确认）、「使用默认」项常驻列表首位；`activeId` 为 null 或指向不存在的预设时回落默认。
- 生效范围：`lookupWord` 内部解析激活预设（读取失败回落默认），**签名不变**；单查、批量查词、批量/单卡补全一律自动使用当前预设。

## 14. 批量查词（2026-09-30 增补）

> 本节为实施期增补，扩展 §3.4 的查询流程；单查行为不变。

### 14.1 输入与解析

- 查询弹窗输入框改为 textarea（2 行起）：可输入单个词（仍走现有「预览 → 加入」单查流程），也可一次粘贴多个词。
- `parseWordList(raw, max)` 纯函数：按 `[\s,;，；]+` 切分 → 逐项 `normalizeWord` → 丢弃空项与超长（>100）项 → 保序去重 → 超过上限 `VOCAB_BATCH_MAX`（=20）截断并返回截断数。
- 解析结果 **1 个词 → 单查流程**（不变）；**≥2 个词 → 批量流程**。

### 14.2 批量流程（生成即入库）

- **串行**逐词执行（尊重服务商限流、思考模型单次较慢）：词库已有该词 → 标记「已存在」跳过（不调 LLM）；否则 `lookupWord` → 成功后 `vocabApi.create({word, content})` 立即入库；**LLM 失败（任何 `LlmError`）→ 自动 `vocabApi.create({word})` 暂存**（复用 §12，标记「已暂存」）；暂存也失败 → 标记「失败」附原因。
- `not_configured`：整批中止并引导打开配置弹窗。
- 进度：逐词状态行（排队中 / 生成中 / 已加入 / 已存在 / 已暂存 / 失败 / 已取消），进行中显示 `生成中 x/y` 与「取消」按钮（AbortController；取消时未处理项标记「已取消」，已完成项保留）。
- 结束 Toast 汇总：成功 x · 已存在 y · 已暂存 z · 失败 w（有失败 error 级、取消 info 级）。
- 完成后词库列表增量刷新（`onCreated` 逐卡回调，父子协议不变）。

### 14.3 上限与常量

- `VOCAB_BATCH_MAX = 20` 进 `shared/src/constants.ts`（与 `VOCAB_*` 同处）；超限截断并在输入区提示「最多一次 20 个词，已截取前 20 个」。
