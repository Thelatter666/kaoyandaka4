import { z } from 'zod';
import { DateString } from './common.js';

export const UpsertReviewSchema = z.object({
  date: DateString,
  content: z.string().min(1, '复盘内容不能为空'),
});

export type UpsertReviewInput = z.infer<typeof UpsertReviewSchema>;

/* 复盘锁（ADR-0005）：哈希存 user_settings 键 review_lock_hash，服务端 bcrypt / 本地 SHA-256+salt */
const LockPassword = z.string().min(4, '密码至少 4 位').max(64, '密码最长 64 位');

export const SetReviewLockSchema = z.object({
  currentPassword: LockPassword.optional(),
  newPassword: LockPassword,
});

export const VerifyReviewLockSchema = z.object({
  password: LockPassword,
});

export type SetReviewLockInput = z.infer<typeof SetReviewLockSchema>;
export type VerifyReviewLockInput = z.infer<typeof VerifyReviewLockSchema>;
