# 设计文档：数据导入（P2：服务器模式导入）

- 日期：2026-08-16
- 分支：`feat/import`
- 规模：中量偏重（服务端双端点 + 写入算法 + 安全 + 前端双入口 UI）
- 所属大需求：学习数据导出/导入 + 本地模式（P1 导出已完成；P3 本地模式本 spec 不覆盖）

## 背景与目标

P1 已交付 `GET /api/v1/export`（导出账号 + 全部业务数据为 `yantai-backup-*.json`）。P2 交付**导入**能力，使备份文件可恢复：

1. **未登录**：从备份文件导入 → 创建账号（复用文件 bcrypt 哈希，密码不变）+ 写入全部数据 + 自动登录
2. **已登录**：从备份文件导入到当前账号——先**差异对比**，用户选择**覆盖**或**合并**

## 术语表（定稿）

| 术语 | 含义 |
|------|------|
| 导出文件（Backup File） | `yantai-backup-*.json`（P1 格式，`schemaVersion: 1`） |
| 导入（Import） | 从导出文件恢复账号与数据 |
| 覆盖（Overwrite） | 清空目标账号 8 张业务表后重灌文件数据 |
| 合并（Merge） | 先删后插：目标账号内冲突条目被文件替换、文件独有条目插入、目标独有条目保留 |
| 差异摘要（Diff Summary） | 按资源统计的「新增 / 更新 / 保留」计数 |
| upsert | ~~`INSERT ... ON DUPLICATE KEY UPDATE`~~（2026-08-16 修订：弃用，改先删后插，防跨账号 id 串号） |

## 范围

### 包含

- 服务端 `POST /api/v1/import/preview`（差异对比，无副作用）+ `POST /api/v1/import`（执行）
- 前端：登录页「从备份文件导入」入口；ProfileDropdown「导入数据」菜单项；导入确认 Modal（差异摘要 + 覆盖/合并选择）
- `shared/src/schemas/import.ts`：ImportMode / DiffSummary 类型定稿
- 导入字段白名单严格映射（camelCase → snake_case，严格类型归一化）
- 单测：映射函数、差异计算、账号判定；curl 集成手测

### 边界外（明确不做）

- P3 本地模式（IndexedDB）
- `schemaVersion > 1` 的迁移导入（明确拒绝并报错）
- 预览与执行之间的数据变化处理（单机场景，忽略）
- 导入后统计/森林重算（统计实时查库，无需重算）
- multipart 上传（统一 JSON body）

## 服务端设计

### 挂载与中间件

- `server/src/index.ts`：全局 `express.json({ limit: '20mb' })`（默认 100KB 不够装备份文件；个人应用可接受）
- `app.use('/api/v1/import', importRouter)`——**不挂 requireAuth**（未登录也要能导入），登录态由路由内部读取 `req.session.userId` 自行分支
- 限流：`rateLimit`（1 小时 5 次 / IP），作用于 preview 与 import 两个端点（防批量建号/滥用），错误形状对齐 AppError（`RATE_LIMITED`）

### 请求/响应形状

```jsonc
// POST /api/v1/import/preview
// body: BackupFile（P1 的 BackupFileSchema 校验）
// 200:
{
  "accountEmail": "user@example.com",
  "modeOptions": ["overwrite", "merge"],   // 已登录时为两个选项；未登录时仅 ["merge"]（无现有数据，overwrite 与 merge 等价，统一返回 merge 语义的摘要）
  "diff": {
    "presets":       { "added": 3, "updated": 0, "kept": 5 },
    "tasks":         { "added": 120, "updated": 0, "kept": 40 },
    "reviews":       { "added": 30, "updated": 2, "kept": 10 },
    "courses":       { "added": 4, "updated": 0, "kept": 2 },
    "episodes":      { "added": 60, "updated": 0, "kept": 10 },
    "focusSessions": { "added": 200, "updated": 0, "kept": 50 },
    "studyRecords":  { "added": 300, "updated": 0, "kept": 80 },
    "settings":      { "added": 1, "updated": 0, "kept": 0 }
  },
  "existingAccount": false   // 文件邮箱是否已被占用（未登录场景关键信息）
}

// POST /api/v1/import
// body: { ...BackupFile, mode: "overwrite" | "merge" }   // 未登录时 mode 可省略（强制 merge 语义）
// 200: { "id": "uuid", "email": "user@example.com" }      // 未登录导入时自动登录，返回新账号
// 409 EMAIL_TAKEN：未登录且邮箱已占用 → 「该邮箱已注册，请登录后导入」
// 409 EMAIL_MISMATCH：已登录且文件邮箱与当前账号不一致 → 「备份文件属于其他账号」
```

