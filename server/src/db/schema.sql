-- ============================================================
-- 砚台考研打卡 — 数据库建表脚本
-- ============================================================

-- 1. study_presets（学习预设）
-- ============================================================
CREATE TABLE IF NOT EXISTS study_presets (
    id          CHAR(36) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    subject     ENUM('math','english','408') NOT NULL,
    sub_subject ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    duration_minutes INT NOT NULL,
    last_used_at DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_preset_duration CHECK (duration_minutes >= 5 AND duration_minutes <= 120 AND duration_minutes % 5 = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. daily_tasks（每日任务）
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_tasks (
    id          CHAR(36) PRIMARY KEY,
    task_date   DATE NOT NULL,
    content     VARCHAR(500) NOT NULL,
    subject     ENUM('math','english','408') NOT NULL,
    sub_subject ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_tasks_date (task_date),
    INDEX idx_tasks_date_important_sort (task_date, is_important DESC, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. daily_reviews（每日复盘）
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reviews (
    id          CHAR(36) PRIMARY KEY,
    review_date DATE NOT NULL,
    content     TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_review_date (review_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. online_courses（网课）
-- ============================================================
CREATE TABLE IF NOT EXISTS online_courses (
    id          CHAR(36) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    subject     ENUM('math','english','408') NOT NULL,
    sub_subject ENUM('data_structure','computer_organization','operating_system','computer_network') NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. course_episodes（网课集数）
-- ============================================================
CREATE TABLE IF NOT EXISTS course_episodes (
    id              CHAR(36) PRIMARY KEY,
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
    CONSTRAINT fk_episodes_course FOREIGN KEY (course_id)
        REFERENCES online_courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. focus_sessions（专注会话）
-- ============================================================
CREATE TABLE IF NOT EXISTS focus_sessions (
    id                      CHAR(36) PRIMARY KEY,
    preset_id               CHAR(36) NULL,
    preset_name_snapshot    VARCHAR(200) NOT NULL,
    subject_snapshot        ENUM('math','english','408') NOT NULL,
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

    INDEX idx_focus_status (status),
    INDEX idx_focus_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. study_records（学习记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS study_records (
    id                      CHAR(36) PRIMARY KEY,
    preset_name_snapshot    VARCHAR(200) NOT NULL,
    subject_snapshot        ENUM('math','english','408') NOT NULL,
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

    INDEX idx_records_created (created_at),
    INDEX idx_records_subject (subject_snapshot),
    INDEX idx_records_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
