import { z } from 'zod';
import { BackupFileSchema } from './backup.js';

/**
 * 导入（P2）——模式、差异摘要与请求/响应类型。
 * 差异摘要按 8 个资源统计「新增/更新/保留」，口径见设计文档（每表冲突键集合对比）。
 */

export const ImportModeSchema = z.enum(['overwrite', 'merge']);
export type ImportMode = z.infer<typeof ImportModeSchema>;

export const DiffItemSchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});
export type DiffItem = z.infer<typeof DiffItemSchema>;

export const DiffSummarySchema = z.object({
  presets: DiffItemSchema,
  tasks: DiffItemSchema,
  reviews: DiffItemSchema,
  courses: DiffItemSchema,
  episodes: DiffItemSchema,
  focusSessions: DiffItemSchema,
  studyRecords: DiffItemSchema,
  settings: DiffItemSchema,
});
export type DiffSummary = z.infer<typeof DiffSummarySchema>;

export const ImportPreviewResponseSchema = z.object({
  accountEmail: z.string().email(),
  modeOptions: z.array(ImportModeSchema),
  diff: DiffSummarySchema,
  existingAccount: z.boolean(),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

/** 导入请求 = 备份文件 + 可选模式（已登录必填，未登录省略） */
export const ImportRequestSchema = BackupFileSchema.extend({
  mode: ImportModeSchema.optional(),
});
export type ImportRequest = z.infer<typeof ImportRequestSchema>;
