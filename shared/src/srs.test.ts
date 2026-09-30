import { describe, expect, it } from 'vitest';
import { applyReview, buildReviewQueue } from './srs.js';
import type { VocabCard } from './schemas/vocab.js';

const base = { masteryLevel: 0, intervalDays: 0, nextReviewDate: '2026-09-30', isMastered: false, correctCount: 0, wrongCount: 0 };

describe('applyReview', () => {
  it('known: 升档并按新档间隔安排', () => {
    expect(applyReview(base, 'known', '2026-09-30')).toEqual({
      masteryLevel: 1, intervalDays: 1, nextReviewDate: '2026-10-01', isMastered: false, correctCount: 1, wrongCount: 0,
    });
  });
  it('known: 4 档答对毕业，间隔取 SRS_INTERVALS[5]=15', () => {
    expect(applyReview({ ...base, masteryLevel: 4, intervalDays: 7 }, 'known', '2026-09-30')).toMatchObject({
      masteryLevel: 5, intervalDays: 15, nextReviewDate: '2026-10-15', isMastered: true,
    });
  });
  it('known: 5 档封顶不再升、保持毕业', () => {
    expect(applyReview({ ...base, masteryLevel: 5, isMastered: true, correctCount: 9 }, 'known', '2026-09-30'))
      .toMatchObject({ masteryLevel: 5, isMastered: true, correctCount: 10 });
  });
  it('fuzzy: 档位不变、间隔重置 1 天、不计对错', () => {
    expect(applyReview({ ...base, masteryLevel: 3, correctCount: 2 }, 'fuzzy', '2026-09-30')).toEqual({
      masteryLevel: 3, intervalDays: 1, nextReviewDate: '2026-10-01', isMastered: false, correctCount: 2, wrongCount: 0,
    });
  });
  it('unknown: 降 2 档下限 0、当天到期、计错', () => {
    expect(applyReview({ ...base, masteryLevel: 1 }, 'unknown', '2026-09-30')).toEqual({
      masteryLevel: 0, intervalDays: 0, nextReviewDate: '2026-09-30', isMastered: false, correctCount: 0, wrongCount: 1,
    });
  });
});

const mkCard = (over: Partial<VocabCard>): VocabCard => ({
  id: 'x', word: 'w', phonetic: null,
  definitions: [{ pos: 'n.', meaning: 'm' }], examples: [{ en: 'a', zh: 'b' }],
  extra: null, examFreq: null, masteryLevel: 0, intervalDays: 0,
  nextReviewDate: '2026-09-30', isMastered: false, firstLearnedAt: null,
  correctCount: 0, wrongCount: 0, lastReviewedAt: null,
  createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', ...over,
});

describe('buildReviewQueue', () => {
  it('新词区=未首学，按 createdAt 升序；到期区=已首学未毕业且到期，按掌握档升序、同级按到期日', () => {
    const cards = [
      mkCard({ id: 'due-m2', firstLearnedAt: '2026-09-29T00:00:00.000Z', masteryLevel: 2 }),
      mkCard({ id: 'new-2', createdAt: '2026-09-30T02:00:00.000Z' }),
      mkCard({ id: 'due-m0', firstLearnedAt: '2026-09-29T00:00:00.000Z', masteryLevel: 0 }),
      mkCard({ id: 'mastered', firstLearnedAt: '2026-09-29T00:00:00.000Z', isMastered: true }),
      mkCard({ id: 'new-1', createdAt: '2026-09-30T01:00:00.000Z' }),
      mkCard({ id: 'future', firstLearnedAt: '2026-09-29T00:00:00.000Z', nextReviewDate: '2026-10-01' }),
    ];
    const q = buildReviewQueue(cards, '2026-09-30', null);
    expect(q.newCards.map((c) => c.id)).toEqual(['new-1', 'new-2']);
    expect(q.dueCards.map((c) => c.id)).toEqual(['due-m0', 'due-m2']);
  });
  it('配额截断：新词优先占额度，余量给到期词', () => {
    const cards = [
      mkCard({ id: 'n1' }), mkCard({ id: 'n2' }),
      mkCard({ id: 'd1', firstLearnedAt: 'x' }), mkCard({ id: 'd2', firstLearnedAt: 'x' }),
    ];
    expect(buildReviewQueue(cards, '2026-09-30', 3)).toEqual({
      newCards: [expect.objectContaining({ id: 'n1' }), expect.objectContaining({ id: 'n2' })],
      dueCards: [expect.objectContaining({ id: 'd1' })],
    });
  });
});
