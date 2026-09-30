import { describe, expect, it } from 'vitest';
import { CreateVocabCardSchema, UpdateVocabCardSchema, normalizeWord } from './vocab.js';

const content = {
  definitions: [{ pos: 'v.', meaning: '放弃' }],
  examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }],
};

describe('vocab schemas', () => {
  it('normalizeWord: trim + lowercase', () => {
    expect(normalizeWord('  Abandon ')).toBe('abandon');
  });
  it('CreateVocabCardSchema: 合法输入通过且 word 未强制小写（归一在调用方）', () => {
    expect(CreateVocabCardSchema.parse({ word: 'Abandon', content })).toMatchObject({ word: 'Abandon' });
  });
  it('CreateVocabCardSchema: 空 definitions 拒绝', () => {
    expect(() => CreateVocabCardSchema.parse({ word: 'a', content: { ...content, definitions: [] } })).toThrow();
  });
  it('CreateVocabCardSchema: content 缺省即暂存卡，通过', () => {
    const parsed = CreateVocabCardSchema.safeParse({ word: 'abandon' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.content).toBeUndefined();
  });
  it('UpdateVocabCardSchema: masteryLevel 与 reset 二选一', () => {
    expect(UpdateVocabCardSchema.safeParse({ masteryLevel: 3 }).success).toBe(true);
    expect(UpdateVocabCardSchema.safeParse({}).success).toBe(false);
    expect(UpdateVocabCardSchema.safeParse({ masteryLevel: 3, reset: true }).success).toBe(false);
  });
  it('UpdateVocabCardSchema: content 补全合法通过', () => {
    expect(UpdateVocabCardSchema.safeParse({ content }).success).toBe(true);
  });
  it('UpdateVocabCardSchema: content 必须取完整契约（空 definitions 拒绝）', () => {
    expect(UpdateVocabCardSchema.safeParse({ content: { ...content, definitions: [] } }).success).toBe(false);
  });
  it('UpdateVocabCardSchema: content 与 masteryLevel 同给拒绝', () => {
    expect(UpdateVocabCardSchema.safeParse({ content, masteryLevel: 3 }).success).toBe(false);
  });
  it('UpdateVocabCardSchema: 三者全无拒绝', () => {
    expect(UpdateVocabCardSchema.safeParse({}).success).toBe(false);
  });
});