### 账号判定逻辑（两个端点共用）

1. `fileEmail = payload.account.email.trim().toLowerCase()`
2. 查 `users WHERE email = ?`（fileEmail）：
   - **未登录**（`req.session.userId` 为空）：
     - 邮箱未占用 → 建号路径：`INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`（id 新生成 UUID；password_hash = 文件哈希，**必须先通过哈希格式校验**；created_at 用文件值还原；新账号 id 作为目标 userId）
     - 邮箱已占用 → preview 返回 `existingAccount: true`；import 抛 409 `EMAIL_TAKEN`
   - **已登录**：
     - 查当前用户邮箱 → 与 fileEmail 不一致 → 抛 409 `EMAIL_MISMATCH`；一致 → 目标 userId = 当前会话 userId
3. 哈希格式校验：`/^\$(2a|2b|2y)\$10\$[./A-Za-z0-9]{53}$/`（bcrypt 60 字符，cost 10 与项目一致；不匹配 → 400 `VALIDATION_ERROR`，明细指向 account.passwordHash）

### 差异计算（preview 核心）

**统计口径（Grilling 定稿）**——按每表的**冲突键集合**对比：

| 表 | 冲突键 |
|---|---|
| study_presets / daily_tasks / online_courses / course_episodes / focus_sessions / study_records | `id`（主键） |
| daily_reviews | `id` 或 `review_date`（唯一键 `(user_id, review_date)`；同一 review_date 即冲突） |
| user_settings | `setting_key`（联合主键 `(user_id, setting_key)`） |

算法（目标 userId 已定）：
1. 对每表：`SELECT <冲突键> FROM <表> WHERE user_id = ?` → 现有键集合
2. 文件条目提取冲突键集合
3. `added = 文件键 - 现有键`；`updated = 文件键 ∩ 现有键`；`kept = 现有键 - 文件键`
4. 汇总为 DiffSummary 返回

未登录且邮箱未占用：现有键集合为空 → 全部为 added（`modeOptions: ["merge"]`，语义等价导入新账号）。

### 执行导入（import 核心）

**目标 userId 与模式解析**（与 preview 同一判定逻辑）：
- 未登录：mode 强制为 merge 语义（目标为空，等价全量插入）
- 已登录：`mode` 必须显式传入且 ∈ {overwrite, merge}（validate 保证）

**单事务（withTransaction）**，按固定顺序执行：

1. **overwrite**：`DELETE FROM <8 表> WHERE user_id = ?`（顺序：episodes → courses → focus_sessions/study_records/tasks/reviews/presets/settings 任意，先删引用方后删被引用方：episodes(course_id) → courses；其余无交叉外键；统一按 episodes → courses → focus_sessions → study_records → tasks → reviews → presets → settings）
2. **写入（先删后插；2026-08-16 修订，弃用 ON DUPLICATE KEY UPDATE——ODKU 在文件 id 与库中其他账号行撞主键时会静默更新他人行导致数据串号）**：
   - **merge**：先按每表冲突键清理目标账号内冲突行——普通表 `DELETE FROM t WHERE user_id = ? AND id IN (文件 id 集合)`；`daily_reviews` 额外按 `review_date IN` 清理；`user_settings` 按 `setting_key IN` 清理——再**纯 `INSERT`** 文件行
   - **overwrite**：步骤 1 已清空目标账号 → 直接**纯 `INSERT`** 文件行
   - 插入值：`user_id = 目标 userId`；其余列 = 文件条目白名单映射结果（见下）；`created_at`/`updated_at` 用文件值还原
   - 若文件 id 与**目标账号之外**的既有行撞全局主键（先删后插无法避免）：捕获 `ER_DUP_ENTRY` → 409 `IMPORT_CONFLICT`（事务回滚，明确报错而非静默覆盖他人数据）
