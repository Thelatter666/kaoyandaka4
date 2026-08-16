import { z } from 'zod';

/**
 * 导出文件格式（schemaVersion 1）——数据导出/导入/本地模式共用的格式定稿。
 * 字段命名全部 camelCase，与前端 API 模型一致；业务资源条目保留原 UUID id，
 * 不导出 user_id（导入时归入目标账户）。
 */

/** 宽松业务条目：id 必填，其余字段允许任意（P2 导入校验时再按资源收紧） */
export const BackupRecordSchema = z.object({ id: z.string() }).passthrough();

export const BackupAccountSchema = z.object({
  email: z.string().email(),
  passwordHash: z.string(),
  createdAt: z.string(),
});

export const BackupSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const BackupFileSchema = z.object({
  format: z.literal('kaoyandaily-backup'),
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  account: BackupAccountSchema,
  data: z.object({
    presets: z.array(BackupRecordSchema),
    tasks: z.array(BackupRecordSchema),
    reviews: z.array(BackupRecordSchema),
    courses: z.array(BackupRecordSchema),
    episodes: z.array(BackupRecordSchema),
    focusSessions: z.array(BackupRecordSchema),
    studyRecords: z.array(BackupRecordSchema),
    settings: z.array(BackupSettingSchema),
  }),
});

export type BackupFile = z.infer<typeof BackupFileSchema>;
export type BackupAccount = z.infer<typeof BackupAccountSchema>;
export type BackupSetting = z.infer<typeof BackupSettingSchema>;
