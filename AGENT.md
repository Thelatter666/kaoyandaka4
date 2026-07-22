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
  api/               → Per-resource API wrappers (tasks, presets, focus, courses, reviews, statistics, auth)
  components/        → UI primitives + feature components (layout/, tasks/, timer/, courses/, presets/, forest/, landing/, ui/)
  pages/             → Page components with co-located CSS (HomePage, PlanPage, PomodoroPage, etc.)
  hooks/             → useApi, useAuth, useCountdown, useFocusSession, useKeyboardSort, useTheme
  styles/            → CSS tokens (tokens.css), global styles, utilities

server/src/          → Express REST API
  routes/            → 7 route files: auth, presets, tasks, reviews, focus, courses, statistics
  middleware/         → cors, auth (session), validate (Zod), errorHandler (AppError)
  db/                → connection.ts (pool), schema.sql, init.ts, migrate.ts

shared/src/          → Shared between front-end and back-end
  schemas/           → Zod validation schemas per resource
  types/             → Re-exported TS types inferred from schemas
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

## Shared Package

`@shared` resolves to `shared/src/` via Vite alias. Import types in client code with:
```ts
import type { CreateTaskInput } from '@shared/types';
```
Zod schemas on the server with relative imports:
```ts
import { CreateTaskSchema } from '../../../shared/src/schemas/task.js';
```
