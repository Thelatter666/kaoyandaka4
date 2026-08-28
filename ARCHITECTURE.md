# Architecture — 砚台考研打卡（枚举型参考）

> 本文件承接 `AGENT.md` 中的**枚举型内容**（目录结构、组件清单、端点清单、部署配置），随代码结构变更同步维护。
> 决策与陷阱见根目录 `AGENT.md`；领域术语见 `CONTEXT.md`；动效计划总账见 `plans/README.md`。

## 技术栈

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 6 |
| Backend | Express 4 + TypeScript |
| Database | MySQL 8 (mysql2/promise) |
| Validation | Zod (shared schemas) |
| Auth | Session-based (express-session + MySQL store) |
| Testing | Vitest + Playwright + fake-indexeddb |
| Lint | ESLint 9 (flat config) |

## 目录结构

```
client/src/          → React SPA (hash-router, lazy-loaded pages)
  api/               → Per-resource API wrappers (auth, tasks, presets, focus, courses, reviews, statistics, settings, backup) + client.ts (统一 fetch + 401 全局登出；各方法内按 isLocalMode()/isLocalApp() 分支到本地)
  local/             → 本地模式数据层 (IndexedDB): db.ts, localStore.ts, mode.ts, storage.ts, accounts.ts, types.ts
  components/        → UI primitives + feature components (layout/, tasks/, timer/, courses/, presets/, forest/, heatmap/, review/, landing/, ui/)
  pages/             → Page components with co-located CSS (HomePage, PlanPage, PomodoroPage, ReviewPage, LoginPage/RegisterPage, LocalModePage, CourseDetailPage, CoursesPage, PresetsPage, StatisticsPage, AuthPage.css 遗留)
  hooks/             → useApi, useAuth, useCountdown, useFocusSession, useKeyboardSort, useScreenWakeLock, useTheme
  utils/             → date/duration/sound/accessibility + localStatistics + localImport + parseCourseText + uuid
  workers/           → countdown-title.ts (标签页标题倒计时), end-sound.ts (番茄钟准点响铃)
  styles/            → tokens.css, global.css, utilities.css

server/src/          → Express REST API
  routes/            → 11 个路由文件: auth, presets, tasks, reviews, focus, courses, statistics, settings, reviewLock, export, import（另有 export.test.ts 测试）
  middleware/        → cors, auth (requireAuth), validate (Zod), errorHandler (AppError)
  db/                → connection.ts (pool), transaction.ts (withTransaction), schema.sql, init.ts, migrate.ts, rollback-users.sql
  utils/             → date.ts, uuid.ts, backup.ts (导出组装), import.ts / import-mapping.ts (导入纯函数)
  types/             → express-mysql-session 类型扩展

shared/src/          → Shared between front-end and back-end
  constants.ts       → 共享常量（科目分组、专注时长档位、休息时长、暂停上限 FOCUS_PAUSE_MAX_SECONDS 等）
  schemas/           → Zod validation schemas per resource（auth/common/course/focus/preset/review/settings/statistics/task + backup 导出格式 v1 + import 导入模式/差异摘要）
  types/index.ts     → Re-exported TS types inferred from schemas

plans/               → 18 个动效实现计划（001-018，全部为动画/动效类）+ README.md 总账表（#/标题/严重度/模块/状态/依赖）
docs/                → adr/ (砚池 4 条) + superpowers/ (specs 8 / plans 7 / spikes 14 项)
交接文档/             → 01-进度与上下文 / 02-后续任务与子代理分阶段实施 / 03-P3本地模式交接 / 04-P3本地模式完成交接报告 / 05-砚池计时器实施交接
deploy/              → nginx.conf, nginx.ip.conf, deploy.sh, server-management-prompt.txt
e2e/                 → playwright.config.ts + tests/smoke.spec.ts + 工具脚本（见下）
```

## 客户端 API 模块与本地分支（2026-08-28 核对）

| 模块 | 本地开关函数 | 分支方法数 |
|---|---|---|
| tasks / presets / focus / courses / reviews / statistics / settings | `isLocalMode()` | 8 / 4 / 6 / 5 / 6 / 3 / 2 |
| backup | `isLocalApp()` | 3 |
| auth | 无分支（本地模式无服务器会话，设计如此） | 0 |

## 服务端端点清单

| 路由文件 | 端点 |
|---|---|
| auth | `POST /register`、`POST /login`、`GET /me`、`POST /logout`（限流：loginLimiter/registerLimiter） |
| presets | `GET /`、`POST /`、`PUT /:id`、`DELETE /:id` |
| tasks | `GET /?date=`、`GET /unfinished?from=`、`POST /`、`PUT /:id`、`PATCH /:id/toggle`、`PATCH /:id/pin`、`PATCH /reorder`、`DELETE /:id` |
| reviews | `GET /?date=`、`GET /history`、`PUT /` |
| reviewLock | `GET /`、`POST /`、`POST /verify`（verifyLimiter 限流；哈希存 user_settings 键 `review_lock_hash`） |
| focus | `POST /start`、`POST /:id/complete`、`POST /:id/cancel`、`POST /:id/pause`、`POST /:id/resume`、`GET /active` |
| courses | `GET /`、`GET /:id`、`POST /parse`、`POST /`、`DELETE /:id`、`PATCH /:id/episodes/:eid/toggle` |
| statistics | `GET /forest`、`GET /today-summary`、`GET /heatmap`（`/forest` 是唯一用 `validate(schema, 'query')` 的端点） |
| settings | `GET /`、`PUT /` |
| export | `GET /`（全量备份，requireAuth） |
| import | `POST /preview`、`POST /`（importLimiter；**无挂载层 requireAuth**，会话归属在 handler 内处理） |

