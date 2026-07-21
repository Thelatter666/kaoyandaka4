/**
 * 学习森林「玻璃花房」树种 SVG（设计文档 6.2）
 * 低多边形插画风，统一 viewBox 0 0 64 80；颜色全部引用设计令牌。
 * 数学·松树（尖锐挺劲）/ 英语·阔叶树（圆润舒展）/ 408·果树（圆冠+果点）/ 幼苗占位。
 * 三种树以形状 + 树冠色 + 图例文字三重区分，不依赖单一颜色。
 * 每棵树下有地面阴影椭圆（--color-forest-tree-shadow）。
 */
import React from 'react';
import type { SessionSubject } from '@shared/types';

export interface TreeSvgProps {
  className?: string;
  style?: React.CSSProperties;
  /** 默认为装饰图形（aria-hidden）；语义由外层按钮/图例文字承载 */
  title?: string;
}

function TreeSvg({ className, style, title, children }: TreeSvgProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 80"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {/* 树下地面阴影椭圆 */}
      <ellipse cx="32" cy="76" rx="16" ry="3" fill="var(--color-forest-tree-shadow)" />
      {children}
    </svg>
  );
}

/** 数学·松树：3 层三角层叠（冷青绿），短棕干 */
export function TreePine(props: TreeSvgProps) {
  return (
    <TreeSvg {...props}>
      <rect x="29" y="62" width="6" height="12" rx="2" fill="var(--color-forest-trunk)" />
      <polygon points="32,22 8,68 56,68" fill="var(--color-forest-pine-1)" />
      <polygon points="32,12 13,52 51,52" fill="var(--color-forest-pine-2)" />
      <polygon points="32,2 18,38 46,38" fill="var(--color-forest-pine-3)" />
    </TreeSvg>
  );
}

/** 英语·阔叶树：不规则圆冠 2 色面 + 弯棕干 */
export function TreeBroadleaf(props: TreeSvgProps) {
  return (
    <TreeSvg {...props}>
      <path
        d="M32 76 C 30 64, 37 58, 32 46"
        fill="none"
        stroke="var(--color-forest-trunk)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <polygon
        points="32,4 48,10 56,24 52,40 38,48 22,46 10,36 10,20 20,8"
        fill="var(--color-forest-broadleaf-1)"
      />
      <polygon
        points="26,10 40,12 46,22 42,32 30,34 20,28 18,18"
        fill="var(--color-forest-broadleaf-2)"
      />
    </TreeSvg>
  );
}

/** 408·果树：圆冠 + 3–4 颗果点 */
export function TreeFruit(props: TreeSvgProps) {
  return (
    <TreeSvg {...props}>
      <rect x="29" y="58" width="6" height="16" rx="2" fill="var(--color-forest-trunk)" />
      <polygon
        points="32,6 46,10 54,22 52,38 40,48 24,48 12,38 10,22 18,10"
        fill="var(--color-forest-fruit-1)"
      />
      <polygon
        points="26,12 38,13 44,21 40,30 29,31 21,26 20,17"
        fill="var(--color-forest-fruit-2)"
      />
      <circle cx="20" cy="34" r="2.6" fill="var(--color-forest-fruit-dot)" />
      <circle cx="34" cy="40" r="2.6" fill="var(--color-forest-fruit-dot)" />
      <circle cx="44" cy="30" r="2.6" fill="var(--color-forest-fruit-dot)" />
      <circle cx="30" cy="22" r="2.6" fill="var(--color-forest-fruit-dot)" />
    </TreeSvg>
  );
}

/** 漫游·垂柳：圆冠 + 垂枝弧线（银灰绿），与松/阔叶/果树形状区分 */
export function TreeWillow(props: TreeSvgProps) {
  return (
    <TreeSvg {...props}>
      <rect x="29" y="58" width="6" height="16" rx="2" fill="var(--color-forest-trunk)" />
      <polygon
        points="32,6 47,11 54,24 51,40 40,48 24,48 13,40 10,24 17,11"
        fill="var(--color-forest-willow-1)"
      />
      <polygon
        points="26,12 38,13 44,21 40,31 29,32 21,27 20,17"
        fill="var(--color-forest-willow-2)"
      />
      {/* 垂枝：4 条自冠缘下垂的弧线 */}
      <path d="M16 36 C 14 46, 14 54, 16 62" fill="none" stroke="var(--color-forest-willow-1)" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 42 C 25 50, 25 58, 26 66" fill="none" stroke="var(--color-forest-willow-2)" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 42 C 39 50, 39 58, 38 66" fill="none" stroke="var(--color-forest-willow-1)" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 36 C 50 46, 50 54, 48 62" fill="none" stroke="var(--color-forest-willow-2)" strokeWidth="3" strokeLinecap="round" />
    </TreeSvg>
  );
}

/** 幼苗占位：两片小叶 + 虚线圆坑（该科本期 0 棵时显示，opacity 0.5 由样式控制） */
export function Sapling({ className, style, title }: TreeSvgProps) {
  return (
    <svg
      viewBox="0 0 64 80"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <circle
        cx="32"
        cy="70"
        r="12"
        fill="none"
        stroke="var(--color-forest-hill)"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      <path
        d="M32 70 L32 56"
        fill="none"
        stroke="var(--color-forest-pine-2)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M32 60 C 26 58, 22 54, 21 48 C 27 49, 31 53, 32 60 Z"
        fill="var(--color-forest-broadleaf-2)"
      />
      <path
        d="M32 58 C 38 56, 42 52, 43 46 C 37 47, 33 51, 32 58 Z"
        fill="var(--color-forest-pine-3)"
      />
    </svg>
  );
}

export const TREE_COMPONENTS: Record<SessionSubject, React.ComponentType<TreeSvgProps>> = {
  math: TreePine,
  english: TreeBroadleaf,
  '408': TreeFruit,
  free: TreeWillow,
};

export const SUBJECT_NAMES: Record<SessionSubject, string> = {
  math: '数学',
  english: '英语',
  '408': '408',
  free: '漫游',
};
