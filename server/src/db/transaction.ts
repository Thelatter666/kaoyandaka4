import type { PoolConnection } from 'mysql2/promise';
import pool from './connection.js';

/**
 * 事务辅助函数：从连接池取连接并自动 begin/commit/rollback/release。
 * 回调内所有语句必须使用传入的 connection 执行，确保处于同一事务；
 * 回调抛出任何异常均会触发 rollback，最终 finally 中释放连接。
 */
export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
