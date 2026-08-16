import { describe, it, expect } from 'vitest';
import { resolveAccount } from './export.js';
import { AppError } from '../middleware/errorHandler.js';

describe('resolveAccount', () => {
  it('有账号行时返回该行', () => {
    const row = { email: 'a@b.local', password_hash: '$2b$10$x', created_at: '2026-01-01 00:00:00' };
    expect(resolveAccount([row])).toEqual(row);
  });

  it('账号行缺失（账号被删/会话残留）时抛受控 401', () => {
    try {
      resolveAccount([]);
      expect.unreachable('应抛出 AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
      expect((err as AppError).code).toBe('UNAUTHORIZED');
    }
  });
});
