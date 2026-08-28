import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { reviewLockApi } from '../../api/reviews';
import { showToast } from '../ui/Toast';

/** 复盘锁设置/修改弹窗（顶栏账户菜单入口）：已设锁时需先验证当前密码（spec §1） */
export function ReviewLockModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [hasLock, setHasLock] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    reviewLockApi
      .getStatus()
      .then(({ hasLock }) => setHasLock(hasLock))
      .catch(() => setHasLock(false));
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4 || newPassword.length > 64) {
      setError('密码需 4-64 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await reviewLockApi.set({ currentPassword: hasLock ? currentPassword : undefined, newPassword });
      showToast('success', '复盘锁已保存');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="复盘锁密码">
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}
      >
        {hasLock && (
          <input
            type="password"
            placeholder="当前密码"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        )}
        <input
          type="password"
          placeholder="新密码（4-64 位）"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          type="password"
          placeholder="确认新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--color-accent-danger)', fontSize: 'var(--text-sm)' }}>
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={submitting}>
          保存
        </Button>
      </form>
    </Modal>
  );
}