数据库 9 张表：`users` + `study_presets` / `daily_tasks` / `daily_reviews` / `online_courses` / `course_episodes` / `focus_sessions` / `user_settings` / `study_records`（schema 见 `server/src/db/schema.sql`）。

## 前端路由（client/src/App.tsx 明细）

- `pageLoaders`：12 项（landing/home/plan/presets/pomodoro/courses/courseDetail/statistics/login/register/review/local）
- `lazy()` const：12 条独立声明（第 28-39 行，新增页面勿漏）
- `NAV_PREFETCH`：7 条（`#/`、`#/plan`、`#/presets`、`#/pomodoro`、`#/courses`、`#/statistics`、`#/review`）
- `PUBLIC_PAGES` = `{'/', '/login', '/register', '/local'}`；`GUEST_ONLY_PAGES` = `{'/login', '/register', '/local'}`
- 渲染：受保护页走 `switch`（default 回 HomePage）；公开/游客页走未登录三元链
- 过渡：`page-enter`/`page-exit`，退场 140ms（`--dur-page-exit`）

## UI 组件清单

- **通用组件**（`client/src/components/ui/`）：Button, Card, Modal(portal 到 body), Toast, ConfirmDialog, ProgressBar, EmptyState/ErrorState/LoadingState, SkipLink, SubjectBadge, Dropdown, Calendar, ImportBackupModal(导入向导), ProfileDropdown(顶栏账户菜单: 导出/导入/复盘锁/登出), SoundToggle, ThemeToggle
- **复盘门禁**（`client/src/components/review/`）：ReviewGate(三态门禁,包裹 ReviewPage 保持 lazy) + ReviewLockModal(设置/修改弹窗)
- **动效组件**（framer-motion）：AnimatedThemeToggle, Magnetic, GlowCard, Card3D, FileUpload, GradientCard, InteractiveHoverButton
- **砚池计时器**（`client/src/components/timer/`）：RingCountdown.tsx + RingCountdown.css + inkSurface.ts(等面积 LUT) + inkWavePaths.ts(三变体波形) + BurstParticles.tsx；设计见 `docs/adr/0001`-`0004` 与 `docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md`；术语见 `CONTEXT.md`
- **功能子目录**：courses/ forest/ heatmap/ landing/ layout/ presets/ tasks/

## CSS 与设计令牌

- Design system：Aurora Glass（极光玻璃），双主题（light 默认 + dark midnight）
- Token 文件：`client/src/styles/tokens.css`；组件必须用 `var(--color-xxx)`，禁硬编码
- 主题切换：`[data-theme="dark"]` 选择器；`useTheme` hook
- Glass 层级：`--color-glass-bg`(1) → `--color-glass-bg-strong`(2) → `--color-glass-3-bg`(深色覆盖)

## 构建与性能

- `client/vite.config.ts`：`manualChunks` 拆 **4 个** vendor —— `react-vendor`(react/react-dom/scheduler) / `lucide-vendor` / `motion-vendor`(framer-motion/motion-dom/motion-utils) / `virtual-vendor`(@tanstack/react-virtual)
- alias：`@shared` → `shared/src`；dev proxy：`/api` → `http://localhost:3001`；端口 5173
- 性能预算脚本：`e2e/check-perf-budget.mjs`（构建后核对 chunk 体积预算）

## 环境变量（.env 位于项目根）

- 必需：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`、`SESSION_SECRET`（缺失直接拒绝启动）
- 可选：`SERVER_PORT`(默认 3001)、`SESSION_COOKIE_SECURE`（false 本地 HTTP / true 生产 HTTPS）
- **遗留项**：`TEST_DB_NAME`（`.env.example` 声明但全库无引用，勿据此以为存在测试库）
- dotenv 从**项目根**加载（`server/src/index.ts` 里 `path.resolve(__dirname, '../../.env')`），不是 server/.env

## 部署（生产）

- nginx 反代 → Express 3001；静态资源 `client/dist/` 指纹缓存（`/assets/` 1y immutable）；SPA fallback `try_files $uri $uri/ /index.html`
- `/api/` → `http://127.0.0.1:3001`；`client_max_body_size 20m`（备份导入，Express 侧 `express.json({ limit: '20mb' })`）
- 参考配置：`deploy/nginx.conf`、`deploy/deploy.sh`；管理 skill：`.claude/skills/manage-server/`

## Shared Package 导入方式

```ts
// client（Vite alias）
import type { CreateTaskInput } from '@shared/types';
// server（相对路径）
import { CreateTaskSchema } from '../../../shared/src/schemas/task.js';
```

## e2e 工具脚本（e2e/ 目录，除 smoke 外）

| 脚本 | 用途 |
|---|---|
| `check-perf-budget.mjs` | 构建产物体积预算核对 |
| `verify-landing.mjs` / `take-landing-screenshots.mjs` / `compress-screenshots.mjs` | 介绍页截图与视觉验证 |
| `gen-favicon.mjs` | favicon 生成 |

`playwright-report/`、`test-results/` 为测试产物目录，不入库。

## 已知缺口与待清理

- **无全局 ErrorBoundary**：页面靠各自 `ErrorState` + `App.tsx` 的 `pageFallback`（Suspense fallback）兜底，勿假设有全局兜底
- `client/src/pages/AuthPage.css` 无对应 `AuthPage.tsx`（疑似死文件，可清理）
- 组件测试受限于 vitest node 环境：需要浏览器行为时拆成纯函数（如 `inkSurface.ts`/`inkWavePaths.ts`/`sound.ts`）或将断言下沉到数据层