3. 未登录场景：同一事务内先建号（INSERT users），再写数据，最后 `req.session.userId = 新 id`（自动登录；无既有会话，无固定风险）

**字段白名单映射**（camelCase → snake_case，严格归一化，回应 P1 评审建议）：

- 每个资源定义**明确的映射表**（字段名 + 目标列 + 归一化器），未知字段**丢弃**（不写库）
- 归一化器（严格）：
  - `strRequired`：非空字符串，否则 400 VALIDATION_ERROR（明细字段路径）
  - `strNullable`：null 或字符串
  - `boolStrict`：仅接受 `true/false/1/0/'1'/'0'` → boolean；其余（含字符串 'yes'、对象）→ 400（解决 P1 遗留的 Boolean() 误判）
  - `intRequired`：整数（number 且 Number.isInteger）→ 否则 400
  - `intNullable`：null 或整数
  - `enumStrict(允许值[])`：字符串 ∈ 允许值（subject/subSubject/status/source 等）
- 映射失败整体 400，**事务回滚**，错误明细含字段路径（如 `data.tasks[3].isCompleted`）

### 错误码汇总

| 场景 | 状态码 + code |
|---|---|
| 文件结构非法（BackupFileSchema） | 400 VALIDATION_ERROR |
| 字段类型非法 / 哈希格式非法 / schemaVersion>1 | 400 VALIDATION_ERROR（明细定位） |
| 未登录且邮箱已占用 | 409 EMAIL_TAKEN |
| 已登录且邮箱不一致 | 409 EMAIL_MISMATCH |
| 限流 | 429 RATE_LIMITED |
| 事务失败 | 500 INTERNAL_ERROR（errorHandler 兜底） |

## 共享层设计

### 新增 `shared/src/schemas/import.ts`

```ts
import { z } from 'zod';

export const ImportModeSchema = z.enum(['overwrite', 'merge']);
export type ImportMode = z.infer<typeof ImportModeSchema>;

export const DiffItemSchema = z.object({ added: z.number().int().nonnegative(), updated: z.number().int().nonnegative(), kept: z.number().int().nonnegative() });

export const DiffSummarySchema = z.object({
  presets: DiffItemSchema, tasks: DiffItemSchema, reviews: DiffItemSchema,
  courses: DiffItemSchema, episodes: DiffItemSchema, focusSessions: DiffItemSchema,
  studyRecords: DiffItemSchema, settings: DiffItemSchema,
});
export type DiffSummary = z.infer<typeof DiffSummarySchema>;

export const ImportPreviewResponseSchema = z.object({
  accountEmail: z.string().email(),
  modeOptions: z.array(ImportModeSchema),
  diff: DiffSummarySchema,
  existingAccount: z.boolean(),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

export const ImportRequestSchema = BackupFileSchema.extend({ mode: ImportModeSchema.optional() });
export type ImportRequest = z.infer<typeof ImportRequestSchema>;
```

- `shared/src/types/index.ts` re-export 以上类型

## 前端设计

### `client/src/api/backup.ts` 扩展

```ts
export const backupApi = {
  exportData: () => api.download('/export', `yantai-backup-${today()}.json`),
  /** 差异对比（已登录/未登录均可用；返回摘要与邮箱占用状态） */
  previewImport: (file: BackupFile) => api.post<ImportPreviewResponse>('/import/preview', file),
  /** 执行导入；mode 已登录必填，未登录可省略 */
  importData: (file: BackupFile, mode?: ImportMode) =>
    api.post<{ id: string; email: string }>('/import', mode ? { ...file, mode } : file),
};
```

### 登录页（`client/src/pages/LoginPage.tsx` + AuthPage.css）

- 卡片底部（"还没有账号？免费注册" 下方）新增「从备份文件导入」按钮（次要样式）
- 点击 → 隐藏的 `<input type="file" accept=".json,application/json">` → FileReader 读取 → `JSON.parse` + 本地形状检查 → `backupApi.previewImport(file)`
  - `existingAccount: true` → 提示「该邮箱已注册，请登录后从账户菜单导入」，引导登录
  - 否则展示确认信息（账号邮箱 + 各资源新增数摘要）→ 确认 → `importData(file)`（不带 mode）→ 成功 `applyAuthUser({id, email})` + 跳 `#/` + toast「导入成功」
