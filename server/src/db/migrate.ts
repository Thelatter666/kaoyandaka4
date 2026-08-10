/**
 * 砚台考研打卡 — users 迁移脚本（账号系统阶段 T2.1）
 * ============================================================
 * 作用：
 *   1. 创建 users 表（若不存在）；
 *   2. 写入种子管理员（admin@yantai.local），用于承接本地存量数据；
 *   3. 为 7 张业务表补 user_id 列 + 外键（ON DELETE CASCADE）+ 复合索引；
 *   4. daily_reviews 唯一索引由 (review_date) 调整为 (user_id, review_date)。
 *
 * 幂等性：全部通过 information_schema 检查后执行，可重复运行不报错；
 *   也兼容「上次迁移中断」的中间状态（如列已加但仍有 NULL 行）。
 *
 * 安全顺序（外键约束下）：
 *   建 users 表 + 种子用户 → ADD COLUMN user_id（允许 NULL）→
 *   回填存量行为种子用户 id → MODIFY 为 NOT NULL → 建新索引 →
 *   DROP 被替换的旧索引 → 加外键。
 *
 * 使用方式：
 *   独立执行：npm run db:migrate（根目录）或 npx tsx src/db/migrate.ts（server 目录）
 *   被 init.ts 调用：新库跑完 schema.sql 后执行，补种子用户（结构已是最终形态，自动跳过）。
 *
 * 回滚：见同目录 rollback-users.sql。
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RowDataPacket } from 'mysql2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 种子管理员：本阶段（T2.1）仅作历史存量数据归属。
// password_hash 为占位串，不可登录；待阶段 T2.2（注册/登录）落地后
// 可用脚本将其重置为真实 bcrypt 哈希，或注册新账号后转移数据归属。
export const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
export const SEED_USER_EMAIL = 'admin@yantai.local';
const SEED_PASSWORD_HASH = 'MIGRATION_PLACEHOLDER';

// users 表 DDL：与 schema.sql 保持一致
const CREATE_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
    id           CHAR(36) PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

interface IndexToAdd {
  name: string;
  ddl: string; // ALTER TABLE ... ADD 之后的完整定义
  columns: string[]; // 期望的列组成（用于校验同名索引定义是否匹配）
}

interface BusinessTableSpec {
  table: string;
  fkName: string;
  indexesToAdd: IndexToAdd[];
  legacyIndexesToDrop: string[]; // 被新索引替换、需要 DROP 的旧索引
}

// 7 张业务表的迁移配置（索引设计与 schema.sql 最终形态一致）
const BUSINESS_TABLES: BusinessTableSpec[] = [
  {
    table: 'study_presets',
    fkName: 'fk_presets_user',
    indexesToAdd: [
      { name: 'idx_presets_user', ddl: 'INDEX `idx_presets_user` (`user_id`)', columns: ['user_id'] },
    ],
    legacyIndexesToDrop: [],
  },
  {
    table: 'daily_tasks',
    fkName: 'fk_tasks_user',
    indexesToAdd: [
      {
        name: 'idx_tasks_user_date',
        ddl: 'INDEX `idx_tasks_user_date` (`user_id`, `task_date`)',
        columns: ['user_id', 'task_date'],
      },
      {
        name: 'idx_tasks_user_date_important_sort',
        ddl: 'INDEX `idx_tasks_user_date_important_sort` (`user_id`, `task_date`, `is_important` DESC, `sort_order`)',
        columns: ['user_id', 'task_date', 'is_important', 'sort_order'],
      },
    ],
    legacyIndexesToDrop: ['idx_tasks_date', 'idx_tasks_date_important_sort'],
  },
  {
    table: 'daily_reviews',
    fkName: 'fk_reviews_user',
    indexesToAdd: [
      {
        name: 'idx_reviews_user_date',
        ddl: 'UNIQUE INDEX `idx_reviews_user_date` (`user_id`, `review_date`)',
        columns: ['user_id', 'review_date'],
      },
    ],
    legacyIndexesToDrop: ['idx_review_date'],
  },
  {
    table: 'online_courses',
    fkName: 'fk_courses_user',
    indexesToAdd: [
      { name: 'idx_courses_user', ddl: 'INDEX `idx_courses_user` (`user_id`)', columns: ['user_id'] },
    ],
    legacyIndexesToDrop: [],
  },
  {
    table: 'course_episodes',
    fkName: 'fk_episodes_user',
    // 冗余归属列：保留原 (course_id) 索引，新增 (user_id) 支持单表按用户过滤
    indexesToAdd: [
      { name: 'idx_episodes_user', ddl: 'INDEX `idx_episodes_user` (`user_id`)', columns: ['user_id'] },
    ],
    legacyIndexesToDrop: [],
  },
  {
    table: 'focus_sessions',
    fkName: 'fk_focus_user',
    indexesToAdd: [
      {
        name: 'idx_focus_user_status',
        ddl: 'INDEX `idx_focus_user_status` (`user_id`, `status`)',
        columns: ['user_id', 'status'],
      },
      {
        name: 'idx_focus_user_started',
        ddl: 'INDEX `idx_focus_user_started` (`user_id`, `started_at`)',
        columns: ['user_id', 'started_at'],
      },
    ],
    legacyIndexesToDrop: ['idx_focus_status', 'idx_focus_started_at'],
  },
  {
    table: 'study_records',
    fkName: 'fk_records_user',
    indexesToAdd: [
      {
        name: 'idx_records_user_created',
        ddl: 'INDEX `idx_records_user_created` (`user_id`, `created_at`)',
        columns: ['user_id', 'created_at'],
      },
      {
        name: 'idx_records_user_subject',
        ddl: 'INDEX `idx_records_user_subject` (`user_id`, `subject_snapshot`)',
        columns: ['user_id', 'subject_snapshot'],
      },
      {
        name: 'idx_records_user_source',
        ddl: 'INDEX `idx_records_user_source` (`user_id`, `source`)',
        columns: ['user_id', 'source'],
      },
    ],
    legacyIndexesToDrop: ['idx_records_created', 'idx_records_subject', 'idx_records_source'],
  },
];

async function columnExists(
  conn: mysql.Connection, dbName: string, table: string, column: string
): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

async function isColumnNullable(
  conn: mysql.Connection, dbName: string, table: string, column: string
): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows.length > 0 && rows[0].IS_NULLABLE === 'YES';
}

// 返回索引的列组成（按 SEQ_IN_INDEX 顺序）；索引不存在时返回 null。
// 注意：MySQL DROP COLUMN 只会把列从多列索引中剔除、保留剩余索引体，
// 因此「回滚后」同名索引可能只剩旧列，需比对列组成决定是否重建。
async function getIndexColumns(
  conn: mysql.Connection, dbName: string, table: string, indexName: string
): Promise<string[] | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     ORDER BY SEQ_IN_INDEX`,
    [dbName, table, indexName]
  );
  return rows.length > 0 ? rows.map((r) => r.COLUMN_NAME as string) : null;
}

async function constraintExists(
  conn: mysql.Connection, dbName: string, constraintName: string
): Promise<boolean> {
  // 约束名在单个 schema 内唯一（含 PK/UNIQUE/FK/CHECK），按名判断即可
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = ?`,
    [dbName, constraintName]
  );
  return rows[0].cnt > 0;
}

/**
 * 对指定数据库执行 users 迁移（幂等）。
 * 调用方需已建好连接并选定数据库（USE）。
 */
