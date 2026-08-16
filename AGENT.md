# Project Instructions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 6 |
| Backend | Express 4 + TypeScript |
| Database | MySQL 8 (mysql2/promise) |
| Validation | Zod (shared schemas) |
| Auth | Session-based (express-session + MySQL store) |
| Testing | Vitest + Playwright |
| Lint | ESLint 9 (flat config) |

## Project Structure

```
client/src/          → React SPA (hash-router, lazy-loaded pages)
  api/               → Per-resource API wrappers (auth, tasks, presets, focus, courses, reviews, statistics, settings)
  components/        → UI primitives + feature components (layout/, tasks/, timer/, courses/, presets/, forest/, heatmap/, landing/, ui/)
  pages/             → Page components with co-located CSS (HomePage, PlanPage, PomodoroPage, ReviewPage, LoginPage/RegisterPage, etc.)
  hooks/             → useApi, useAuth, useCountdown, useFocusSession, useKeyboardSort, useScreenWakeLock, useTheme
  workers/           → Web Workers (countdown-title.ts: 标签页标题倒计时; end-sound.ts: 番茄钟准点响铃)
  styles/            → CSS tokens (tokens.css), global styles, utilities

server/src/          → Express REST API
  routes/            → 8 route files: auth, presets, tasks, reviews, focus, courses, statistics, settings
  middleware/         → cors, auth (session), validate (Zod), errorHandler (AppError)
  db/                → connection.ts (pool), schema.sql, init.ts, migrate.ts
  utils/             → date.ts (UTC 日期工具), uuid.ts (generateUUID)
  types/             → express-mysql-session 类型扩展

shared/src/          → Shared between front-end and back-end
  constants.ts       → 共享常量（科目分组、专注时长档位等）
  schemas/           → Zod validation schemas per resource
  types/             → Re-exported TS types inferred from schemas

plans/               → 单文件实现计划（编号 md，多为动画/动效类任务，先写计划再实现）
docs/ 交接文档/        → 设计文档、需求文档、组件集成报告
```

## Code Style

- **File naming**: PascalCase for components/pages, camelCase for hooks/utils/api modules
- **DB columns**: snake_case → transformed to camelCase in route handlers via `transformXxx()` functions
- **Route paths**: kebab-case (`/api/v1/study_presets` → `/presets` in route file)
- **API client modules**: named `{resource}Api` object with methods (`tasksApi.getByDate()`, `presetsApi.getAll()`)
- **Comments**: Chinese throughout business logic; English in structural/setup code

## Architecture Patterns

### Request Lifecycle (every route follows this pattern)
1. `requireAuth` middleware → session check → injects `req.userId`
2. `validate(Schema)` middleware → Zod parse on `req.body`
3. Route handler → raw SQL via `pool.query()`, all queries filtered by `req.userId`
4. `transformXxx(row)` → snake_case DB columns to camelCase response
5. Errors → `throw new AppError(status, code, message)` → caught by `errorHandler`

### Error Shape (consistent across all endpoints)
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

### Auth Model
- Session stored in MySQL (`sessions` table via express-mysql-session)
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- 401 from non-auth routes triggers global logout in front-end (`unauthorizedHandler`)
- All business routes are guarded by `requireAuth` mounted at `server/src/index.ts`

### Front-end Routing
- Hash-based SPA (no React Router) — custom router in `App.tsx`
- `parseHashRoute()` extracts page + params (e.g., `#/courses/abc123` → `course-detail` page)
- Route-level code splitting via `React.lazy()` + hover prefetch
- Page transitions: CSS `page-enter`/`page-exit` with 140ms exit phase

### Data Isolation
- `user_id` is NEVER accepted from client — always from `req.session.userId`
- All queries use `WHERE user_id = ?` pattern; 404 for another user's resource (no enumeration)

## Key Conventions

- **Validation**: All input validated with Zod schemas in `shared/src/schemas/`. New routes MUST use `validate()` middleware.
- **IDs**: UUID v4 (`CHAR(36)` in DB), generated server-side via `generateUUID()` from `uuid` package
- **Dates**: `YYYY-MM-DD` strings for date fields; `DATETIME` in DB
- **204 responses**: DELETE and some PATCH endpoints return 204 with no body → client handles with `undefined as T`
- **COALESCE updates**: PUT endpoints use `COALESCE(?, column)` for partial updates — omit a field to keep existing value
- **Toggle pattern**: `PATCH /:id/toggle` uses `SET is_completed = NOT is_completed`

## Testing

- **Unit/Integration**: `npx vitest run` (files matching `**/*.test.ts`, `**/*.test.tsx`)
- **E2E**: `npm run test:e2e` (Playwright, config at `e2e/playwright.config.ts`)
- E2E tests authenticate via real session (not mocked)
- 单元测试已存在：`client/src/utils/sound.test.ts`（番茄钟提示音引擎）；新增逻辑请按 `**/*.test.ts(x)` 惯例补测（vitest 配置在根目录 `vitest.config.ts`，排除 e2e/）

## Build & Run

