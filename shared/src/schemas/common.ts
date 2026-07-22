import { z } from 'zod';

export const SubjectEnum = z.enum(['math', 'english', '408']);
export type Subject = z.infer<typeof SubjectEnum>;

/** 会话/记录快照科目：在三科之外允许 'free'（漫游专注，不归属任何科目） */
export const SessionSubjectEnum = z.enum(['math', 'english', '408', 'free']);
export type SessionSubject = z.infer<typeof SessionSubjectEnum>;

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

/* 纯常量已迁移至零依赖的 constants.ts（避免前端值导入拖入 zod 运行时），此处转发保持兼容 */
export {
  DURATION_QUICK_OPTIONS,
  DURATION_STEP,
  DURATION_MIN,
  DURATION_MAX,
  SHORT_BREAK_MINUTES,
  LONG_BREAK_MINUTES,
  LONG_BREAK_AFTER_ROUNDS,
  EXAM_DATE,
} from '../constants.js';
