/**
 * 墨面波纹路径（spec §4.2）
 *
 * 波幅写在 path 的 d 里，无法用 CSS 缩放实现 —— 对波形组 scaleY 会连带拉伸整个
 * 墨体。故在模块加载时预生成三个变体 × 三条路径 = 9 条静态字符串，状态跨越时
 * 切换 d 属性，每帧成本为零。
 *
 * 低时与休息互斥（低时判定限定专注态），无需组合变体。
 */

const VB = 360;

/** 主波 / 副波的基础波幅与空间周期（viewBox 单位）。时间周期在 CSS 中互质，避免拍频 */
const BASE = {
  A: { amp: 5.8, period: 260 },
  B: { amp: 3.6, period: 180 },
} as const;

/** 波幅系数：常态 / 低时警示 / 休息 */
const AMP_SCALE = { normal: 1, lowtime: 1.6, break: 1.25 } as const;

export type WaveVariant = keyof typeof AMP_SCALE;

/** 空间周期：CSS 动画横向平移量须等于它，才能无缝循环 */
export const WAVE_PERIOD_PX = { A: BASE.A.period, B: BASE.B.period } as const;

/** 正弦上边缘采样点；步长 6 单位在 400px 上足够平滑 */
function edgePoints(amp: number, period: number, x0: number, x1: number): string[] {
  const STEP = 6;
  const pts: string[] = [];
  for (let x = x0; x <= x1; x += STEP) {
    const y = -amp * Math.sin(((x - x0) / period) * Math.PI * 2);
    pts.push(`${x.toFixed(1)} ${y.toFixed(2)}`);
  }
  return pts;
}

/** 墨体：波边缘 + 向下闭合（填充墨面之下） */
function inkPath(amp: number, period: number): string {
  const x0 = -2 * period;
  const x1 = VB + 2 * period;
  return `M ${x0} ${VB * 2} L ${edgePoints(amp, period, x0, x1).join(' L ')} L ${x1} ${VB * 2} Z`;
}

/** 阳文裁剪：同一条波边缘 + 向上闭合（填充墨面之上，与墨体严格互补） */
function reliefPath(amp: number, period: number): string {
  const x0 = -2 * period;
  const x1 = VB + 2 * period;
  return `M ${x0} ${-VB * 2} L ${edgePoints(amp, period, x0, x1).join(' L ')} L ${x1} ${-VB * 2} Z`;
}

export const WAVE_PATHS = Object.fromEntries(
  (Object.keys(AMP_SCALE) as WaveVariant[]).map((variant) => {
    const k = AMP_SCALE[variant];
    return [
      variant,
      {
        inkA: inkPath(BASE.A.amp * k, BASE.A.period),
        inkB: inkPath(BASE.B.amp * k, BASE.B.period),
        reliefA: reliefPath(BASE.A.amp * k, BASE.A.period),
      },
    ];
  })
) as Record<WaveVariant, { inkA: string; inkB: string; reliefA: string }>;
