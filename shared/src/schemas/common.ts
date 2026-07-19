import { z } from 'zod';

export const SubjectEnum = z.enum(['math', 'english', '408']);
export type Subject = z.infer<typeof SubjectEnum>;

export const SubSubjectEnum = z.enum([
  'data_structure',
  'computer_organization',
  'operating_system',
  'computer_network',
]);
export type SubSubject = z.infer<typeof SubSubjectEnum>;

export const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD');

export const DurationMinutes = z
  .number()
  .int('必须为整数')
  .min(5, '最短 5 分钟')
  .max(120, '最长 120 分钟')
  .refine((n) => n % 5 === 0, '必须为 5 的倍数');

export const DURATION_QUICK_OPTIONS = [25, 45, 60] as const;
export const DURATION_STEP = 5;
export const DURATION_MIN = 5;
export const DURATION_MAX = 120;

export const SHORT_BREAK_MINUTES = 5;
export const LONG_BREAK_MINUTES = 15;
export const LONG_BREAK_AFTER_ROUNDS = 4;

export const EXAM_DATE = '2026-12-20';
