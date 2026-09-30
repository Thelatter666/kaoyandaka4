import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VocabContent } from '@shared/types';
import { createLocalAccount, setActiveLocalAccount } from '../local/accounts';
import { resetDb } from '../local/db';
import { setLocalContext, setLocalMode } from '../local/mode';
import { ApiError } from './client';
import { vocabApi } from './vocab';

const content: VocabContent = {
  phonetic: '/əˈbændən/',
  definitions: [{ pos: 'v.', meaning: '放弃；抛弃' }],
  examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }],
  extra: null,
  examFreq: '高',
};

beforeEach(async () => {
  await resetDb();
  setLocalContext(false);
  setLocalMode(false);
  const account = await createLocalAccount('vocab-api@example.com');
  setActiveLocalAccount(account);
  setLocalMode(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLocalMode(false);
  setLocalContext(false);
});

describe('vocabApi（双模式）', () => {
  it('本地模式：六方法走 IndexedDB；重复词转 ApiError(409, WORD_EXISTS)', async () => {
    const created = await vocabApi.create({ word: ' Abandon ', content });
    expect(created.word).toBe('abandon');
    expect(created).not.toHaveProperty('accountId');
    expect((await vocabApi.list()).map((c) => c.word)).toEqual(['abandon']);

    const conflict = await vocabApi.create({ word: 'ABANDON', content }).then(
      () => null,
      (e: unknown) => e
    );
    expect(conflict).toBeInstanceOf(ApiError);
    expect(conflict as ApiError).toMatchObject({ status: 409, code: 'WORD_EXISTS' });

    const learned = await vocabApi.learn(created.id);
    expect(learned.firstLearnedAt).not.toBeNull();
    expect((await vocabApi.learn(created.id)).firstLearnedAt).toBe(learned.firstLearnedAt);

    const reviewed = await vocabApi.review(created.id, 'known');
    expect(reviewed).toMatchObject({ masteryLevel: 1, intervalDays: 1, correctCount: 1 });

    const updated = await vocabApi.update(created.id, { masteryLevel: 5 });
    expect(updated).toMatchObject({ masteryLevel: 5, intervalDays: 15, isMastered: true });

    await vocabApi.remove(created.id);
    expect(await vocabApi.list()).toHaveLength(0);
  });

  it('服务器模式：URL/方法与服务器路由一致，create 入口归一 word', async () => {
    setLocalMode(false);
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () =>
        ({
          ok: true,
          status: 201,
          json: async () => ({ id: 'srv-1', word: 'abandon' }),
        }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);

    await vocabApi.create({ word: ' ABANDON ', content });
    await vocabApi.review('srv-1', 'known');
    await vocabApi.learn('srv-1');
    await vocabApi.update('srv-1', { reset: true });
    await vocabApi.remove('srv-1');
    await vocabApi.list();

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    }));
    expect(calls).toEqual([
      { url: '/api/v1/vocab', method: 'POST', body: JSON.stringify({ word: 'abandon', content }) },
      { url: '/api/v1/vocab/srv-1/review', method: 'POST', body: JSON.stringify('known') },
      { url: '/api/v1/vocab/srv-1/learn', method: 'POST', body: '{}' },
      { url: '/api/v1/vocab/srv-1', method: 'PATCH', body: JSON.stringify({ reset: true }) },
      { url: '/api/v1/vocab/srv-1', method: 'DELETE', body: undefined },
      { url: '/api/v1/vocab', method: 'GET', body: undefined },
    ]);
  });
});
