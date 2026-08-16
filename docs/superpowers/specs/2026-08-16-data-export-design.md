# 设计文档：数据导出（P1：Profile 下拉 + 服务器模式导出）

- 日期：2026-08-16
- 分支：`feat/profile-dropdown-export`
- 规模：中量（服务端新路由 + 共享格式定稿 + 前端新组件 + TopNav 改造）
- 所属大需求：学习数据导出/导入 + 本地模式（P2 = 导入，P3 = 本地模式，本 spec 不覆盖）

## 背景与目标

当前系统没有任何用户数据导出/备份能力（唯一"导入"是网课内容导入，与数据迁移无关）。
本阶段目标：

1. 顶栏右侧新增 **Profile 下拉**（替换现有登出按钮），提供「导出数据」与「登出」入口；
2. 提供 **`GET /api/v1/export`**，把当前登录账号的全部业务数据（含账号信息）导出为单个 JSON 文件，供本地用户备份与后续迁移（P2/P3）使用。

导出文件格式在本阶段定稿（`schemaVersion: 1`），是 P2 导入与 P3 本地模式的共用地基。

## 术语表（定稿）

| 术语 | 含义 |
|------|------|
| 导出（Export） | 把账号 + 全部业务数据序列化为导出文件 |
| 导出文件（Backup File） | `yantai-backup-*.json`，格式见下节 |
| 导入（Import） | 从导出文件恢复账号与数据（P2） |
| 覆盖（Overwrite） | 导入冲突时的处理策略：提示后以文件内容替换（P2） |
| 本地模式（Local Mode） | 数据存于浏览器 IndexedDB 的模式（P3，本 spec 边界外） |
| 本地账户（Local Account） | 本地模式下的账户（P3，本 spec 边界外） |

## 范围

### 本阶段（P1）包含

- `GET /api/v1/export` 服务端接口（requireAuth）
- `shared/src/schemas/backup.ts`：导出文件格式定稿（schema + 类型），P2/P3 复用
- 前端 `ProfileDropdown` 组件（新建，零侵入现有 `Dropdown.tsx`）
- `TopNav` 右区改造：`ThemeToggle + ProfileDropdown`，移除登出按钮
- `client/src/api/client.ts` 增加 `api.download()`；新增 `client/src/api/backup.ts`
- 导出 payload 组装纯函数的 Vitest 单测（服务端首个单测）

### 边界外（明确不做）

- 导入（P2）、本地模式（P3）——本 spec 只保证其可复用导出格式
- 导出文件加密（用户已拍板：明文）
- 本地账户密码（用户已拍板：选择即进入）
- 修改现有 `Dropdown.tsx`；新增任何 npm 依赖
- 分资源导出、流式/分片导出（体积假设成立时不必要）

## 导出文件格式（schemaVersion 1）

文件名为 `yantai-backup-YYYY-MM-DD.json`（日期 = 导出当天本地日期，前端命名）。

```json
{
  "format": "kaoyandaily-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-08-16T08:00:00.000Z",
  "account": {
    "email": "user@example.com",
    "passwordHash": "$2b$10$...",
    "createdAt": "2026-07-20T05:00:00.000Z"
  },
  "data": {
    "presets":        [{ "id": "uuid", "name": "数学 25min", "subject": "math", "subSubject": null, "durationMinutes": 25, "lastUsedAt": null, "createdAt": "...", "updatedAt": "..." }],
    "tasks":          [{ "id": "uuid", "taskDate": "2026-08-16", "content": "...", "subject": "math", "subSubject": null, "isCompleted": false, "isImportant": false, "sortOrder": 0, "createdAt": "...", "updatedAt": "..." }],
    "reviews":        [{ "id": "uuid", "reviewDate": "2026-08-16", "content": "...", "createdAt": "...", "updatedAt": "..." }],
    "courses":        [{ "id": "uuid", "name": "...", "subject": "math", "subSubject": null, "createdAt": "...", "updatedAt": "..." }],
    "episodes":       [{ "id": "uuid", "courseId": "uuid", "title": "...", "durationSeconds": 1200, "durationText": "20:00", "sortOrder": 0, "isCompleted": false, "completedAt": null, "createdAt": "...", "updatedAt": "..." }],
    "focusSessions":  [{ "id": "uuid", "presetId": "uuid|null", "presetNameSnapshot": "...", "subjectSnapshot": "math", "subSubjectSnapshot": null, "plannedDurationSeconds": 1500, "actualDurationSeconds": 1500, "startedAt": "...", "plannedEndAt": "...", "completedAt": null, "status": "completed", "source": "pomodoro", "courseEpisodeId": null, "taskId": null, "createdAt": "...", "updatedAt": "..." }],
    "studyRecords":   [{ "id": "uuid", "presetNameSnapshot": "...", "subjectSnapshot": "math", "subSubjectSnapshot": null, "actualDurationSeconds": 1500, "focusSessionId": null, "taskId": null, "courseEpisodeId": null, "courseNameSnapshot": null, "episodeTitleSnapshot": null, "source": "focus_session", "notes": null, "createdAt": "...", "updatedAt": "..." }],
    "settings":       [{ "key": "pomodoro_sound_enabled", "value": "1" }]
  }
}
```

