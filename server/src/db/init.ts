import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

  console.log('Database initialized successfully!');
  await connection.end();
}

initDatabase().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
