import { describe, it, expect } from 'vitest';
import { WAVE_PATHS, WAVE_PERIOD_PX } from './inkWavePaths';

/** 从路径 d 中反解波幅：取绝对值 < 50 的 y 值极差的一半（排除闭合用的远点） */
function amplitudeOf(d: string): number {
  const ys = [...d.matchAll(/L (-?[\d.]+) (-?[\d.]+)/g)]
    .map((m) => parseFloat(m[2]))
    .filter((v) => Math.abs(v) < 50);
  return (Math.max(...ys) - Math.min(...ys)) / 2;
}

describe('WAVE_PATHS — 三变体波形预生成（spec §4.2）', () => {
  it('三个变体齐全', () => {
    expect(Object.keys(WAVE_PATHS).sort()).toEqual(['break', 'lowtime', 'normal']);
  });

  it('常态波幅：主波 5.8 / 副波 3.6', () => {
    expect(amplitudeOf(WAVE_PATHS.normal.inkA)).toBeCloseTo(5.8, 1);
    expect(amplitudeOf(WAVE_PATHS.normal.inkB)).toBeCloseTo(3.6, 1);
  });

  it('低时波幅为常态的 1.6 倍', () => {
    expect(amplitudeOf(WAVE_PATHS.lowtime.inkA)).toBeCloseTo(5.8 * 1.6, 1);
    expect(amplitudeOf(WAVE_PATHS.lowtime.inkB)).toBeCloseTo(3.6 * 1.6, 1);
  });

  it('休息波幅为常态的 1.25 倍', () => {
    expect(amplitudeOf(WAVE_PATHS.break.inkA)).toBeCloseTo(5.8 * 1.25, 1);
    expect(amplitudeOf(WAVE_PATHS.break.inkB)).toBeCloseTo(3.6 * 1.25, 1);
  });

  it('阳文裁剪边缘必须与主波同幅，否则阴阳互补失效', () => {
    for (const v of ['normal', 'lowtime', 'break'] as const) {
      expect(amplitudeOf(WAVE_PATHS[v].reliefA)).toBeCloseTo(amplitudeOf(WAVE_PATHS[v].inkA), 3);
    }
  });

  it('墨体向下闭合、阳文裁剪向上闭合（互补方向相反）', () => {
    expect(WAVE_PATHS.normal.inkA).toMatch(/^M -520 720 L /); // 向下延伸
    expect(WAVE_PATHS.normal.reliefA).toMatch(/^M -520 -720 L /); // 向上延伸
  });

  it('空间周期用于 CSS 无缝平移', () => {
    expect(WAVE_PERIOD_PX).toEqual({ A: 260, B: 180 });
  });
});
