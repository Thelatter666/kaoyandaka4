import React, { useRef, useState } from 'react';
import { Upload, FileJson, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { showToast } from './Toast';
import { backupApi } from '../../api/backup';
import { ApiError } from '../../api/client';
import { isLocalApp } from '../../local/mode';
import type { BackupFile } from '@shared/types';
import type { ImportMode, ImportPreviewResponse, DiffSummary } from '@shared/types';
import './ImportBackupModal.css';

const RESOURCE_LABELS: Record<keyof DiffSummary, string> = {
  presets: '学习预设',
  tasks: '每日任务',
  reviews: '每日复盘',
  courses: '网课',
  episodes: '网课集数',
  focusSessions: '专注会话',
  studyRecords: '学习记录',
  settings: '用户设置',
};

interface ImportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 导入成功回调（调用方决定跳转/刷新） */
  onImported: (result: { id: string; email: string }) => void;
}

type Step = 'pick' | 'preview' | 'done';

export function ImportBackupModal({ isOpen, onClose, onImported }: ImportBackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const reset = () => {
    setStep('pick');
    setFileName('');
    setPreview(null);
    setError(null);
    setBusy(false);
    setConfirmOverwrite(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const pickFile = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFile;
      // 本地形状检查（服务端仍会完整校验 BackupFileSchema）
      if (parsed.format !== 'kaoyandaily-backup' || parsed.schemaVersion !== 1 || !parsed.account || !parsed.data) {
        throw new Error('不是有效的砚台备份文件');
      }
      const result = await backupApi.previewImport(parsed);
      setFileName(file.name);
      setPreview(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '文件读取失败');
      setStep('pick');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (mode?: ImportMode) => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      // 重新读取文件内容（组件不缓存文件对象，避免大文件驻留内存）
      const file = fileInputRef.current?.files?.[0];
      if (!file) throw new Error('文件已失效，请重新选择');
      const parsed = JSON.parse(await file.text()) as BackupFile;
      const result = await backupApi.importData(parsed, mode);
      showToast('success', '导入完成');
      onImported(result);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  // 已登录流程：preview 的 modeOptions 含 overwrite（服务端按登录态返回）；未登录仅 ['merge']
  const isLoggedInFlow = preview ? preview.modeOptions.includes('overwrite') : false;
  const canImport = preview && (isLoggedInFlow || !preview.existingAccount);
  const isLocal = isLocalApp();

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="从备份文件导入">
        <div className="import-modal">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="import-modal__input"
            onChange={(e) => { void handleFile(e); }}
            aria-hidden="true"
            tabIndex={-1}
          />

          {step === 'pick' && (
            <div className="import-modal__pick">
              <button type="button" className="import-modal__pick-btn" onClick={pickFile} disabled={busy}>
                <Upload size={20} strokeWidth={1.75} aria-hidden="true" />
                {busy ? '正在分析文件...' : '选择备份文件（.json）'}
              </button>
              <p className="import-modal__hint">
                {isLocal
                  ? '支持 P1 服务器导出的 yantai-backup-*.json 与本地账户导出的备份文件'
                  : '支持 P1 导出的 yantai-backup-*.json（schemaVersion 1）'}
              </p>
              {error && (
                <p className="import-modal__error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="import-modal__preview">
              <div className="import-modal__file">
                <FileJson size={16} strokeWidth={1.75} aria-hidden="true" />
                {fileName}
              </div>

              <div className="import-modal__account">
                备份账号：<strong>{preview.accountEmail}</strong>
              </div>

              {!isLoggedInFlow && preview.existingAccount && (
                <p className="import-modal__warning" role="alert">
                  <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
                  该邮箱已注册。请登录该账号后，从账户菜单的「导入数据」导入。
                </p>
              )}

              {canImport && (
                <>
                  <table className="import-modal__diff">
                    <thead>
                      <tr>
                        <th>数据</th>
                        <th>新增</th>
                        <th>更新</th>
                        <th>保留</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(preview.diff) as (keyof DiffSummary)[]).map((key) => {
                        const d = preview.diff[key];
                        if (d.added === 0 && d.updated === 0 && d.kept === 0) return null;
                        return (
                          <tr key={key}>
                            <td>{RESOURCE_LABELS[key]}</td>
                            <td>{d.added}</td>
                            <td>{d.updated}</td>
                            <td>{d.kept}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="import-modal__hint">
                    更新 = 与现有数据冲突，将以备份文件为准；保留 = 仅当前账号有，不受影响。
                  </p>
                </>
              )}

              {error && (
                <p className="import-modal__error" role="alert">
                  {error}
                </p>
              )}

              {canImport && (
                <div className="import-modal__actions">
                  {preview.modeOptions.includes('merge') && (
                    <Button variant="primary" loading={busy} onClick={() => { void runImport('merge'); }}>
                      合并导入
                    </Button>
                  )}
                  {preview.modeOptions.includes('overwrite') && (
                    <Button variant="danger" loading={busy} onClick={() => setConfirmOverwrite(true)}>
                      覆盖导入
                    </Button>
                  )}
                  <Button variant="ghost" disabled={busy} onClick={handleClose}>
                    取消
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOverwrite}
        onClose={() => setConfirmOverwrite(false)}
        onConfirm={() => { void runImport('overwrite'); }}
        title="确认覆盖导入？"
        message="覆盖将清空当前账号的全部数据（任务/复盘/预设/网课/专注/记录/设置），以备份文件为准。"
        detail="强烈建议先「导出数据」备份当前数据。"
        confirmLabel="确认覆盖"
        destructive
      />
    </>
  );
}
