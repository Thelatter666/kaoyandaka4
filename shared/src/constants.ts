/**
 * 零依赖常量（不 import zod）。
 * 前端直接从这里导入，避免值导入把 zod 运行时拖入客户端 bundle。
 */

export const DURATION_QUICK_OPTIONS = [25, 45, 60] as const;
export const DURATION_STEP = 5;
export const DURATION_MIN = 5;
export const DURATION_MAX = 120;

export const SHORT_BREAK_MINUTES = 5;
export const LONG_BREAK_MINUTES = 15;
export const LONG_BREAK_AFTER_ROUNDS = 4;

/** 专注暂停单次上限（秒），到点自动恢复；暂停语义见 CONTEXT.md / ADR-0006 */
export const FOCUS_PAUSE_MAX_SECONDS = 300;

export const EXAM_DATE = '2026-12-20';
