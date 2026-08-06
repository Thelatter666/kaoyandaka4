/**
 * 悬停交互按钮（组件库 interactive-hover-button 集成）
 *
 * 胶囊形按钮：悬停时左侧圆点放大盖满按钮、原文字向右滑出淡出，
 * 右侧滑入相同文字 + 箭头（纯 CSS transition，无 JS 依赖）。
 * Aurora Glass 适配：Tailwind 类 → tokens（primary-strong 底 + 白字），
 * reveal 层为视觉副本，aria-hidden 避免读屏重复。
 */
import React from 'react';
import { ArrowRight } from 'lucide-react';
import './InteractiveHoverButton.css';

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 进行中：禁用 + 半透明（番茄钟 start 防重复提交） */
  loading?: boolean;
}

export function InteractiveHoverButton({ children, className, loading, ...props }: InteractiveHoverButtonProps) {
  return (
    <button
      type="button"
      className={`ihb${className ? ` ${className}` : ''}${loading ? ' ihb--loading' : ''}`}
      {...props}
      disabled={loading || props.disabled}
    >
      <span className="ihb__dot" aria-hidden="true" />
      <span className="ihb__label">{children}</span>
      <span className="ihb__reveal" aria-hidden="true">
        <span>{children}</span>
        <ArrowRight size={18} strokeWidth={1.75} />
      </span>
    </button>
  );
}
