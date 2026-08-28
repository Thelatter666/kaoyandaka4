import { describe, expect, it } from 'vitest';
import { pauseRemainingSeconds, sessionRemainingSeconds } from './focusPause';

describe('pauseRemainingSeconds', () => {
  it('自 pausedAt 起算,上限 300 秒', () => {
    expect(pauseRemainingSeconds(1_000_000, 1_000_000 + 120_000)).toBe(180);
  });

  it('超过 5 分钟归零,不为负', () => {
    expect(pauseRemainingSeconds(1_000_000, 1_000_000 + 400_000)).toBe(0);
  });
});

describe('sessionRemainingSeconds', () => {
  it('未暂停按当前时刻计算', () => {
    const end = 1_000_000 + 600_000;
    expect(sessionRemainingSeconds(end, null, 1_000_000)).toBe(600);
  });

  it('暂停中冻结在暂停时刻(学习时钟停走,ADR-0006)', () => {
    const pauseAt = 1_000_000;
    const end = pauseAt + 600_000;
    // 挂钟已前进 120 秒,剩余仍按暂停时刻冻结
    expect(sessionRemainingSeconds(end, pauseAt, pauseAt + 120_000)).toBe(600);
  });

  it('暂停中剩余不为负', () => {
    expect(sessionRemainingSeconds(1_000_000, 500_000, 2_000_000)).toBe(500);
  });
});
