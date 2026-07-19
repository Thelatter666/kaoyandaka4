import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  detail,
  confirmLabel = '删除',
  cancelLabel = '取消',
  destructive = true,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p style={{ color: 'var(--color-text-primary)', marginBottom: detail ? 'var(--space-sm)' : 'var(--space-lg)' }}>
        {message}
      </p>
      {detail && (
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-sm)',
          marginBottom: 'var(--space-lg)',
          padding: 'var(--space-sm) var(--space-md)',
          backgroundColor: 'var(--color-accent-warning-light)',
          borderRadius: 'var(--radius-sm)',
        }}>
          {detail}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)' }}>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={handleConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
