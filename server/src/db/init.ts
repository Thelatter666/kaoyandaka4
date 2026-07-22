import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateUsers } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const dbName = process.env.DB_NAME || 'kaoyandaily';

  console.log(`Creating database "${dbName}" if not exists...`);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${dbName}\``);

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  console.log('Running schema...');
  await connection.query(schema);

  // 幂等 migration：subject_snapshot ENUM 扩展 'free'（漫游专注）
  // 对既有数据库生效；CREATE TABLE IF NOT EXISTS 不会更新已有表结构，重复执行安全
  console.log('Running migrations...');
  await connection.query(
    `ALTER TABLE \`focus_sessions\`
     MODIFY COLUMN \`subject_snapshot\` ENUM('math','english','408','free') NOT NULL`
  );
  await connection.query(
    `ALTER TABLE \`study_records\`
     MODIFY COLUMN \`subject_snapshot\` ENUM('math','english','408','free') NOT NULL`
  );

  // 幂等 migration：users 表 + 7 张业务表 user_id 归属（账号系统阶段 T2.1）
  // 新库经 schema.sql 已是最终形态，此处仅补种子管理员；存量库执行完整 ALTER 流程
  console.log('Running users migration...');
  await migrateUsers(connection, dbName);

  console.log('Database initialized successfully!');
  await connection.end();
}

initDatabase().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
