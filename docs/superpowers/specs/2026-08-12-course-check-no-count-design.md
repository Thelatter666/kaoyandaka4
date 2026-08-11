# 网课打勾不再计入专注时长 — 设计文档

- 日期：2026-08-12
- 分支：`feat/course-check-no-count`
- 规模：轻量（单路由文件改动，无新依赖）

## 背景与目标

用户有时边进行番茄钟计时边看网课。此时同一集观看时间被重复计入专注时长：番茄钟结束写入一条 `focus_session` 学习记录（按实际计时），打勾完成该集又写入一条 `course_video` 学习记录（按集数标称时长），两笔记录都被统计汇总，专注时长虚高。

目标：**网课打勾（及取消打勾）不再产生任何学习记录**。专注时长只来自专注会话（番茄钟），杜绝重复计入。

已确认需求约束：

- 打勾完成一集：**一律不写入** `study_records`（纯看网课、未开番茄钟的情况也不计入）
- 取消打勾：**不删除** `study_records`（与写入对称，不触碰历史数据）
- 历史已产生的 `course_video` 学习记录：**保留不动**，继续按现有口径统计
- 课程页「已看时长」（`watched_duration_seconds`）不受影响——它由 `COURSE_QUERY` 子查询直接计算，不依赖 `study_records`

## 核心假设

- **H1**：专注时长统计只依赖 `study_records`，用户期望的「专注时长」语义即专注会话计时；网课打勾是完成标记而非计时器
- **H2**：`focus_sessions` 表的 `course_episode_id` / `source='course'` 能力（从网课启动专注）与本次需求无关，不动

## 显式权衡

| 取舍 | 选择 | 理由 |
|------|------|------|
| 打勾不写记录 vs 写记录但标记不计 | 不写记录 | 简单彻底，无残留数据；现有去重口径（`focus_session_id IS NULL`）无法判断「这集是否在番茄钟里看完」，标记方案不可靠 |
| 历史 course_video 记录 | 保留不动 | 尊重既有数据；统计去重 SQL 不改，历史记录按原口径继续计入 |
| 取消打勾时删记录逻辑 | 一并删除 | 保持写/删对称：打勾不再写，取消也就不该删；避免用户反复打勾/取消时意外清空历史数据 |

## 边界外声明（本方案不覆盖）

- 不改统计查询（statistics.ts 去重口径、today-summary、heatmap 全部保留）
- 不改前端（无对 `study_records` 的直接引用）
- 不清理历史 `course_video` 数据（用户已确认保留）
- 不改 `focus_sessions` 的 `course` 来源能力
- 不改 `migrate.ts` / `schema.sql`（无表结构变更）

## 架构

无数据模型变更，仅一处行为变更：

`server/src/routes/courses.ts` — `PATCH /api/v1/courses/:id/episodes/:eid/toggle`

| 行为 | 现状 | 变更后 |
|------|------|--------|
| 打勾（is_completed true） | 事务内 UPDATE episode + INSERT study_records(source='course_video') | 仅 UPDATE episode |
| 取消打勾（false） | 事务内 UPDATE episode + DELETE study_records(course_episode_id) | 仅 UPDATE episode |

由此：课程快照读取（`course` 变量，仅打勾时需要）与 `withTransaction` 事务包裹均可移除——单条 UPDATE 无需事务。

## 术语表

| 术语 | 含义 |
|------|------|
| 打勾 | 在网课管理中标记一集为已观看（`PATCH /:id/episodes/:eid/toggle`） |
| 学习记录 | `study_records` 表行，专注时长统计的唯一数据源 |
| 专注时长 | 统计页/首页/热力图展示的累计学习时间，源自 `study_records` |
