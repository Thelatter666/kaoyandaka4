import { z } from 'zod';

export const VocabDefinitionSchema = z.object({ pos: z.string().min(1).max(30), meaning: z.string().min(1).max(500) });
export const VocabExampleSchema = z.object({ en: z.string().min(1).max(1000), zh: z.string().min(1).max(1000) });
export const ExamFreqEnum = z.enum(['高', '中', '低']);

export const VocabContentSchema = z.object({
  phonetic: z.string().min(1).max(100).nullable().optional(),
  definitions: z.array(VocabDefinitionSchema).min(1).max(10),
  examples: z.array(VocabExampleSchema).min(1).max(10),
  extra: z.string().max(20000).nullable().optional(),
  examFreq: ExamFreqEnum.nullable().optional(),
});
export const VocabLookupResultSchema = VocabContentSchema; // LLM 输出契约 = 词卡内容

export const CreateVocabCardSchema = z.object({ word: z.string().min(1).max(100), content: VocabContentSchema });

export const UpdateVocabCardSchema = z
  .object({ masteryLevel: z.number().int().min(0).max(5).optional(), reset: z.boolean().optional() })
  .refine((v) => (v.masteryLevel !== undefined) !== (v.reset === true), { message: 'masteryLevel 与 reset 必须二选一' });

export const ReviewGradeSchema = z.enum(['known', 'fuzzy', 'unknown']);

export const VocabCardSchema = z.object({
  id: z.string(), word: z.string(), phonetic: z.string().nullable(),
  definitions: z.array(VocabDefinitionSchema), examples: z.array(VocabExampleSchema),
  extra: z.string().nullable(), examFreq: ExamFreqEnum.nullable(),
  masteryLevel: z.number().int().min(0).max(5), intervalDays: z.number().int().min(0),
  nextReviewDate: z.string(), isMastered: z.boolean(), firstLearnedAt: z.string().nullable(),
  correctCount: z.number().int().min(0), wrongCount: z.number().int().min(0),
  lastReviewedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});

export type VocabDefinition = z.infer<typeof VocabDefinitionSchema>;
export type VocabExample = z.infer<typeof VocabExampleSchema>;
export type VocabContent = z.infer<typeof VocabContentSchema>;
export type CreateVocabCardInput = z.infer<typeof CreateVocabCardSchema>;
export type UpdateVocabCardInput = z.infer<typeof UpdateVocabCardSchema>;
export type ReviewGrade = z.infer<typeof ReviewGradeSchema>;
export type VocabCard = z.infer<typeof VocabCardSchema>;

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}
