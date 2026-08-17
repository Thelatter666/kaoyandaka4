import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Modal 开合动画时长（与 tokens.css --dur-med 对齐；退出阶段先播动画再卸载 DOM）
 * 退出阶段：isOpen=false 后先播放退出动画，再卸载 DOM
 */
const EXIT_DURATION = 240;

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // visible 控制 DOM 是否挂载；exiting 标记退出动画阶段；entering 标记开启动画阶段
  const [visible, setVisible] = useState(isOpen);
  const [exiting, setExiting] = useState(false);
  // entering 标记开启动画阶段：挂载后下一帧移除，transition 从初始态平滑过渡
  const [entering, setEntering] = useState(false);

  // 两阶段开合：open → 立即挂载（entering 下一帧移除触发入场过渡）；close → 先播退出动画再卸载
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setExiting(false);
      // 先渲染初始态（opacity 0 / scale 0.97），下一帧移除 entering 触发过渡
      setEntering(true);
      const raf = requestAnimationFrame(() => setEntering(false));
      return () => cancelAnimationFrame(raf);
    }
    if (!visible) return;
    setExiting(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, EXIT_DURATION);
    return () => clearTimeout(timer);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the modal
      setTimeout(() => modalRef.current?.focus(), 50);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!visible) return null;

  const maxWidth = size === 'sm' ? 400 : size === 'lg' ? 720 : 560;

  /* Portal 到 body：fixed 定位脱离祖先链（backdrop-filter/transform 祖先会把 fixed
     containing block 劫持为自身尺寸，导致弹窗顶置/错位——见 top-nav glass-2 场景） */
  return createPortal(
    (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-lg)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 遮罩：rgba(16,24,40,0.32) + blur 8px；transition 实现可中断 */}
      <div
        data-exiting={exiting}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'var(--color-bg-overlay)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          opacity: entering || exiting ? 0 : 1,
          transition: `opacity ${EXIT_DURATION}ms var(--ease-out)`,
        }}
      />
      {/* 面板：glass-2 + --radius-card；transition 实现可中断 */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="glass-2"
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-lg)',
          maxWidth,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          opacity: entering || exiting ? 0 : 1,
          transform: entering || exiting ? 'scale(0.97)' : 'scale(1)',
          transition: `opacity ${EXIT_DURATION}ms var(--ease-out), transform ${EXIT_DURATION}ms var(--ease-out)`,
        }}
      >
        {title && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-md)',
          }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: 0 }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="关闭"
              style={{
                width: 44,
                height: 44,
                margin: '-8px -8px -8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                transition: 'background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-glass-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
    ),
    document.body
  );
}