- 文件解析失败 / 校验失败 → toast 错误（沿用 ApiError 展示）

### ProfileDropdown（`client/src/components/ui/ProfileDropdown.tsx`）

- 菜单项新增「导入数据」（`Upload` 图标，位于「导出数据」之后）
- 点击 → 同样文件选择 → `previewImport(file)` → 打开**导入确认 Modal**：
  - 展示：文件账号邮箱 + 差异摘要（8 资源 × 新增/更新/保留，紧凑表格或行内列表）
  - 两个操作按钮：「合并」（merge）与「覆盖」（overwrite，危险样式）→ 二次确认「覆盖将清空当前全部数据，建议先导出备份」（ConfirmDialog 复用）
  - 确认后 `importData(file, mode)` → toast「导入完成」/ 错误展示
- 401/409 错误按 ApiError 文案展示（409 EMAIL_MISMATCH 直接显示后端 message）

### 组件复用

- Modal / Button / ConfirmDialog / EmptyState 既有组件复用；不新增依赖
- 样式全走 `var(--color-xxx)` tokens；动效 framer-motion + reduced-motion 门控

## 测试策略

1. **Vitest 单测**（server）：
   - 字段白名单映射：每资源映射正确性、未知字段丢弃、严格归一化拒绝（boolStrict 拒绝 'yes'、intRequired 拒绝小数/字符串数字等）、错误明细字段路径
   - 差异计算纯函数：added/updated/kept 口径（含 reviews 按 review_date、settings 按 key 的用例）
   - 账号判定纯函数：未登录未占用 → 建号目标；未登录已占用 → EMAIL_TAKEN；已登录一致/不一致
2. **集成手测（curl）**：
   - 导出 → 新账号导入 → 登录新账号 → 导出对比（数据一致，仅 user_id 不同）
   - 已登录导入：preview 摘要正确 → merge 后目标独有数据保留、文件数据并入、冲突更新 → overwrite 后仅剩文件数据
   - 409 EMAIL_TAKEN / EMAIL_MISMATCH / 400 非法哈希 / schemaVersion 2 拒绝 / 429 限流
3. **前端手测**：登录页导入全流程（未登录）、ProfileDropdown 导入（已登录，覆盖/合并两分支）、明暗主题
4. `npm run lint`（无新增问题）、`npm run build`、`npx vitest run` 全绿

## 风险与权衡（ADR 摘要）

| 决策 | 理由 | 权衡 |
|---|---|---|
| 独立 preview 端点 | 对比无副作用、可独立限流 | 多一个端点 |
| 先删后插（2026-08-16 修订，弃 ODKU） | 目标账号内冲突可被文件替换、重复导入幂等；杜绝跨账号 id 串号 | 跨账号全局撞 id 报 409 需用户处理 |
| 白名单严格映射 | 只写已知可信字段；解决 P1 bool 归一化遗留 | 映射表需要维护 |
| 全局 20MB body limit | 备份文件可达 MB 级 | 所有接口 body 上限变大（个人应用可接受） |
| 导入复用文件哈希建号 | 密码不变、无需用户重新输入 | 文件泄露时弱密码可离线爆破（P1 已拍板明文） |
| 限流 1h 5 次/IP | 防批量建号 | 频繁导入会受限（可等待） |

## 验收标准

1. curl：未登录导入 → 201 语义（200 + 新账号 id/email + 会话生效）；重复导入同邮箱 → 409 EMAIL_TAKEN
2. 已登录：preview 返回正确差异摘要；merge 后目标独有保留/文件并入/冲突以文件为准；overwrite 后仅文件数据
3. 导入文件与原环境导出对比（导出→导入→再导出）：业务数据一致（user_id 归入新账号）
4. 边界：schemaVersion 2 → 400；非法哈希 → 400；EMAIL_MISMATCH → 409；429 限流生效
5. 前端：登录页导入流程（未登录自动登录进入应用）；ProfileDropdown 导入 Modal（差异展示 + 覆盖/合并）；明暗主题正常
6. lint / build / vitest 全绿
