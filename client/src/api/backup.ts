import { api } from './client';
import { today } from '../utils/date';
import type { BackupFile } from '@shared/types';
import type { ImportMode, ImportPreviewResponse } from '@shared/types';

/**
 * 备份导出/导入（P1 导出 + P2 导入）。
 * P3 本地模式时本模块切换为本地实现，组件不变。
 */
export const backupApi = {
  /** 导出当前账号全部数据为 yantai-backup-YYYY-MM-DD.json */
  exportData: () => api.download('/export', `yantai-backup-${today()}.json`),

  /** 差异对比（未登录/已登录均可用）：返回摘要与邮箱占用状态 */
  previewImport: (file: BackupFile) => api.post<ImportPreviewResponse>('/import/preview', file),

  /** 执行导入；mode 已登录必填（overwrite/merge），未登录省略 */
  importData: (file: BackupFile, mode?: ImportMode) =>
    api.post<{ id: string; email: string }>('/import', mode ? { ...file, mode } : file),
};
