import { VOCAB_MASTERY_MAX, VOCAB_SRS_INTERVALS } from './constants.js';
import type { ReviewGrade, VocabCard } from './schemas/vocab.js';

export interface SrsState {
  masteryLevel: number; intervalDays: number; nextReviewDate: string;
  isMastered: boolean; correctCount: number; wrongCount: number;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyReview(state: SrsState, grade: ReviewGrade, today: string): SrsState {
  const correctCount = state.correctCount + (grade === 'known' ? 1 : 0);
  const wrongCount = state.wrongCount + (grade === 'unknown' ? 1 : 0);
  if (grade === 'known') {
    const masteryLevel = Math.min(VOCAB_MASTERY_MAX, state.masteryLevel + 1);
    const intervalDays = VOCAB_SRS_INTERVALS[masteryLevel];
    return {
      masteryLevel, intervalDays, nextReviewDate: addDays(today, intervalDays),
      isMastered: masteryLevel === VOCAB_MASTERY_MAX, correctCount, wrongCount,
    };
  }
  if (grade === 'fuzzy') {
    return { ...state, intervalDays: 1, nextReviewDate: addDays(today, 1), correctCount, wrongCount };
  }
  return {
    masteryLevel: Math.max(0, state.masteryLevel - 2), intervalDays: 0, nextReviewDate: today,
    isMastered: false, correctCount, wrongCount,
  };
}

export function buildReviewQueue(cards: VocabCard[], today: string, quota: number | null) {
  const newCards = cards
    .filter((c) => c.firstLearnedAt === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dueCards = cards
    .filter((c) => c.firstLearnedAt !== null && !c.isMastered && c.nextReviewDate <= today)
    .sort((a, b) => a.masteryLevel - b.masteryLevel || a.nextReviewDate.localeCompare(b.nextReviewDate));
  if (quota === null) return { newCards, dueCards };
  const newTaken = newCards.slice(0, quota);
  const dueTaken = dueCards.slice(0, Math.max(0, quota - newTaken.length));
  return { newCards: newTaken, dueCards: dueTaken };
}
