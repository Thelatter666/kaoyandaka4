import { describe, expect, it } from 'vitest';
import { hashReviewPassword, verifyReviewPassword } from './reviewLockHash';

describe('reviewLockHash(本地模式 SHA-256+salt,ADR-0005 W3)', () => {
  it('同密码同 salt 得同哈希,格式 salt:hex', async () => {
    const h1 = await hashReviewPassword('1234', 'aabbccdd');
    const h2 = await hashReviewPassword('1234', 'aabbccdd');
    expect(h1).toBe(h2);
    expect(h1.startsWith('aabbccdd:')).toBe(true);
    expect(h1.split(':')[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('不同密码哈希不同;缺省 salt 自动生成', async () => {
    const h1 = await hashReviewPassword('1234');
    const h2 = await hashReviewPassword('5678');
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(await hashReviewPassword('1234'));
  });

  it('verifyReviewPassword:正确通过、错误拒绝、格式非法拒绝', async () => {
    const stored = await hashReviewPassword('1234');
    expect(await verifyReviewPassword('1234', stored)).toBe(true);
    expect(await verifyReviewPassword('9999', stored)).toBe(false);
    expect(await verifyReviewPassword('1234', 'not-a-valid-format')).toBe(false);
  });
});
