import { api } from './client';
import { localStore } from '../local/localStore';
import { isLocalApp } from '../local/mode';
import { today } from '../utils/date';
import type { BackupFile } from '@shared/types';
import type { ImportMode, ImportPreviewResponse } from '@shared/types';

/**
 * 备份导出/导入（P1 导出 + P2 导入）。
 * P3 本地模式时本模块切换为本地实现（isLocalApp = 本地账户已激活或正在本地账户页操作，
 * 因为本地账户页导入时账户尚未激活），组件不变。
 */

/** 触发浏览器下载 JSON 备份文件（本地模式无服务器响应体，自行组装 Blob） */
async function triggerDownload(file: BackupFile, filename: string): Promise<void> {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export const backupApi = {
  /** 导出当前账号全部数据为 yantai-backup-YYYY-MM-DD.json */
  exportData: async () => {
    if (isLocalApp()) {
      const file = await localStore.backup.exportBackup();
      await triggerDownload(file, `yantai-backup-${today()}.json`);
      return;
    }
    return api.download('/export', `yantai-backup-${today()}.json`);
  },

  /** 差异对比（未登录/已登录均可用）：返回摘要与邮箱占用状态 */
  previewImport: (file: BackupFile) =>
    isLocalApp()
      ? localStore.backup.previewImport(file)
      : api.post<ImportPreviewResponse>('/import/preview', file),

  /** 执行导入；mode 已登录必填（overwrite/merge），未登录省略 */
  importData: (file: BackupFile, mode?: ImportMode) =>
    isLocalApp()
      ? localStore.backup.importData(file, mode)
      : api.post<{ id: string; email: string }>('/import', mode ? { ...file, mode } : file),
};