### 格式规则（定稿，Grilling 产出）

1. **字段命名全部 camelCase**，与前端 API 模型完全一致（服务端导出时把 DB snake_case 映射为 camelCase；P3 本地模式可直接消费；P2 导入时再映射回 snake_case 写库）。
2. **保留所有原业务 UUID `id`**：`focusSessions.taskId`、`focusSessions.courseEpisodeId`、`episodes.courseId` 等引用依赖原 id，重生成会导致引用断裂。UUID v4 跨环境冲突概率可忽略（若 P2 实测撞 id，届时再引入 id 重映射）。
3. **`user_id` 一律不导出**：所有业务数据导入时归入目标账户；`account` 不导出用户 `id`（导入到服务器时挂到目标账号或新建账号）。
4. **快照语义**：`studyRecords` 等快照字段原样导出（悬空引用与源环境一致，不做校验修复）。
5. **时间字段**：`exportedAt` 为 ISO 8601 UTC；业务时间字段保持 DB 原值（DATETIME 字符串）。
6. `settings` 为键值对数组（`user_settings` 表形态），不含 `user_id`。
7. 空数据导出的数组为 `[]`，结构键必须齐全。

## 服务端设计

### 新增 `server/src/routes/export.ts`

- `GET /`（挂载 `/api/v1/export`，`requireAuth` 在 `index.ts` 挂载层强制）
- 流程：
  1. 用 `withTransaction` 包一层**只读事务**（MySQL REPEATABLE READ 可重复读快照），事务内按固定顺序查询：
     - `users`：`id, email, password_hash, created_at`（当前 `req.userId`）
     - `study_presets` / `daily_tasks` / `daily_reviews` / `online_courses` / `course_episodes` / `focus_sessions` / `study_records` / `user_settings`（均 `WHERE user_id = ?`）
     - 各表查询结果按固定顺序 `ORDER BY created_at, id`（保证导出文件内容确定性，便于 diff 对比）
  2. 组装为 `buildBackupPayload(account, data)` 纯函数输出（见下）
  3. 响应头：`Content-Disposition: attachment; filename="yantai-backup-YYYY-MM-DD.json"`、`Cache-Control: no-store`、`Content-Type: application/json; charset=utf-8`
- 错误：事务内任一步失败 → 回滚 + `AppError(500, 'EXPORT_FAILED', ...)`（errorHandler 兜底）

### `buildBackupPayload` 纯函数（可单测）

- 输入：`{ email, passwordHash, createdAt }` + 8 个资源行数组（raw DB rows）
- 输出：`BackupFile`（类型来自 `shared/src/schemas/backup.ts`）
- 职责：snake_case → camelCase 字段映射（映射规则与各路由现有 `transformXxx` 一致，**在 export.ts 内部实现映射**，不改动既有路由文件）；拼装 `format/schemaVersion/exportedAt`
- 日期函数复用 `server/src/utils/date.ts`

### `server/src/index.ts`

- import + `app.use('/api/v1/export', requireAuth, exportRouter)`（与既有路由并列，保持挂载层统一鉴权风格）

## 共享层设计

### 新增 `shared/src/schemas/backup.ts`

- `BackupFileSchema`：`z.object` 描述上节完整结构
  - `format: z.literal('kaoyandaily-backup')`
  - `schemaVersion: z.literal(1)`
  - `exportedAt: z.string().datetime()`（ISO 8601）
  - `account: { email, passwordHash, createdAt }`
  - `data: { presets/tasks/reviews/courses/episodes/focusSessions/studyRecords: z.array(...), settings: z.array({key, value}) }`
- 各资源条目 schema 与既有 `CreateXxxSchema` 的字段命名对齐（camelCase）；类型可推导（部分字段用宽松类型：`z.any()` 或精确对象？——**精确对象 + 宽松标量**（string/number/boolean/null）即可，避免与业务 schema 强耦合，P2 导入校验时再收紧）
- 导出类型：`BackupFile`、`BackupAccount`、各资源条目类型
- `shared/src/types/index.ts` 增加 re-export

## 前端设计

### `client/src/api/client.ts`：新增 `api.download(path)`

- `fetch(path, { credentials: 'include' })` → `res.ok` 检查 → `await res.blob()` → `URL.createObjectURL` → 创建临时 `<a download>` 触发点击 → 移除节点 + `URL.revokeObjectURL`
- 非 2xx：尝试解析 `{ error: { code, message, details } }` 抛 `ApiError`（与 `request()` 一致；401 触发全局登出回调——**download 也必须调用 `unauthorizedHandler`**，复用同一判断逻辑，抽公共错误处理小函数或内联复制，实施时以最小重复为原则）
- 文件名由调用方传入（`yantai-backup-2026-08-16.json`），不解析服务端 header

