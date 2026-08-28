import { FOCUS_PAUSE_MAX_SECONDS } from '@shared/constants';

/** 暂停剩余秒数：自 pausedAt 起算，上限 FOCUS_PAUSE_MAX_SECONDS（5 分钟，到点自动恢复） */
export function pauseRemainingSeconds(pausedAtMs: number, nowMs: number): number {
  return Math.max(0, FOCUS_PAUSE_MAX_SECONDS - Math.floor((nowMs - pausedAtMs) / 1000));
}

/** 会话剩余秒数：暂停中冻结在暂停时刻（学习时钟停走，ADR-0006）；未暂停按当前时刻 */
export function sessionRemainingSeconds(
  plannedEndAtMs: number,
  pausedAtMs: number | null,
  nowMs: number
): number {
  const referenceMs = pausedAtMs ?? nowMs;
  return Math.max(0, Math.round((plannedEndAtMs - referenceMs) / 1000));
}
