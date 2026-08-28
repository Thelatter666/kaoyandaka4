import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Download, KeyRound, LogOut, Upload } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { backupApi } from '../../api/backup';
import { showToast } from './Toast';
import { ImportBackupModal } from './ImportBackupModal';
import { ReviewLockModal } from '../review/ReviewLockModal';
import './ProfileDropdown.css';

interface ProfileMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  action: () => void;
}

export function ProfileDropdown() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const email = user?.email ?? '';
  const initial = email ? email.charAt(0).toUpperCase() : '砚';

  /* 点击外部 / Escape 关闭（与 Dropdown.tsx 同一交互模式） */
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  /* 导出数据：下载 yantai-backup-YYYY-MM-DD.json；失败 toast（401 由全局登出接管） */
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await backupApi.exportData();
      showToast('success', '已导出');
    } catch {
      showToast('error', '导出失败');
    } finally {
      setExporting(false);
      setIsOpen(false);
    }
  };

  /* 登出：销毁会话并回到未登录分支（逻辑自 TopNav 迁入） */
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    showToast('success', '已退出登录');
  };

  const menuItems: ProfileMenuItem[] = [
    {
      key: 'export',
      label: '导出数据',
      icon: <Download size={16} strokeWidth={1.75} aria-hidden="true" />,
      disabled: exporting,
      action: () => { void handleExport(); },
    },
    {
      key: 'import',
      label: '导入数据',
      icon: <Upload size={16} strokeWidth={1.75} aria-hidden="true" />,
      action: () => setImportOpen(true),
    },
    {
      key: 'review-lock',
      label: '复盘锁密码…',
      icon: <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />,
      action: () => setLockModalOpen(true),
    },
    {
      key: 'logout',
      label: '登出',
      icon: <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />,
      danger: true,
      disabled: loggingOut,
      action: () => { void handleLogout(); },
    },
  ];

  return (
    <div ref={rootRef} className="profile-dropdown">
      <button
        type="button"
        className="profile-dropdown__trigger glass-1"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="账户菜单"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="profile-dropdown__avatar" aria-hidden="true">{initial}</span>
        {/* trigger 只显示邮箱前 4 位（防止按钮挤出顶栏）；完整邮箱在菜单账户信息区展示，悬停 title 亦可查看 */}
        <span className="profile-dropdown__email" title={email}>{email.slice(0, 4)}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label="账户菜单"
            className="profile-dropdown__menu"
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="profile-dropdown__header">
              <span className="profile-dropdown__avatar" aria-hidden="true">{initial}</span>
              <span className="profile-dropdown__name">{email}</span>
            </div>
            <div className="profile-dropdown__divider" />
            {menuItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={item.danger ? 'profile-dropdown__item profile-dropdown__item--danger' : 'profile-dropdown__item'}
                disabled={item.disabled}
                onClick={item.action}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <ImportBackupModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          // 导入改变了当前账号数据：刷新页面让所有页面拉到最新数据
          window.location.reload();
        }}
      />

      <ReviewLockModal isOpen={lockModalOpen} onClose={() => setLockModalOpen(false)} />
    </div>
  );
}
