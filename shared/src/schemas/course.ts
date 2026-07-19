import { z } from 'zod';
import { SubjectEnum, SubSubjectEnum } from './common.js';

const EpisodeInput = z.object({
  title: z.string().min(1, '标题不能为空'),
  durationText: z.string().min(1),
  durationSeconds: z.number().int().positive('时长必须 > 0'),
});

export const ParseImportSchema = z.object({
  rawText: z.string().min(1, '导入文本不能为空'),
  subject: SubjectEnum,
  subSubject: SubSubjectEnum.optional(),
});

export const CreateCourseSchema = z.object({
  name: z.string().min(1).max(200),
  subject: SubjectEnum,
  subSubject: SubSubjectEnum.optional(),
  lockedSubject: SubjectEnum.optional(),
  lockedSubSubject: SubSubjectEnum.optional(),
  episodes: z.array(EpisodeInput).min(1, '至少需要一集'),
});

export type EpisodeInput = z.infer<typeof EpisodeInput>;
export type ParseImportInput = z.infer<typeof ParseImportSchema>;
export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
