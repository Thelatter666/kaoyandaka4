/**
 * 砚池墨面几何：等面积映射（ADR-0003）
 *
 * 墨面高度由「剩余面积占比」决定，而非线性对应剩余比例 —— 圆形墨堂底部收窄，
 * 线性映射会把末段（剩余不足 5 分钟）的高度变化压缩到几乎不可见，而那恰是最
 * 需要被感知的时刻。
 *
 * 圆内弓形：面积占比 f = (θ - sinθ)/2π，高度占比 h = (1 - cos(θ/2))/2。
 * f → h 无闭式解，故模块加载时预生成查找表 + 每帧线性插值
 * （排除每帧牛顿迭代：引入收敛性风险，换取毫无意义的精度）。
 *
 * ⚠ 不要把 areaToHeight(f) 简化成 f —— 会静默摧毁末段可读性，且无任何测试报错。
 * 实测放大倍数：剩余 10% → 高度 15.6%（1.56×）；5% → 9.7%（1.95×）；1% → 3.3%（3.3×）。
 */

/** 池壁圆心 y 与半径（viewBox 单位，与 RingCountdown 共用） */
const CENTER = 180;
const R_WALL = 160;

/** 墨面行程：自池底到池顶的总位移 = 池直径 */
export const SURFACE_TRAVEL = 2 * R_WALL;

/** 查找表点数：101 点在 400px 上的高度误差 < 0.2px，足够 */
const LUT_N = 101;

/** 以 θ 均匀采样得到单调的 (f, h) 序列，再按 f 等距重采样为查找表 */
const LUT: Float64Array = (() => {
  const SAMPLES = 4096;
  const fs: number[] = [];
  const hs: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const theta = (i / SAMPLES) * 2 * Math.PI;
    fs.push((theta - Math.sin(theta)) / (2 * Math.PI));
    hs.push((1 - Math.cos(theta / 2)) / 2);
  }
  const table = new Float64Array(LUT_N);
  let j = 0;
  for (let k = 0; k < LUT_N; k++) {
    const f = k / (LUT_N - 1);
    while (j < SAMPLES && fs[j + 1] < f) j++;
    const f0 = fs[j];
    const f1 = fs[j + 1] ?? 1;
    const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
    table[k] = hs[j] + ((hs[j + 1] ?? 1) - hs[j]) * t;
  }
  table[0] = 0;
  table[LUT_N - 1] = 1;
  return table;
})();

/** 剩余面积占比 → 墨面高度占比（越界钳制到 [0,1]） */
export function areaToHeight(f: number): number {
  const clamped = Math.min(1, Math.max(0, f));
  const x = clamped * (LUT_N - 1);
  const i = Math.floor(x);
  if (i >= LUT_N - 1) return LUT[LUT_N - 1];
  return LUT[i] + (LUT[i + 1] - LUT[i]) * (x - i);
}

/** 剩余面积占比 → 墨面在 viewBox 中的 y 坐标（h=1 池顶 / h=0 池底） */
export function surfaceY(f: number): number {
  return CENTER + R_WALL - areaToHeight(f) * SURFACE_TRAVEL;
}
