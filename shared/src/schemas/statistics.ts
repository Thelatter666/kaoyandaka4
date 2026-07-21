import { z } from 'zod';
import { DateString, SessionSubjectEnum, SubSubjectEnum } from './common.js';

export const StatisticsQuerySchema = z.object({
  mode: z.enum(['day', 'week', 'month'], { message: '仅支持 day / week / month' }),
  date: DateString,
});

export const PeriodResultSchema = z.object({
  totalFocusSeconds: z.number(),
  totalCompletedSessions: z.number(),
  totalTrees: z.number(),
  treesBySubject: z.record(z.string(), z.number()),
  remainingSecondsBySubject: z.record(z.string(), z.number()),
});

export const LearningRecordItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subject: SessionSubjectEnum,
  subSubject: SubSubjectEnum.nullable(),
  durationSeconds: z.number(),
  time: z.string(),
  source: z.enum(['focus_session', 'course_video']),
});

export const ForestResponseSchema = z.object({
  mode: z.enum(['day', 'week', 'month']),
  rangeStart: DateString,
  rangeEnd: DateString,
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  period: PeriodResultSchema,
  cumulative: z.object({
    totalFocusSeconds: z.number(),
    totalTrees: z.number(),
  }),
  records: z.array(
    z.object({
      date: DateString,
      items: z.array(LearningRecordItemSchema),
    })
  ),
});

export type StatisticsQuery = z.infer<typeof StatisticsQuerySchema>;
export type ForestResponse = z.infer<typeof ForestResponseSchema>;
