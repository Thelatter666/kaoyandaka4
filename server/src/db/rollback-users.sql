-- ============================================================
-- 砚台考研打卡 — users 迁移回滚脚本（账号系统阶段 T2.1）
-- ============================================================
-- 适用前提：数据库处于「已完成 users 迁移」的最终状态
--   （7 张业务表已有 user_id 列、外键 fk_*_user 及 user_id 前缀新索引）。
--   在非最终状态执行会因约束/列不存在而报错，属预期保护，请勿忽略排查。
--
-- 回滚内容：
--   1. 逐表 DROP 外键 fk_*_user；
--   2. 逐表显式 DROP user_id 前缀的新索引
--      （注意：MySQL DROP COLUMN 只会把列从多列索引中剔除、保留剩余索引体，
--       不会整个删除，因此必须先显式 DROP INDEX，再 DROP COLUMN）；
--   3. 逐表 DROP user_id 列；
--   4. 重建迁移中被替换的旧索引（daily_tasks / daily_reviews /
--      focus_sessions / study_records）；
--   5. users 表默认保留（账号数据与业务表已无关联，保留不影响回滚后使用）；
--      如需彻底删除，取消文件末尾的 DROP TABLE 注释。
--
-- 回滚后可随时重新执行 npm run db:migrate 恢复到迁移最终态（幂等）。
--
-- 执行方式（按实际库名替换）：
--   mysql -h localhost -P 3306 -u root -p kaoyandaily < server/src/db/rollback-users.sql
-- ============================================================

-- 1. study_presets（学习预设）
-- ============================================================
ALTER TABLE `study_presets` DROP FOREIGN KEY `fk_presets_user`;
ALTER TABLE `study_presets` DROP INDEX `idx_presets_user`;
ALTER TABLE `study_presets` DROP COLUMN `user_id`;

-- 2. daily_tasks（每日任务）
-- ============================================================
ALTER TABLE `daily_tasks` DROP FOREIGN KEY `fk_tasks_user`;
ALTER TABLE `daily_tasks` DROP INDEX `idx_tasks_user_date`;
ALTER TABLE `daily_tasks` DROP INDEX `idx_tasks_user_date_important_sort`;
ALTER TABLE `daily_tasks` DROP COLUMN `user_id`;
-- 重建迁移前的旧索引
ALTER TABLE `daily_tasks` ADD INDEX `idx_tasks_date` (`task_date`);
ALTER TABLE `daily_tasks` ADD INDEX `idx_tasks_date_important_sort` (`task_date`, `is_important` DESC, `sort_order`);

-- 3. daily_reviews（每日复盘）
-- ============================================================
ALTER TABLE `daily_reviews` DROP FOREIGN KEY `fk_reviews_user`;
ALTER TABLE `daily_reviews` DROP INDEX `idx_reviews_user_date`;
ALTER TABLE `daily_reviews` DROP COLUMN `user_id`;
-- 恢复原「每日一条」唯一索引（多用户场景下勿执行本回滚，否则同日复盘冲突）
ALTER TABLE `daily_reviews` ADD UNIQUE INDEX `idx_review_date` (`review_date`);

-- 4. online_courses（网课）
-- ============================================================
ALTER TABLE `online_courses` DROP FOREIGN KEY `fk_courses_user`;
ALTER TABLE `online_courses` DROP INDEX `idx_courses_user`;
ALTER TABLE `online_courses` DROP COLUMN `user_id`;

-- 5. course_episodes（网课集数）
-- ============================================================
ALTER TABLE `course_episodes` DROP FOREIGN KEY `fk_episodes_user`;
ALTER TABLE `course_episodes` DROP INDEX `idx_episodes_user`;
ALTER TABLE `course_episodes` DROP COLUMN `user_id`;

-- 6. focus_sessions（专注会话）
-- ============================================================
ALTER TABLE `focus_sessions` DROP FOREIGN KEY `fk_focus_user`;
ALTER TABLE `focus_sessions` DROP INDEX `idx_focus_user_status`;
ALTER TABLE `focus_sessions` DROP INDEX `idx_focus_user_started`;
ALTER TABLE `focus_sessions` DROP COLUMN `user_id`;
ALTER TABLE `focus_sessions` ADD INDEX `idx_focus_status` (`status`);
ALTER TABLE `focus_sessions` ADD INDEX `idx_focus_started_at` (`started_at`);

-- 7. study_records（学习记录）
-- ============================================================
ALTER TABLE `study_records` DROP FOREIGN KEY `fk_records_user`;
ALTER TABLE `study_records` DROP INDEX `idx_records_user_created`;
ALTER TABLE `study_records` DROP INDEX `idx_records_user_subject`;
ALTER TABLE `study_records` DROP INDEX `idx_records_user_source`;
ALTER TABLE `study_records` DROP COLUMN `user_id`;
ALTER TABLE `study_records` ADD INDEX `idx_records_created` (`created_at`);
ALTER TABLE `study_records` ADD INDEX `idx_records_subject` (`subject_snapshot`);
ALTER TABLE `study_records` ADD INDEX `idx_records_source` (`source`);

-- 8. users（用户账号）—— 默认保留
-- ============================================================
-- 保留理由：回滚业务表后 users 数据仍可留作审计/再次迁移复用（种子用户 id 不变）。
-- 确认需要彻底回到迁移前状态时，取消下一行注释：
-- DROP TABLE IF EXISTS `users`;
