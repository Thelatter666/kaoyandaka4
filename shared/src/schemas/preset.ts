import { z } from 'zod';
import { SubjectEnum, SubSubjectEnum, DurationMinutes } from './common.js';

export const CreatePresetSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(200),
  subject: SubjectEnum,
  subSubject: SubSubjectEnum.optional(),
  durationMinutes: DurationMinutes,
  lockedSubject: SubjectEnum.optional(),
});

export const UpdatePresetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: SubjectEnum.optional(),
  subSubject: SubSubjectEnum.optional().nullable(),
  durationMinutes: DurationMinutes.optional(),
});

export type CreatePresetInput = z.infer<typeof CreatePresetSchema>;
export type UpdatePresetInput = z.infer<typeof UpdatePresetSchema>;
