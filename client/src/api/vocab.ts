import type { CreateVocabCardInput, ReviewGrade, UpdateVocabCardInput, VocabCard } from '@shared/types';
import { localStore } from '../local/localStore';
import { isLocalMode } from '../local/mode';
import { normalizeWord } from '../local/types';
import { ApiError, api } from './client';

/**
 * 词库 API（双模式）：服务器模式走 /api/v1/vocab，本地模式走 IndexedDB。
 * - 重复词：服务器 UNIQUE(user_id, word) → 409 WORD_EXISTS；本地 create 抛
 *   Error('WORD_EXISTS')，在本层统一转成同形状的 ApiError(409, 'WORD_EXISTS', ...)，
 *   保证两条路径对 UI 的错误语义一致。
 * - word 在入口归一（trim+lowercase），与服务器 normalizeWord 幂等叠加。
 */
function rethrowLocalConflict(err: unknown): unknown {
  if (err instanceof Error && err.message === 'WORD_EXISTS') {
    return new ApiError(409, 'WORD_EXISTS', '该单词已在词库中');
  }
  return err;
}

export const vocabApi = {
  async list(): Promise<VocabCard[]> {
    if (isLocalMode()) return localStore.vocab.list();
    return api.get<VocabCard[]>('/vocab');
  },

  async create(input: CreateVocabCardInput): Promise<VocabCard> {
    const body: CreateVocabCardInput = { word: normalizeWord(input.word), content: input.content };
    if (isLocalMode()) {
      try {
        return await localStore.vocab.create(body);
      } catch (err) {
        throw rethrowLocalConflict(err);
      }
    }
    return api.post<VocabCard>('/vocab', body);
  },

  async update(id: string, patch: UpdateVocabCardInput): Promise<VocabCard> {
    if (isLocalMode()) return localStore.vocab.update(id, patch);
    return api.patch<VocabCard>(`/vocab/${id}`, patch);
  },

  async remove(id: string): Promise<void> {
    if (isLocalMode()) {
      await localStore.vocab.remove(id);
      return;
    }
    await api.delete(`/vocab/${id}`);
  },

  async review(id: string, grade: ReviewGrade): Promise<VocabCard> {
    if (isLocalMode()) return localStore.vocab.review(id, grade);
    return api.post<VocabCard>(`/vocab/${id}/review`, grade);
  },

  async learn(id: string): Promise<VocabCard> {
    if (isLocalMode()) return localStore.vocab.learn(id);
    return api.post<VocabCard>(`/vocab/${id}/learn`, {});
  },
};