export async function migrateUsers(conn: mysql.Connection, dbName: string): Promise<void> {
  // 0. user_settings 表（设置键值，CREATE TABLE IF NOT EXISTS 本身幂等）
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id       CHAR(36)     NOT NULL,
        setting_key   VARCHAR(64)  NOT NULL,
        setting_value VARCHAR(255) NOT NULL,
        PRIMARY KEY (user_id, setting_key),
        CONSTRAINT fk_settings_user FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('  [user_settings] table ready');

  // 1. users 表（CREATE TABLE IF NOT EXISTS 本身幂等）
  await conn.query(CREATE_USERS_TABLE);
  console.log('  [users] table ready');

  // 2. 种子管理员（按 email 判断是否已存在，存在则复用其 id 作为回填目标）
  let seedUserId = SEED_USER_ID;
  const [seedRows] = await conn.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE email = ?',
    [SEED_USER_EMAIL]
  );
  if (seedRows.length > 0) {
    seedUserId = seedRows[0].id;
    console.log(`  [users] seed admin already exists (id=${seedUserId})`);
  } else {
    await conn.query(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [SEED_USER_ID, SEED_USER_EMAIL, SEED_PASSWORD_HASH]
    );
    console.log(`  [users] seeded admin ${SEED_USER_EMAIL} (id=${SEED_USER_ID}, placeholder password)`);
  }

  // 3. 逐张业务表迁移
  for (const spec of BUSINESS_TABLES) {
    // 3.1 补 user_id 列（先允许 NULL，避免存量行直接违反非空约束）
    if (!(await columnExists(conn, dbName, spec.table, 'user_id'))) {
      await conn.query(
        `ALTER TABLE \`${spec.table}\` ADD COLUMN \`user_id\` CHAR(36) NULL AFTER \`id\``
      );
      console.log(`  [${spec.table}] added column user_id (nullable)`);
    } else {
      console.log(`  [${spec.table}] column user_id already exists, skip add`);
    }

    // 3.2 回填存量行（含上次迁移中断遗留的 NULL 行）
    const [updateResult] = await conn.query<mysql.ResultSetHeader>(
      `UPDATE \`${spec.table}\` SET \`user_id\` = ? WHERE \`user_id\` IS NULL`,
      [seedUserId]
    );
    if (updateResult.affectedRows > 0) {
      console.log(`  [${spec.table}] backfilled ${updateResult.affectedRows} row(s) -> user ${seedUserId}`);
    }

    // 3.3 设为 NOT NULL
    if (await isColumnNullable(conn, dbName, spec.table, 'user_id')) {
      await conn.query(
        `ALTER TABLE \`${spec.table}\` MODIFY COLUMN \`user_id\` CHAR(36) NOT NULL`
      );
      console.log(`  [${spec.table}] set user_id NOT NULL`);
    }

    // 3.4 建新索引（先于外键：InnoDB 要求外键列有索引，避免自动建冗余索引）
    for (const idx of spec.indexesToAdd) {
      const existing = await getIndexColumns(conn, dbName, spec.table, idx.name);
      if (existing) {
        if (existing.join(',') === idx.columns.join(',')) continue; // 定义一致，跳过
        // 同名索引列组成不匹配（回滚残留），DROP 后重建
        await conn.query(`ALTER TABLE \`${spec.table}\` DROP INDEX \`${idx.name}\``);
        console.log(`  [${spec.table}] dropped mismatched index ${idx.name} (${existing.join(',')})`);
      }
      await conn.query(`ALTER TABLE \`${spec.table}\` ADD ${idx.ddl}`);
      console.log(`  [${spec.table}] added index ${idx.name}`);
    }

    // 3.5 DROP 被替换的旧索引
    for (const legacyName of spec.legacyIndexesToDrop) {
      if ((await getIndexColumns(conn, dbName, spec.table, legacyName)) !== null) {
        await conn.query(`ALTER TABLE \`${spec.table}\` DROP INDEX \`${legacyName}\``);
        console.log(`  [${spec.table}] dropped legacy index ${legacyName}`);
      }
    }

    // 3.6 加外键（ON DELETE CASCADE：删用户时级联清理其业务数据）
    if (!(await constraintExists(conn, dbName, spec.fkName))) {
      await conn.query(
        `ALTER TABLE \`${spec.table}\`
         ADD CONSTRAINT \`${spec.fkName}\` FOREIGN KEY (\`user_id\`)
         REFERENCES \`users\`(\`id\`) ON DELETE CASCADE`
      );
      console.log(`  [${spec.table}] added foreign key ${spec.fkName}`);
    } else {
      console.log(`  [${spec.table}] foreign key ${spec.fkName} already exists, skip`);
    }
  }
}

// 独立运行入口（被 init.ts import 时不触发）
const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] ? fs.realpathSync(path.resolve(process.argv[1])) : '';

if (entryPath === modulePath) {
  (async () => {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    const dbName = process.env.DB_NAME || 'kaoyandaily';
    console.log(`Running users migration on database "${dbName}"...`);
    await connection.query(`USE \`${dbName}\``);

    await migrateUsers(connection, dbName);

    console.log('Users migration completed successfully!');
    await connection.end();
  })().catch((err) => {
    console.error('Users migration failed:', err);
    process.exit(1);
  });
}
