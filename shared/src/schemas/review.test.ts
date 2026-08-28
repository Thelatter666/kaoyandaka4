import { describe, expect, it } from 'vitest';
import { SetReviewLockSchema, VerifyReviewLockSchema } from './review.js';

describe('SetReviewLockSchema', () => {
  it('接受 4-64 位新密码,currentPassword 可选', () => {
    expect(SetReviewLockSchema.safeParse({ newPassword: '1234' }).success).toBe(true);
    expect(SetReviewLockSchema.safeParse({ currentPassword: 'abcd', newPassword: '1234' }).success).toBe(true);
  });
  it('拒绝过短/超长密码', () => {
    expect(SetReviewLockSchema.safeParse({ newPassword: '123' }).success).toBe(false);
    expect(SetReviewLockSchema.safeParse({ newPassword: 'a'.repeat(65) }).success).toBe(false);
  });
});

describe('VerifyReviewLockSchema', () => {
  it('接受 4-64 位密码,拒绝空串', () => {
    expect(VerifyReviewLockSchema.safeParse({ password: '1234' }).success).toBe(true);
    expect(VerifyReviewLockSchema.safeParse({ password: '' }).success).toBe(false);
  });
});
