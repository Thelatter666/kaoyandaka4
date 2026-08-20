import { describe, it, expect } from 'vitest';
import { areaToHeight, surfaceY, SURFACE_TRAVEL } from './inkSurface';

describe('areaToHeight — 等面积映射（ADR-0003）', () => {
  it('边界钉死：空池与满池', () => {
    expect(areaToHeight(0)).toBe(0);
    expect(areaToHeight(1)).toBe(1);
  });

  it('中点严格对称：半池面积对应半池高度', () => {
    expect(areaToHeight(0.5)).toBeCloseTo(0.5, 6);
  });

  it('末段高度被放大（这正是本映射存在的理由）', () => {
    // 圆内弓形：面积 1% → 高度约 3.3%；5% → 约 9.7%；10% → 约 15.6%
    expect(areaToHeight(0.01)).toBeCloseTo(0.033, 2);
    expect(areaToHeight(0.05)).toBeCloseTo(0.097, 2);
    expect(areaToHeight(0.1)).toBeCloseTo(0.156, 2);
  });

  it('放大倍数随剩余减少而增大', () => {
    const k = (f: number) => areaToHeight(f) / f;
    expect(k(0.01)).toBeGreaterThan(k(0.05));
    expect(k(0.05)).toBeGreaterThan(k(0.1));
    expect(k(0.1)).toBeGreaterThan(1);
  });

  it('单调不减', () => {
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const h = areaToHeight(i / 200);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('越界输入被钳制', () => {
    expect(areaToHeight(-0.5)).toBe(0);
    expect(areaToHeight(1.5)).toBe(1);
  });
});

describe('surfaceY — 墨面 y 坐标', () => {
  it('满池在池顶，空池在池底', () => {
    expect(surfaceY(1)).toBeCloseTo(20, 6); // 180 + 160 - 320
    expect(surfaceY(0)).toBeCloseTo(340, 6); // 180 + 160
  });

  it('SURFACE_TRAVEL 为池直径', () => {
    expect(SURFACE_TRAVEL).toBe(320);
  });
});
