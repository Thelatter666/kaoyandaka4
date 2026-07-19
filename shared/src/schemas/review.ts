import { z } from 'zod';
import { DateString } from './common.js';

export const UpsertReviewSchema = z.object({
  date: DateString,
  content: z.string().min(1, '复盘内容不能为空'),
});

export type UpsertReviewInput = z.infer<typeof UpsertReviewSchema>;
