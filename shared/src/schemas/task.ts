import { z } from 'zod';
import { SubjectEnum, SubSubjectEnum, DateString } from './common.js';

export const CreateTaskSchema = z.object({
  date: DateString,
  content: z.string().min(1, '任务内容不能为空').max(500),
  subject: SubjectEnum,
  subSubject: SubSubjectEnum.optional(),
  isImportant: z.boolean().default(false),
});

export const UpdateTaskSchema = z.object({
  date: DateString.optional(),
  content: z.string().min(1).max(500).optional(),
  subject: SubjectEnum.optional(),
  subSubject: SubSubjectEnum.optional().nullable(),
  isImportant: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
});

export const ReorderItemsSchema = z.object({
  date: DateString,
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
      isImportant: z.boolean(),
    })
  ),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type ReorderItemsInput = z.infer<typeof ReorderItemsSchema>;
