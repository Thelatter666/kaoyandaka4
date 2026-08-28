# Project Instructions — 砚台考研打卡

> 面向 AI 代理的**驾驶手册**：只记录「读代码读不出来的」决策、陷阱、红线与工作流。
> 枚举型参考（目录树/组件/端点/部署）见 `ARCHITECTURE.md`；领域术语见 `CONTEXT.md`；仓库根其余历史 md（`项目设计文档.md`、`需求文档.md`、`前端重设计文档.md`、`前端实施建议.md`、`组件集成报告-*.md`、`2026-07-22-性能优化方案-第一版.md`）仅供参考，可能与现状不符。
> **维护规则**：任何改动本文列举的事实（路由数、模块数、端点、目录结构、开关函数、文档清单）必须同步本文件；提交前缀 `docs(agent):`。

## 一句话

个人考研学习管理网站（React SPA + Express API + MySQL），目标用户 1 人，考试日期 2026-12-20。

## 文档地图（做 X 先读 Y）

| 我要做什么 | 先读 |
|---|---|
| 加一个页面 | 本文「Front-end Routing」+ `client/src/App.tsx:13-55` |
| 加一个 API | 本文「Request Lifecycle」+ `server/src/routes/` + `shared/src/schemas/` |
| 改动效 | `CONTEXT.md`（术语）→ `plans/README.md`（是否已排期，当前 18 条：DONE 12 / TODO 6）→ `docs/adr/`（砚池决策） |
| 动导入/导出 | `docs/superpowers/specs/2026-08-16-data-{export,import}-design.md` + `server/src/routes/import.ts` |
| 动本地模式 | `交接文档/03-P3本地模式交接.md` + `client/src/local/` |
| 动砚池计时器 | `CONTEXT.md` + `docs/adr/0001`–`0004` + `交接文档/05-砚池计时器实施交接.md` |
| 部署/服务器 | `deploy/nginx.conf` + `.claude/skills/manage-server/` |
| 查当前测试/lint 状态 | 跑 `npx vitest run` / `npx eslint .`（勿依赖本文快照） |

## 命令（根目录执行）

| 命令 | 说明 |
|---|---|
| `npm run dev` | 前后端同启（client 5173 / server 3001，vite proxy /api） |
| `npm run dev:client` / `npm run dev:server` | 单独起前端 / 后端（tsx watch） |
| `npm run build` | 生产构建（vite + tsc） |
| `npm run lint` | ESLint 9 flat config |
| `npm run test` | Vitest（`**/*.test.ts(x)`，环境为 **node**） |
| `npm run test:e2e` | Playwright 冒烟（需 dev server，真实会话） |
| `npm run db:init` / `npm run db:migrate` | 初始化/重置 / 迁移数据库 |

## 服务端总装（`server/src/index.ts`）

- **鉴权在挂载层统一施加**：`app.use('/api/v1/xxx', requireAuth, router)` — 集中一处可审计、无遗漏风险；仅 `/api/v1/auth` 与 `/api/v1/health` 公开
- **⚠️ 唯一例外：`/api/v1/import` 不经挂载层 `requireAuth`**（`index.ts:86`）。它必须在会话内自行解析 `req.session.userId`，并在「导入到指定账户」分支里改写会话归属（`req.session.userId = targetUserId`，仅 `kind==='create'` 时），故鉴权/归属判定下沉到 handler 内逐处做。**新增此类「会话重指向」端点前，先读 `routes/import.ts` 的 `sessionUserId` 用法，切勿顺手给它补挂载层 `requireAuth`**
- `app.set('trust proxy', 1)` — 只信任 nginx 首跳，使限流按真实客户端 IP、secure cookie 正确判定
- `compression({ threshold: 1024 })` gzip（统计/森林聚合接口收益最大）；`express.json({ limit: '20mb' })`（备份导入需要）
- 会话 7 天**固定不滚动续期**（`rolling: false`）：避免每请求 UPDATE sessions 表的写放大，到期重新登录
- `SESSION_SECRET` 缺失时**直接抛错拒绝启动**，不留弱默认值

## Request Lifecycle（每个路由的固定模式）

1. `requireAuth` middleware → session check → injects `req.userId`
2. `validate(Schema)` middleware → Zod parse on `req.body`
3. Route handler → raw SQL via `pool.query()`，所有查询按 `req.userId` 过滤
4. `transformXxx(row)` → snake_case DB 列转 camelCase 响应
5. Errors → `throw new AppError(status, code, message)` → 由 `errorHandler` 统一捕获

