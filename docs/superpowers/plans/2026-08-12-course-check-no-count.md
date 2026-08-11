# 网课打勾不再计入专注时长 — 实施计划

> **For agentic workers:** 本计划任务唯一，改动集中于单文件，采用本对话内直接实施。

**Goal:** 网课打勾/取消打勾不再写/删 `study_records`，专注时长只来自专注会话。

**Architecture:** 仅改动 `server/src/routes/courses.ts` 的 `toggle` 路由：去掉 INSERT/DELETE study_records 逻辑及配套事务/课程快照读取；无 DB 变更、无前端变更、无统计变更。

**Tech Stack:** Express 4 + mysql2/promise（原生 SQL）。

**Spec:** `docs/superpowers/specs/2026-08-12-course-check-no-count-design.md`

## Global Constraints

- 不改 `statistics.ts` / `schema.sql` / `migrate.ts` / 前端
- 历史 `course_video` 数据保留不动
- 注释中文；路由保持现有错误形状与 `requireAuth` 挂载（挂载层不动）
- **commit 仅当用户显式下达指令**：实现完成后停下汇报，等用户检查效果 + 提交指令，不自动 commit

---

### Task 1: toggle 路由移除学习记录写入/删除

**Files:**
- Modify: `server/src/routes/courses.ts`

**Interfaces:**
- Consumes: 无
- Produces: `PATCH /:id/episodes/:eid/toggle` 仅更新 `course_episodes.is_completed / completed_at`

- [ ] **Step 1: 精简 toggle 路由**

在 `server/src/routes/courses.ts` 的 `toggle` 路由中：

1. 删除 `newCompleted` 分支的课程快照读取（`course` 变量及 `SELECT * FROM online_courses`）
2. 删除 `withTransaction` 包裹，改为直接 `UPDATE course_episodes SET is_completed = ?, completed_at = ? WHERE id = ? AND user_id = ?`
3. 删除 INSERT study_records 与 DELETE study_records 两个分支
4. 移除不再使用的导入：`withTransaction`、`ResultSetHeader`（如无其他使用处）、`generateUUID`（如无其他使用处）——注意 `courses.ts` 的 POST 路由仍用 `withTransaction`、`ResultSetHeader`、`generateUUID`，保留

- [ ] **Step 2: 验证**

```bash
npx tsc --noEmit -p server/tsconfig.json
npm run lint
```

- [ ] **Step 3: 功能验证（由用户亲自检查）**

本地 `npm run dev` 后：打勾/取消打勾一集，确认统计页当日专注时长不变、无新增学习记录；课程页已看时长正常变化。只汇报效果，等用户检查。
