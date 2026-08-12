/**
 * Dropdown 下拉选择组件（极光玻璃）
 *
 * 视觉/动效源自外部设计稿：触发按钮 hover/按压微缩放、ChevronDown 开合旋转、
 * 菜单 AnimatePresence 淡入 + 选项交错入场、选中项弹簧打勾。
 * 适配项目约定：CSS 令牌（var(--color-xxx)）、双主题自适应、
 * prefers-reduced-motion 关闭动效、点击外部 / Escape 关闭。
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import './Dropdown.css';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  value: string | null;
  onChange: (value: string) => void;
  options: DropdownOption[];
  /** 未选中任何项时的占位文案 */
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** sm 紧凑（36px）/ md 标准（44px）；宽度默认自适应内容，加 --block 变体撑满 */
  size?: 'sm' | 'md';
  /** block：width 100% 撑满容器（表单字段场景） */
  block?: boolean;
  className?: string;
}

export function Dropdown({
  value,
  onChange,
  options,
  placeholder = '请选择',
  ariaLabel,
  disabled = false,
  size = 'md',
  block = false,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const selected = options.find((o) => o.value === value) ?? null;

  // 点击组件外部 / Escape 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
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

  const handleSelect = (option: DropdownOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const classNames = [
    'dropdown',
    `dropdown--${size}`,
    block ? 'dropdown--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className={classNames}>
      {/* 触发按钮 */}
      <motion.button
        type="button"
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        whileTap={reducedMotion ? undefined : { scale: 0.97 }}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className={selected ? 'dropdown__value' : 'dropdown__placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.75}
          aria-hidden="true"
          className={isOpen ? 'dropdown__chevron dropdown__chevron--open' : 'dropdown__chevron'}
        />
      </motion.button>

      {/* 下拉菜单 */}
      <AnimatePresence>
        {isOpen && (
          <motion.ul
            role="listbox"
            aria-label={ariaLabel}
            className="dropdown__menu"
            initial={reducedMotion ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <motion.li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  className={
                    isSelected
                      ? 'dropdown__option dropdown__option--selected'
                      : 'dropdown__option'
                  }
                  initial={reducedMotion ? false : { opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button type="button" className="dropdown__option-button" onClick={() => handleSelect(option)}>
                    <span>
                      <span className="dropdown__option-label">{option.label}</span>
                      {option.description && (
                        <span className="dropdown__option-desc">{option.description}</span>
                      )}
                    </span>
                    {isSelected && (
                      <motion.span
                        className="dropdown__check"
                        initial={reducedMotion ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      >
                        <Check size={18} strokeWidth={2} aria-hidden="true" />
                      </motion.span>
                    )}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