## Error Shape（全端点一致）

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

## Auth Model

- Session 存 MySQL（`sessions` 表，express-mysql-session 独立连接池）；401 触发前端全局登出（`unauthorizedHandler`）
- **限流**：`express-rate-limit` 在路由文件内就地声明 — `auth.ts` 的 `loginLimiter`/`registerLimiter`、`import.ts` 的 `importLimiter`；新增登录类或重写入端点须跟上

## Front-end Routing（`client/src/App.tsx`）

- Hash-based SPA（无 React Router）：`parseHashRoute()` 解析，`/courses/:id` → course-detail；`React.lazy()` 代码分割 + `NAV_PREFETCH` hover 预取；过渡 140ms 退场（`page-enter`/`page-exit`）
- **新增页面必须改的 4 个位点**：① `pageLoaders`（13-26）② `lazy()` const 声明（28-39，漏改则编译失败）③ `NAV_PREFETCH`（42-50，仅当进顶栏）④ 渲染分支 — 受保护页走 `switch`（219-240）、公开/游客页走未登录三元链（275-283）；公开页还需改 `PUBLIC_PAGES`/`GUEST_ONLY_PAGES`。**⚠️ `switch` 的 `default` 会静默渲染 HomePage（237-238），漏改不是白屏而是更难发现的静默首页**
- **路由守卫双白名单**：`PUBLIC_PAGES`（未登录可访问：`/`、`/login`、`/register`、`/local`）与 `GUEST_ONLY_PAGES`（已登录访问则重定向回 `#/`）。新增公开页只改前者，二者勿混用

## Data Isolation

- `user_id` NEVER accepted from client — always from `req.session.userId`
- 所有查询用 `WHERE user_id = ?` 模式；他人的资源返回 404（不枚举）

## 双后端数据模式（P3 本地模式）

- **服务器模式（默认）**：所有 `xxxApi` → REST → MySQL；**本地模式**：登录页「离线使用（本地模式）」→ `#/local` → 激活账户存 `localStorage['kaoyandaily_local_activeAccount']`
- **开关**：`client/src/local/mode.ts` — `isLocalMode()` / `isLocalApp()`（`isLocalApp = isLocalMode() || localContext`，语义更宽）。**7 个业务模块用 `isLocalMode()`**（tasks/presets/focus/courses/reviews/statistics/settings），**backup 用 `isLocalApp()`**，auth 无分支（本地模式无服务器会话，设计如此）
- **存储**：单 IndexedDB 库 `kaoyandaily_local`；记录带 `accountId` 索引（**本地归属用 accountId——UUID，绝不用服务器 user_id**）；settings 主键 `[accountId, key]`；reviews 复合索引 `accountId_reviewDate`
- **统计/导入复刻**：`localStatistics.ts` 前端复刻服务器 SQL 口径（`focus_session` 全计、`course_video` 仅计 focusSessionId 为空、树 = floor(秒/3600) 按科目独立）；`localImport.ts` 导入映射/去重/合并覆盖
- **同构格式**：导出 `BackupFile`（shared backup.ts，schemaVersion 1）双模式互通；服务器导入**先删后插**防跨账号 ID 串号（勿改回 ON DUPLICATE KEY UPDATE）
- **本地模式规则**：新增本地数据逻辑进 `client/src/local/`；本地归属用 accountId；本地模式单测文件头部须 `import 'fake-indexeddb/auto'`

## Key Conventions

- **Validation**：所有输入用 `shared/src/schemas/` 的 Zod schema，新路由 MUST 用 `validate()` 中间件
- **IDs**：UUID v4（DB `CHAR(36)`），服务器端 `generateUUID()` 生成
- **Dates**：日期字段用 `YYYY-MM-DD` 字符串；DB 存 `DATETIME`
- **204 响应**：DELETE 与部分 PATCH 返回 204 无 body → client 用 `undefined as T` 处理
- **COALESCE 更新**：PUT 用 `COALESCE(?, column)` 做部分更新 — 省略字段即保留原值
- **Toggle 模式**：`PATCH /:id/toggle` 用 `SET is_completed = NOT is_completed`
- **多表写入路由必须用 `withTransaction`**（`server/src/db/transaction.ts`；现 focus/courses/export/tasks/import 已用）

