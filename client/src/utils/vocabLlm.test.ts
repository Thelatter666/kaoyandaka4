import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOCAB_BATCH_MAX } from '@shared/constants';
import type { VocabContent } from '@shared/types';
import {
  DEFAULT_EXTRA_REQUIREMENT,
  LlmError,
  VOCAB_LLM_CONFIG_KEY,
  VOCAB_PROMPT_STORE_KEY,
  VOCAB_SYSTEM_PROMPT,
  buildVocabSystemPrompt,
  extractJsonContent,
  getActiveExtraRequirement,
  loadLlmConfig,
  loadPromptStore,
  lookupWord,
  parseWordList,
  saveLlmConfig,
  savePromptStore,
  testLlmConnection,
  type VocabLlmConfig,
  type VocabPromptStore,
} from './vocabLlm';

/* ---- 测试替身：内存 localStorage + fetch mock（node 环境无浏览器存储） ---- */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  };
}

const config: VocabLlmConfig = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'deepseek-chat' };

const validContent: VocabContent = {
  phonetic: '/əˈbændən/',
  definitions: [{ pos: 'v.', meaning: '放弃；抛弃' }],
  examples: [{ en: 'He abandoned the plan.', zh: '他放弃了计划。' }],
  extra: 'ab-（离开）+ band（束缚）',
  examFreq: '高',
};

function chatResponse(content: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(...responses: Array<Response | Error>): void {
  fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error('fetch mock 调用次数超出预期');
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
}

/** 取拒绝原因（并断言确为 LlmError） */
async function catchLlmError(promise: Promise<unknown>): Promise<LlmError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(LlmError);
  return err as LlmError;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadLlmConfig / saveLlmConfig', () => {
  it('无配置 / 缺字段 / JSON 损坏 → null（三字段均非空才算已配置）', () => {
    expect(loadLlmConfig()).toBeNull();
    localStorage.setItem(VOCAB_LLM_CONFIG_KEY, JSON.stringify({ baseUrl: 'https://x/v1', apiKey: 'k' }));
    expect(loadLlmConfig()).toBeNull();
    localStorage.setItem(VOCAB_LLM_CONFIG_KEY, JSON.stringify({ baseUrl: '', apiKey: 'k', model: 'm' }));
    expect(loadLlmConfig()).toBeNull();
    localStorage.setItem(VOCAB_LLM_CONFIG_KEY, 'not-json');
    expect(loadLlmConfig()).toBeNull();
  });

  it('完整三字段 → 原样返回；save 后 load 往返一致', () => {
    saveLlmConfig(config);
    expect(JSON.parse(localStorage.getItem(VOCAB_LLM_CONFIG_KEY) as string)).toEqual(config);
    expect(loadLlmConfig()).toEqual(config);
  });
});

