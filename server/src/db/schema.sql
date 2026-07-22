-- ============================================================
-- 砚台考研打卡 — 数据库建表脚本
-- ============================================================
-- 本脚本为「新库最终形态」（账号系统阶段 T2.1 起）：
--   users 表 + 7 张业务表均含 user_id 外键（归属用户，ON DELETE CASCADE）。
-- 注意：CREATE TABLE IF NOT EXISTS 只对新建库生效，
--   存量库的结构升级由幂等迁移脚本 migrate.ts 完成（init.ts 会自动调用）。

-- 1. users（用户账号）
-- ============================================================
-- 登录标识：邮箱 + 密码；password_hash 存 bcrypt 哈希（60 字符，VARCHAR(255) 留余量）
CREATE TABLE IF NOT EXISTS users (
    id           CHAR(36) PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. study_presets（学习预设）
-- ============================================================
CREATE TABLE IF NOT EXISTS study_presets (
    id          CHAR(36) PRIMARY KEY,
    user_id     CHAR(36) NOT NULL,
    name        VARCHAR(200) NOT NULL,
    subject     ENUM('math','english','408') NOT NULL,
    sub_subject ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    duration_minutes INT NOT NULL,
    last_used_at DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_presets_user (user_id),
    CONSTRAINT chk_preset_duration CHECK (duration_minutes >= 5 AND duration_minutes <= 120 AND duration_minutes % 5 = 0),
    CONSTRAINT fk_presets_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. daily_tasks（每日任务）
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_tasks (
    id          CHAR(36) PRIMARY KEY,
    user_id     CHAR(36) NOT NULL,
    task_date   DATE NOT NULL,
    content     VARCHAR(500) NOT NULL,
    subject     ENUM('math','english','408') NOT NULL,
    sub_subject ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_tasks_user_date (user_id, task_date),
    INDEX idx_tasks_user_date_important_sort (user_id, task_date, is_important DESC, sort_order),
    CONSTRAINT fk_tasks_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. daily_reviews（每日复盘）
-- ============================================================
-- 唯一约束为 (user_id, review_date)：多用户允许同日复盘，单用户每日仅一条
CREATE TABLE IF NOT EXISTS daily_reviews (
    id          CHAR(36) PRIMARY KEY,
    user_id     CHAR(36) NOT NULL,
    review_date DATE NOT NULL,
    content     TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_reviews_user_date (user_id, review_date),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. online_courses（网课）
-- ============================================================
CREATE TABLE IF NOT EXISTS online_courses (
    id          CHAR(36) PRIMARY KEY,
    user_id     CHAR(36) NOT NULL,
    name        VARCHAR(200) NOT NULL,
    subject     ENUM('math','english','408') NOT NULL,
    sub_subject ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_courses_user (user_id),
    CONSTRAINT fk_courses_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. course_episodes（网课集数）
-- ============================================================
-- user_id 为冗余归属（与所属 course 的用户一致）：
-- 保证单表查询可按 user_id 过滤，避免每次都 JOIN online_courses
CREATE TABLE IF NOT EXISTS course_episodes (
    id              CHAR(36) PRIMARY KEY,
    user_id         CHAR(36) NOT NULL,
    course_id       CHAR(36) NOT NULL,
    title           VARCHAR(500) NOT NULL,
    duration_seconds INT NOT NULL,
    duration_text   VARCHAR(20) NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    is_completed    BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at    DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_episodes_course (course_id),
    INDEX idx_episodes_user (user_id),
    CONSTRAINT fk_episodes_course FOREIGN KEY (course_id)
        REFERENCES online_courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_episodes_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. focus_sessions（专注会话）
-- ============================================================
CREATE TABLE IF NOT EXISTS focus_sessions (
    id                      CHAR(36) PRIMARY KEY,
    user_id                 CHAR(36) NOT NULL,
    preset_id               CHAR(36) NULL,
    preset_name_snapshot    VARCHAR(200) NOT NULL,
    subject_snapshot        ENUM('math','english','408','free') NOT NULL,
    sub_subject_snapshot    ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    planned_duration_seconds INT NOT NULL,
    actual_duration_seconds INT NULL,
    started_at              DATETIME NOT NULL,
    planned_end_at          DATETIME NOT NULL,
    completed_at            DATETIME NULL,
    status                  ENUM('in_progress','completed','cancelled') NOT NULL DEFAULT 'in_progress',
    source                  ENUM('pomodoro','plan','course') NOT NULL,
    course_episode_id       CHAR(36) NULL,
    task_id                 CHAR(36) NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_focus_user_status (user_id, status),
    INDEX idx_focus_user_started (user_id, started_at),
    CONSTRAINT fk_focus_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. study_records（学习记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS study_records (
    id                      CHAR(36) PRIMARY KEY,
    user_id                 CHAR(36) NOT NULL,
    preset_name_snapshot    VARCHAR(200) NOT NULL,
    subject_snapshot        ENUM('math','english','408','free') NOT NULL,
    sub_subject_snapshot    ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    actual_duration_seconds INT NOT NULL,
    focus_session_id        CHAR(36) NULL,
    task_id                 CHAR(36) NULL,
    course_episode_id       CHAR(36) NULL,
    course_name_snapshot    VARCHAR(200) NULL,
    episode_title_snapshot  VARCHAR(500) NULL,
    source                  ENUM('focus_session','course_video') NOT NULL,
    notes                   TEXT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_records_user_created (user_id, created_at),
    INDEX idx_records_user_subject (user_id, subject_snapshot),
    INDEX idx_records_user_source (user_id, source),
    CONSTRAINT fk_records_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
