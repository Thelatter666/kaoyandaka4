import React from 'react';

/**
 * 极光背景（设计文档 4.2 / 7.1）
 *
 * 固定全屏层：z-index 0、pointer-events none，页面内容层 z-index 1。
 * 4 个极光光斑：浅色＝粉紫/雾蓝/蜜金/青绿，深色＝极光绿/紫/蓝，
 * 颜色与透明度全部由 --color-aurora-* / --aurora-opacity-* 令牌随主题切换；
 * 两个 36s、两个 48s 极缓慢 translate 漂移，prefers-reduced-motion 下静止。
 * 样式实现见 styles/utilities.css（.aurora-background / .aurora-blob--*）。
 */
export function AuroraBackground() {
  return (
    <div className="aurora-background" aria-hidden="true">
      <div className="aurora-blob aurora-blob--1" />
      <div className="aurora-blob aurora-blob--2" />
      <div className="aurora-blob aurora-blob--3" />
      <div className="aurora-blob aurora-blob--4" />
    </div>
  );
}