describe('extractJsonContent', () => {
  it('无围栏：原样 trim', () => {
    expect(extractJsonContent('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('```json 围栏：剥出内容', () => {
    expect(extractJsonContent('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonContent('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('围栏前后有解释文字：只取围栏内', () => {
    expect(extractJsonContent('好的，结果如下：\n```json\n{"a":1}\n```\n以上。')).toBe('{"a":1}');
  });

  it('<think> 思维链块：先剥离再取 JSON（含大小写与无围栏两种形态）', () => {
    expect(extractJsonContent('<think>思考过程</think>{"a":1}')).toBe('{"a":1}');
    expect(extractJsonContent('<THINK>思考\n过程</THINK>\n{"a":1}\n')).toBe('{"a":1}');
    expect(extractJsonContent('<think>先想一下</think>\n```json\n{"a":1}\n```\n<think>再检查</think>')).toBe('{"a":1}');
  });
});

describe('buildVocabSystemPrompt', () => {
  it('默认构建：含契约骨架与默认 extra 要求，且等于向后兼容的 VOCAB_SYSTEM_PROMPT', () => {
    const prompt = buildVocabSystemPrompt();
    // 契约骨架（JSON 结构与数量/格式要求）由代码持有
    expect(prompt).toContain('只输出一个 JSON 对象');
    expect(prompt).toContain('"definitions"');
    expect(prompt).toContain('"examples"');
    expect(prompt).toContain('"examFreq"');
    // JSON 示例里 extra 的描述中性化，具体内容要求只在末尾用户段落
    expect(prompt).toContain('"extra":"Markdown 字符串，没有可靠内容给 null"');
    expect(prompt).toContain(`extra 部分的要求：${DEFAULT_EXTRA_REQUIREMENT}`);
    expect(prompt).toBe(VOCAB_SYSTEM_PROMPT);
    expect(buildVocabSystemPrompt(null)).toBe(VOCAB_SYSTEM_PROMPT);
  });

  it('自定义 extra：仅末尾要求段被替换、骨架不变；空白值回落默认', () => {
    const custom = buildVocabSystemPrompt('只讲词根');
    expect(custom).toContain('extra 部分的要求：只讲词根');
    expect(custom).not.toContain(DEFAULT_EXTRA_REQUIREMENT);
    expect(custom).toContain('只输出一个 JSON 对象');
    expect(custom).toContain('"definitions"');

    expect(buildVocabSystemPrompt('  ')).toBe(VOCAB_SYSTEM_PROMPT);
    expect(buildVocabSystemPrompt('  只讲词根  ')).toContain('extra 部分的要求：只讲词根');
  });
});

describe('提示词预设存储（loadPromptStore / savePromptStore / getActiveExtraRequirement）', () => {
  const store: VocabPromptStore = {
    presets: [{ id: 'p1', name: '只讲词根', extraRequirement: '只讲词根词缀拆解' }],
    activeId: 'p1',
  };

  it('save 后 load 往返一致；非法预设被丢弃、activeId 非字符串回落 null', () => {
    savePromptStore(store);
    expect(JSON.parse(localStorage.getItem(VOCAB_PROMPT_STORE_KEY) as string)).toEqual(store);
    expect(loadPromptStore()).toEqual(store);

    localStorage.setItem(
      VOCAB_PROMPT_STORE_KEY,
      JSON.stringify({ presets: [store.presets[0], { id: 'bad', name: 1 }, null], activeId: 42 })
    );
    expect(loadPromptStore()).toEqual({ presets: [store.presets[0]], activeId: null });
  });

  it('无存储 / 坏 JSON / 非对象结构 → 空 store', () => {
    expect(loadPromptStore()).toEqual({ presets: [], activeId: null });
    localStorage.setItem(VOCAB_PROMPT_STORE_KEY, 'not-json');
    expect(loadPromptStore()).toEqual({ presets: [], activeId: null });
    localStorage.setItem(VOCAB_PROMPT_STORE_KEY, '"presets"');
    expect(loadPromptStore()).toEqual({ presets: [], activeId: null });
    localStorage.setItem(VOCAB_PROMPT_STORE_KEY, JSON.stringify({ presets: 'x' }));
    expect(loadPromptStore()).toEqual({ presets: [], activeId: null });
  });

  it('getActiveExtraRequirement：命中返回 / 指向不存在的预设或缺失 activeId 回落 null', () => {
    expect(getActiveExtraRequirement()).toBeNull();
    savePromptStore(store);
    expect(getActiveExtraRequirement()).toBe('只讲词根词缀拆解');
    savePromptStore({ ...store, activeId: 'ghost' });
    expect(getActiveExtraRequirement()).toBeNull();
    savePromptStore({ ...store, activeId: null });
    expect(getActiveExtraRequirement()).toBeNull();
  });
});

describe('parseWordList', () => {
  it('切分（空格/换行/中英文逗号分号）→ 小写归一 → 去空 → 保序去重', () => {
    expect(parseWordList('abandon, Benefit\nabandon;  x  ')).toEqual({
      words: ['abandon', 'benefit', 'x'],
      truncated: 0,
    });
    expect(parseWordList('one，two；three four')).toEqual({ words: ['one', 'two', 'three', 'four'], truncated: 0 });
  });

  it('空输入 / 纯分隔符 → 空列表', () => {
    expect(parseWordList('')).toEqual({ words: [], truncated: 0 });
    expect(parseWordList('  ,;，；\n ')).toEqual({ words: [], truncated: 0 });
  });

  it('超长项（>100 字符）丢弃，100 字符边界保留', () => {
    const kept = 'a'.repeat(100);
    const dropped = 'b'.repeat(101);
    expect(parseWordList(`${kept} ${dropped}`)).toEqual({ words: [kept], truncated: 0 });
  });

  it('显式 max 超限截断：保序取前 max 个并返回截断数；未超限 truncated 为 0', () => {
    expect(parseWordList('a b c d', 2)).toEqual({ words: ['a', 'b'], truncated: 2 });
    expect(parseWordList('a b', 2)).toEqual({ words: ['a', 'b'], truncated: 0 });
  });

  it('默认 max = VOCAB_BATCH_MAX（20）', () => {
    const raw = Array.from({ length: VOCAB_BATCH_MAX + 3 }, (_, i) => `w${i}`).join(' ');
    const { words, truncated } = parseWordList(raw);
    expect(words).toHaveLength(VOCAB_BATCH_MAX);
    expect(truncated).toBe(3);
  });
});

describe('lookupWord', () => {
  it('成功路径：请求形状正确 + 契约校验通过（缺省字段归一为 null）', async () => {
    stubFetch(chatResponse(JSON.stringify({ definitions: validContent.definitions, examples: validContent.examples })));
    const result = await lookupWord(config, 'abandon');
    expect(result).toEqual({
      phonetic: null,
      definitions: validContent.definitions,
      examples: validContent.examples,
      extra: null,
      examFreq: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // baseUrl 末尾斜杠被剥掉，避免双斜杠
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string) as {
      model: string;
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('deepseek-chat');
    expect(body.temperature).toBe(0.3);
    // 契约同时放 system 与 user：部分网关会丢弃 system，仅 system 携带契约时模型会跑偏
    expect(body.messages[0]).toEqual({ role: 'system', content: VOCAB_SYSTEM_PROMPT });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('考研英语辅导老师');
    expect(body.messages[1].content).toContain(VOCAB_SYSTEM_PROMPT);
    expect(body.messages[1].content).toContain('现在查询单词：abandon');
  });

  it('激活预设生效：system 与 user 消息均为自定义 extra 要求构建的提示词（骨架仍在）', async () => {
    const extraRequirement = '只讲词根词缀拆解，不要辨析和记忆法';
    savePromptStore({ presets: [{ id: 'p1', name: '只讲词根', extraRequirement }], activeId: 'p1' });
    stubFetch(chatResponse(JSON.stringify(validContent)));
    await expect(lookupWord(config, 'abandon')).resolves.toEqual(validContent);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const expected = buildVocabSystemPrompt(extraRequirement);
    expect(body.messages[0]).toEqual({ role: 'system', content: expected });
    expect(body.messages[1].content).toContain(expected);
    expect(body.messages[1].content).toContain('现在查询单词：abandon');
    expect(body.messages[0].content).toContain(extraRequirement);
    expect(body.messages[0].content).not.toContain(DEFAULT_EXTRA_REQUIREMENT);
    expect(body.messages[0].content).toContain('只输出一个 JSON 对象');
  });

  it('activeId 指向不存在的预设 → 回落默认提示词', async () => {
    savePromptStore({ presets: [], activeId: 'ghost' });
    stubFetch(chatResponse(JSON.stringify(validContent)));
    await lookupWord(config, 'abandon');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]).toEqual({ role: 'system', content: VOCAB_SYSTEM_PROMPT });
  });

  it('剥围栏后校验：围栏包裹的合法 JSON 直接通过', async () => {
    stubFetch(chatResponse('```json\n' + JSON.stringify(validContent) + '\n```'));
    await expect(lookupWord(config, 'abandon')).resolves.toEqual(validContent);
  });

  it('<think> 思维链混入 content：剥离后正常解析', async () => {
    stubFetch(chatResponse(`<think>用户想查 abandon，先回忆词根…</think>${JSON.stringify(validContent)}`));
    await expect(lookupWord(config, 'abandon')).resolves.toEqual(validContent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('契约违规一次后重试成功：第二次消息附上次失败原因', async () => {
    stubFetch(chatResponse('当然可以！这是结果：'), chatResponse(JSON.stringify(validContent)));
    await expect(lookupWord(config, 'abandon')).resolves.toEqual(validContent);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(retryBody.messages).toHaveLength(4);
    expect(retryBody.messages[2]).toEqual({ role: 'assistant', content: '当然可以！这是结果：' });
    expect(retryBody.messages[3].content).toContain('不符合 JSON 契约');
    expect(retryBody.messages[3].content).toContain('重新输出纯 JSON');
  });

  it('两次输出都不是合法 JSON → LlmError(contract)', async () => {
    stubFetch(chatResponse('不是 JSON'), chatResponse('仍不是 JSON'));
    const err = await catchLlmError(lookupWord(config, 'abandon'));
    expect(err.kind).toBe('contract');
    expect(err.message).toContain('两次输出都不符合');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('JSON 合法但缺 definitions → 视为契约违规（重试后 contract）', async () => {
    stubFetch(chatResponse(JSON.stringify({ examples: validContent.examples })), chatResponse(JSON.stringify({ definitions: [] })));
    const err = await catchLlmError(lookupWord(config, 'abandon'));
    expect(err.kind).toBe('contract');
  });

  it('401/403 → LlmError(unauthorized)', async () => {
    stubFetch(chatResponse('', 401));
    const err = await catchLlmError(lookupWord(config, 'abandon'));
    expect(err.kind).toBe('unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 → LlmError(rate_limit)；其他非 2xx → network', async () => {
    stubFetch(chatResponse('', 429));
    expect((await catchLlmError(lookupWord(config, 'abandon'))).kind).toBe('rate_limit');

    stubFetch(chatResponse('', 500));
    expect((await catchLlmError(lookupWord(config, 'abandon'))).kind).toBe('network');
  });

  it('fetch 抛网络/CORS 异常 → LlmError(cors)；AbortError 原样透传', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect((await catchLlmError(lookupWord(config, 'abandon'))).kind).toBe('cors');

    // 调用方主动 abort（如关闭弹窗）：不包装成 LlmError，原样抛出供 UI 忽略
    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    stubFetch(abortErr);
    const err = await lookupWord(config, 'abandon').then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBe(abortErr);
  });
});

describe('testLlmConnection', () => {
  it('成功：POST 最小对话（不带 temperature/思考参数），HTTP 2xx 即成功（content 为空也通过）', async () => {
    stubFetch(chatResponse(''));
    await expect(testLlmConnection(config)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: '回复 ok' }],
      max_tokens: 64,
    });
  });

  it('401/403 → unauthorized；429 → rate_limit；500 → network', async () => {
    stubFetch(chatResponse('', 401));
    expect((await catchLlmError(testLlmConnection(config))).kind).toBe('unauthorized');

    stubFetch(chatResponse('', 403));
    expect((await catchLlmError(testLlmConnection(config))).kind).toBe('unauthorized');

    stubFetch(chatResponse('', 429));
    expect((await catchLlmError(testLlmConnection(config))).kind).toBe('rate_limit');

    stubFetch(chatResponse('', 500));
    expect((await catchLlmError(testLlmConnection(config))).kind).toBe('network');
  });

  it('网络异常 → cors；超时 TimeoutError → network（15 秒文案）；调用方 AbortError 原样透传', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect((await catchLlmError(testLlmConnection(config))).kind).toBe('cors');

    const timeoutErr = new Error('The operation was aborted due to timeout');
    timeoutErr.name = 'TimeoutError';
    stubFetch(timeoutErr);
    const err = await catchLlmError(testLlmConnection(config));
    expect(err.kind).toBe('network');
    expect(err.message).toContain('15 秒');

    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    stubFetch(abortErr);
    const passed = await testLlmConnection(config).then(
      () => null,
      (e: unknown) => e
    );
    expect(passed).toBe(abortErr);
  });
});
