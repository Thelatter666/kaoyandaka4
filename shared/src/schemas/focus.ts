import { z } from 'zod';
import { DurationMinutes } from './common.js';

export const StartFocusSchema = z.object({
  presetId: z.string().uuid('预设 ID 无效'),
  plannedDurationMinutes: DurationMinutes,
  source: z.enum(['pomodoro', 'plan', 'course']),
  courseEpisodeId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
});

export const FocusSourceEnum = z.enum(['pomodoro', 'plan', 'course']);

export const BreakTypeEnum = z.enum(['short', 'long']);

export const FocusStatusEnum = z.enum(['in_progress', 'completed', 'cancelled']);

export type StartFocusInput = z.infer<typeof StartFocusSchema>;
export type FocusSource = z.infer<typeof FocusSourceEnum>;
export type BreakType = z.infer<typeof BreakTypeEnum>;
export type FocusStatus = z.infer<typeof FocusStatusEnum>;
