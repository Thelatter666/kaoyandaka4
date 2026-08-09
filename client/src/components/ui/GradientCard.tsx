/**
 * GradientCard 渐变内容卡（原版源码适配，极光玻璃体系）
 *
 * 原版（Tailwind + cva + framer-motion）适配要点：
 * - 渐变变体令牌化：primary / neutral / math / english / 408，
 *   color-mix + 设计令牌实现双主题自适应；卡面 = glass 底 + 135° 染色层（::before）
 * - 交互全走 CSS：hover scale 1.03 + y -4（--ease-spring），
 *   (hover:hover)(pointer:fine) 门控防触摸粘滞；reduced-motion 全部取消
 * - CTA 由 <a href> 改为按钮回调；水印槽位 = 光斑垫底 + 大图标
 *   （hover scale 1.1 + rotate 3°，保留原版动效语义）
 * - 提供 badge / title / description / cta 组合槽位，或 children 自定义主体
 *   （title/description 与 children 可共存，children 追加在描述之后）
 */
import React from 'react';
import { ArrowRight } from 'lucide-react';
import './GradientCard.css';

export type GradientCardTone = 'primary' | 'neutral' | 'math' | 'english' | '408';

export interface GradientCardProps {
  /** 渐变染色变体（默认 neutral） */
  tone?: GradientCardTone;
  /** 高层级档位：glass-2 + 28px 圆角（主角卡） */
  elevated?: boolean;
  /** 徽章文字（缺省不渲染徽章） */
  badgeText?: string;
  /** 徽章圆点色（缺省取变体色） */
  badgeColor?: string;
  /** 标题（宋体粗体，槽位渲染） */
  title?: React.ReactNode;
  /** 描述（次级色） */
  description?: React.ReactNode;
  /** CTA 文字（与原版 text + ArrowRight 一致） */
  ctaText?: string;
  /** CTA 点击回调 */
  onCta?: () => void;
  /** 右下角水印图标（lucide 元素；缺省不渲染） */
  watermark?: React.ReactNode;
  /** 整卡点击（role=button + 键盘 Enter/Space） */
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** 自定义主体：渲染在描述之后 */
  children?: React.ReactNode;
}

export function GradientCard({
  tone = 'neutral',
  elevated = false,
  badgeText,
  badgeColor,
  title,
  description,
  ctaText,
  onCta,
  watermark,
  onClick,
  className,
  style,
  children,
}: GradientCardProps) {
  const classNames = [
    'gradient-card',
    `gradient-card--${tone}`,
    elevated ? 'gradient-card--elevated glass-2' : 'glass-1',
    onClick ? 'gradient-card--clickable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={style}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      onClick={onClick}
    >
      {watermark && (
        <span className="gradient-card__watermark" aria-hidden="true">
          <span className="gradient-card__blob" />
          <span className="gradient-card__icon">{watermark}</span>
        </span>
      )}

      <div className="gradient-card__content">
        {badgeText && (
          <span className="gradient-card__badge">
            <span
              className="gradient-card__badge-dot"
              style={badgeColor ? { backgroundColor: badgeColor } : undefined}
              aria-hidden="true"
            />
            {badgeText}
          </span>
        )}

        <div className="gradient-card__body">
          {title && <h3 className="gradient-card__title">{title}</h3>}
          {description && <p className="gradient-card__description">{description}</p>}
          {children}
        </div>

        {ctaText && onCta && (
          <button type="button" className="gradient-card__cta" onClick={onCta}>
            {ctaText}
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
