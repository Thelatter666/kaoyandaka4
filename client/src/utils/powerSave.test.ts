import { describe, it, expect } from 'vitest';
import { parsePowerSave, resolveShouldReduceMotion } from './powerSave';

/**
 * 节能模式纯函数（DOM 侧读写依赖浏览器，按仓库惯例下沉到 e2e/tests/power-save.spec.ts 验）
 */
describe('parsePowerSave', () => {
  it("仅 'on' 视为开启", () => {
    expect(parsePowerSave('on')).toBe(true);
  });

  it('其余值一律关闭（含 null / 空串 / 未知值）', () => {
    expect(parsePowerSave(null)).toBe(false);
    expect(parsePowerSave('')).toBe(false);
    expect(parsePowerSave('off')).toBe(false);
    expect(parsePowerSave('ON')).toBe(false);
    expect(parsePowerSave('true')).toBe(false);
  });
});

describe('resolveShouldReduceMotion', () => {
  it('任一来源成立即降级（节能模式是 prefers-reduced-motion 的超集）', () => {
    expect(resolveShouldReduceMotion(false, false)).toBe(false);
    expect(resolveShouldReduceMotion(true, false)).toBe(true);
    expect(resolveShouldReduceMotion(false, true)).toBe(true);
    expect(resolveShouldReduceMotion(true, true)).toBe(true);
  });
});