## Git Conventions

- **Branch naming**: `type/description`（如 `feat/xxx`、`docs/xxx`），从 `main` 新建
- **Commit style**: `<type>(<scope>): <中文描述>` — types: feat, fix, docs, refactor, chore
- Feature work 通常从 `main` 分支；合并用 `--no-ff`（保留 merge commit）

## CSS 与 Design Tokens（红线）

- Aurora Glass（极光玻璃）双主题；token 在 `client/src/styles/tokens.css` — **组件 MUST 用 `var(--color-xxx)`，禁硬编码颜色**；co-located `*.css`；主题切换 `[data-theme="dark"]` + `useTheme`
- **新动效必须支持 `prefers-reduced-motion`**（全库 34 文件已落地，参考 `plans/014-magnetic-reduced-motion.md`）
- 动效统一 framer-motion；新组件进 `components/ui/`；勿破坏 `client/vite.config.ts` 的 manualChunks vendor 分包

## Testing

- **单测/集成**：`npx vitest run`（匹配 `**/*.test.ts(x)`，与被测文件同目录共存）。基线：2026-08 为 **12 文件 / 112 tests 全绿**（以实跑为准）
- **环境为 `node` 而非 jsdom**：写不了依赖 DOM 的组件测试 → 需要浏览器行为时拆成纯函数（如 `inkSurface.ts`/`inkWavePaths.ts`/`sound.ts`）或把断言下沉到数据层
- **E2E**：`npm run test:e2e` 仅 `e2e/tests/smoke.spec.ts` 一个用例（真实会话认证）；`e2e/` 的工具脚本见 `ARCHITECTURE.md`，`playwright-report/`、`test-results/` 是产物目录
- **已知缺口**：全库**无全局 ErrorBoundary** — 页面靠各自 `ErrorState` + `App.tsx` 的 Suspense `pageFallback` 兜底，勿假设有全局兜底
- **lint 长期项**（2026-08）：`client/src/components/ui/Modal.tsx` 使用未加载的 `react-hooks/exhaustive-deps` 规则（1 error + 8 warnings），修 eslint 配置/依赖时一并处理

## 环境

- `.env` 在**项目根**（dotenv 从根加载，`index.ts` 里 `path.resolve(__dirname, '../../.env')`，不是 server/.env）
- 必需：`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`SESSION_SECRET`（缺失拒绝启动）；可选：`SERVER_PORT`(3001)、`SESSION_COOKIE_SECURE`(false 本地 HTTP / true 生产 HTTPS)
- **`TEST_DB_NAME` 是遗留项**：`.env.example` 中声明但全库无引用，勿据此以为存在测试库
- 部署/shared 导入/manualChunks 等详情见 `ARCHITECTURE.md`

## 项目级 AI 工具与约定

- **操作安全红线**（`memory.md` 事故教训，2026-07-28）：修改任何已有文件前**先 Read**；密钥/配置类文件操作前先 `cp file file.bak`；用户说「写到/放入/添加」一律视为**追加**，除非明确说「覆盖/替换」
- **服务器管理**：`.claude/skills/manage-server/` 项目 skill — 部署、日志、重启；配置在 `deploy/`
- **服务器管家**：`server-butler/` — 腾讯云实例状态/防火墙/带宽/快照，密钥从 `~/.tccli/env.sh` 注入
- **交接文档**：`交接文档/01-05`（03=P3 本地模式完整设计/踩坑/验收，05=砚池实施交接）；P1/P2 设计在 `docs/superpowers/specs|plans/2026-08-16-*`

## 开发工作流约束（2026-08-12 修订，硬性）

进行**任何代码修改**，必须按以下流程执行，每阶段需用户确认后才进入下一步：

1. **提需求** → 2. **探索理解** → 3. **复述对齐**（用户确认后才动手）→ 4. **新建分支**（从 `main`，如 `feat/xxx`、`docs/xxx`，禁止直接改 main）→ 5. **执行任务**（加载 `mywf` skill：brainstorm → grilling → spec → plan → 实现）→ 6. **效果确认**（只汇报效果，用户亲自检查）→ 7. **commit / merge 指令**（用户明确下令前，绝不 commit / merge / push）→ 8. **合并 main** → 9. **同步远端**（**github 与 gitee 双远端均需推送**：`git push github main` + `git push origin main`）→ 10. **同步服务器**（按 `manage-server` skill 部署）
