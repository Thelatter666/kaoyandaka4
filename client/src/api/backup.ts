import { api } from './client';
import { today } from '../utils/date';

/**
 * 备份导出（P1：服务器模式导出）。
 * P3 本地模式时本函数切换为本地实现（从 IndexedDB 组装同格式文件），ProfileDropdown 组件不变。
 */
export const backupApi = {
  /** 导出当前账号全部数据为 yantai-backup-YYYY-MM-DD.json */
  exportData: () => api.download('/export', `yantai-backup-${today()}.json`),
};