```bash
npm run dev          # Start both front-end (5173) and back-end (3001)
npm run dev:client   # Front-end only
npm run dev:server   # Back-end only
npm run build        # Production build (vite + tsc)
npm run lint         # ESLint
npm run db:init      # Initialize/reset database
npm run db:migrate   # Run migrations
```

## Git Conventions

- **Branch naming**: `type/description` (e.g., `redesign/frontend`, `refactor/layout`)
- **Commit style**: `<type>(<scope>): <Chinese description>` — types: feat, fix, docs, refactor, chore
- Feature work typically branched from `main`

## CSS & Design Tokens

- **Design system**: Aurora Glass (极光玻璃) — dual-theme (light default + dark midnight)
- **Token file**: `client/src/styles/tokens.css` — all colors, radii, shadows, spacing, z-index, fonts
- **Rule**: Components MUST use CSS variables (`var(--color-xxx)`), NEVER hardcode color values
- **Theme switch**: `[data-theme="dark"]` selector on `<html>`; toggle via `useTheme` hook
- **CSS modules**: Co-located `*.css` files per page/component (e.g., `HomePage.css`)
- **Glass layers**: `--color-glass-bg` (level 1) → `--color-glass-bg-strong` (level 2) → `--color-glass-3-bg` (dark overlay)

## UI 组件库与动效

- **通用组件**: `client/src/components/ui/` — Button, Card, Modal, Toast, ConfirmDialog, ProgressBar, EmptyState/ErrorState/LoadingState, SkipLink, SubjectBadge
- **动效组件** (framer-motion): `AnimatedThemeToggle` (主题切换动画), `Magnetic` (磁性吸引), `GlowCard` (辉光边框), `Card3D` (3D 透视), `FileUpload` (拖放上传)
- **新组件加入 `components/ui/`**, co-located CSS + `var(--color-xxx)` token, 动画统一用 framer-motion
- **构建分包**: `client/vite.config.ts` 的 `manualChunks` 将 react / lucide / framer-motion 拆为独立 vendor chunk（性能优化，勿破坏）

## Environment

- **Required env vars**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`
- **Config file**: `.env` at project root (see `.env.example`)
- **`SESSION_SECRET` is mandatory** — server refuses to start without it
- **`SESSION_COOKIE_SECURE`**: `false` for local dev (HTTP), `true` for production (HTTPS)

## Deployment

- **Production**: nginx reverse proxy → Express on port 3001
- **Static assets**: `client/dist/` served by nginx with fingerprint caching (`/assets/` → 1y immutable)
- **SPA fallback**: `try_files $uri $uri/ /index.html`
- **API proxy**: `/api/` → `http://127.0.0.1:3001`
- **Reference config**: `deploy/nginx.conf`, `deploy/deploy.sh`

## Shared Package

`@shared` resolves to `shared/src/` via Vite alias. Import types in client code with:
```ts
import type { CreateTaskInput } from '@shared/types';
```
Zod schemas on the server with relative imports:
```ts
import { CreateTaskSchema } from '../../../shared/src/schemas/task.js';
```

## 项目级 AI 工具与约定

- **操作安全**（根目录 `memory.md` 事故教训, 2026-07-28）: 修改任何已有文件前**先 Read**; 密钥/配置类文件操作前先 `cp file file.bak`; 用户说"写到/放入/添加"一律视为**追加**, 除非明确说"覆盖/替换"
- **服务器管理**: `.claude/skills/manage-server/` 项目 skill — 腾讯云服务器部署、日志、重启; 部署文件在 `deploy/` (deploy.sh, nginx.conf, nginx.ip.conf, server-management-prompt.txt)
- **服务器管家**: `server-butler/` (OVERVIEW.md + butler.sh) — 腾讯云实例状态/防火墙/带宽/快照管理，密钥从 `~/.tccli/env.sh` 注入，不出网直连（仅 API）
- **E2E**: `e2e/tests/smoke.spec.ts` 冒烟测试, 通过真实会话认证（非 mock）

## 开发工作流约束（2026-08-12 修订）

进行**任何代码修改**（新功能、模块修改、bug 修复、重构等）时，必须按以下流程执行，每个阶段都需要用户确认后才进入下一步：

1. **提需求**：用户提出需求
2. **探索理解**：探索代码库、理解需求
3. **复述对齐**：将理解后的需求用自己的话说一遍，**用户确认对齐**后才动手
4. **新建分支**：先新开分支，从 `main` 新建（如 `feat/xxx`、`refactor/xxx`），禁止直接改 main
5. **执行任务**：加载 `creative-development-workflow` skill（brainstorm → grilling → spec → plan → 实现）
6. **效果确认**：任务完成后只汇报效果，**用户亲自检查效果**
7. **commit / merge 指令**：用户检查通过后，才会下达 **commit** 或 **commit + merge** 指令；在用户明确下令前，绝不 commit、绝不 merge、绝不 push
8. **合并 main**：合并回 `main`
9. **同步远端**：push 到远端仓库（**github 与 gitee 双远端均需推送**：`git push github main` + `git push origin main`）
10. **同步服务器**：按 `manage-server` skill 部署到服务器
