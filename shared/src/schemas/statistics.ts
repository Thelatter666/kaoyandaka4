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

/** 学习趋势热力图：近 N 天每日专注秒数（聚合口径与 /forest 一致） */
export const HeatmapResponseSchema = z.object({
  rangeStart: DateString,
  rangeEnd: DateString,
  days: z.array(
    z.object({
      date: DateString,
      /** 当日专注总秒数（去重口径：focus_session 全计 + course_video 仅计未关联 focus_session） */
      seconds: z.number().int().nonnegative(),
    })
  ),
});

export type HeatmapResponse = z.infer<typeof HeatmapResponseSchema>;