### 新增 `client/src/api/backup.ts`

```ts
export const backupApi = {
  exportData: () => api.download(`/export`, `yantai-backup-${today()}.json`),
};
```

- P3 时此函数切换为本地实现（从 IndexedDB 组装同格式文件），`ProfileDropdown` 组件不变

### 新增 `client/src/components/ui/ProfileDropdown.tsx` + `ProfileDropdown.css`

- **Trigger**：渐变头像圈（邮箱首字母大写，渐变用 tokens 的 accent 色组，禁硬编码色值）+ 邮箱文本（`max-width` + `text-overflow: ellipsis`，窄屏收缩）；`type="button"`、`aria-haspopup="menu"`、`aria-expanded`
- **菜单**（`role="menu"`，`min-width: 220px`，右对齐）：
  1. 账户信息区（头像圈 + email，只读展示）
  2. 分隔线
  3. 菜单项「导出数据」（`Download` 图标；点击 → loading 态 + 防重复 → `backupApi.exportData()` → toast「已导出」/「导出失败」）
  4. 分隔线
  5. 菜单项「登出」（`LogOut` 图标，danger 红色样式；复用 `logoutAuth` + toast「已退出登录」，逻辑从 TopNav 迁移）
- **交互**：点击外部 / Escape 关闭（模式同现有 `Dropdown.tsx`）；`AnimatePresence` 淡入 + 轻微位移，`useReducedMotion` 门控
- 菜单项定义为数组（`{ key, label, icon, danger?, action }`），为「其他功能再讨论」留扩展位
- 数据源：`useAuth()` 的 `user.email`（无头像/名字字段，`AuthUser` 不变）

### `client/src/components/layout/TopNav.tsx` + `TopNav.css`

- 右区：`<ThemeToggle />` 后替换为 `<ProfileDropdown />`；删除登出按钮、`LogOut` import、`handleLogout`/`loggingOut`（迁入 ProfileDropdown）
- `TopNav.css`：移除 `.top-nav__logout` 相关规则
- `App.tsx` 不动（ProfileDropdown 自取 `useAuth`）

## 错误处理

| 场景 | 行为 |
|------|------|
| 未登录调用导出 | 401 → 全局登出回调（复用现有机制） |
| 导出期间会话失效 | 同上 |
| 服务端失败 / 网络错误 | toast「导出失败」 |
| 导出中重复点击 | 按钮 loading + disabled 防抖 |

## 测试策略

1. **Vitest 单测**（新增 `server/src/routes/export.test.ts`；根 `vitest.config.ts` 的 `include: ['**/*.test.ts']` + `environment: 'node'` 已覆盖 server 目录，无需调整）：
   - `buildBackupPayload`：字段映射正确（snake_case → camelCase）、空数据数组、`format/schemaVersion` 字面量、`exportedAt` 格式
2. **lint + tsc**：`npm run lint`、`npm run build`
3. **手测清单**：
   - `curl -i` 导出：200、`Content-Disposition` 文件名、`no-store`、JSON 结构含 8 资源 + account
   - UI：顶栏显示 ProfileDropdown（明/暗主题）；菜单开合（Escape / 外部点击）；导出下载文件可打开且结构符合 spec；登出回到介绍页
   - reduced-motion 下无动效
4. 不新增 e2e（导出需真实会话，现有 smoke 覆盖未登录路径，手测足够）

## 风险与权衡（ADR 摘要）

| 决策 | 理由 | 权衡 |
|------|------|------|
| GET 下载流（非 POST body） | 只读幂等操作，URL 无敏感参数 | 无 |
| 独立 ProfileDropdown（非改现有 Dropdown） | 现有组件是 listbox 选择器语义，菜单需 menu 语义；零侵入 | 新增一个组件文件 |
| 导出字段 camelCase | 与前端 API 模型一致，P3 直接消费 | P2 导入时需反向映射 |
| 保留原 UUID | 引用完整性（taskId/courseEpisodeId/courseId） | 撞 id 概率可忽略，P2 若实测冲突再引入重映射 |
| 导出走只读事务快照 | 跨表一致性，避免导出中数据变更产生混合快照 | 导出期间持读锁（单用户无感知） |
| 明文导出 | 用户已拍板；个人文件自行保管 | 密码哈希泄露可离线爆破弱密码 |

## 验收标准

1. `curl -i -b <session>` 导出返回 200，响应头含 attachment 文件名与 `no-store`，JSON 结构符合本 spec 格式（`schemaVersion: 1`，8 资源 + account，camelCase，无 `user_id`）
2. 顶栏右区为 `ThemeToggle + ProfileDropdown`；菜单含账户信息 / 导出数据 / 登出；明暗主题、reduced-motion、Escape/外部点击关闭均正常
3. 点击导出数据：下载 `yantai-backup-YYYY-MM-DD.json`，内容与服务器数据一致（抽查几条）
4. 登出仍正常回到介绍页
5. `npm run lint`、`npm run build`、单测全过
