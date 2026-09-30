/**
 * 单词本 LLM 客户端（浏览器直连 OpenAI 兼容 `/chat/completions`，原生 fetch，零新依赖）。
 *
 * 约定（见 spec §3）：
 * - 配置存 localStorage 设备级 `kaoyandaily-vocab-llm-config`，三字段（baseUrl/apiKey/model）
 *   均非空才算「已配置」；配置不进备份（含 apiKey）。
 * - 响应剥 ```json 围栏 → 契约校验；失败自动重试 1 次（附上次失败原因），仍失败抛
 *   `LlmError('contract')`；网络/CORS/401/429/超时分别归类，文案即用户提示。
 * - 契约校验手写而非复用 `@shared/schemas/vocab` 的 Zod schema：值导入会把 zod 运行时
 *   拖进前端产物，而 `e2e/check-perf-budget.mjs` 断言全部 assets/*.js 不含 "invalid_type"。
 *   校验规则与 `VocabContentSchema` 逐条对齐（含长度上限与未知键丢弃）。
 */

import type { VocabContent, VocabDefinition, VocabExample } from '@shared/types';

export interface VocabLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const VOCAB_LLM_CONFIG_KEY = 'kaoyandaily-vocab-llm-config';

export type LlmErrorKind = 'not_configured' | 'network' | 'unauthorized' | 'rate_limit' | 'contract' | 'cors';

export class LlmError extends Error {
  constructor(
    public kind: LlmErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export function loadLlmConfig(): VocabLlmConfig | null {
  try {
    const raw = localStorage.getItem(VOCAB_LLM_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VocabLlmConfig>;
    if (!parsed.baseUrl || !parsed.apiKey || !parsed.model) return null;
    return { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey, model: parsed.model };
  } catch {
    return null;
  }
}

export function saveLlmConfig(config: VocabLlmConfig): void {
  localStorage.setItem(VOCAB_LLM_CONFIG_KEY, JSON.stringify(config));
}

/** 剥 ```json 围栏（无围栏时原样 trim；围栏外有杂文时取围栏内内容） */
export function extractJsonContent(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : raw).trim();
}

export const VOCAB_SYSTEM_PROMPT = `你是一位考研英语辅导老师。用户会给你一个英语单词或短语，请输出考研备考者需要的单词详解。
只输出一个 JSON 对象，不要输出任何解释、不要使用 Markdown 代码围栏。JSON 结构：
{"phonetic":"美式音标，如 /əˈbændən/，查不到给 null",
 "definitions":[{"pos":"词性缩写如 v./n./adj.","meaning":"简明中文释义，考研核心义在前"}],
 "examples":[{"en":"英文例句，风格贴近考研真题长难句","zh":"对应的准确中文翻译"}],
 "extra":"Markdown 字符串：词根词缀拆解、2-4 组高频易混词辨析、一句话记忆法；没有可靠内容给 null",
 "examFreq":"该词在考研英语中的考频：高 / 中 / 低，不确定给 null"}
要求：definitions 覆盖该词全部常用词性（1-10 条）；examples 给 1-10 条；字符串内不得出现未转义的换行。`;

/* ---- 契约校验（VocabContentSchema 的等价手写实现） ---- */

/** 契约违规：仅用于内部失败原因传递 */
class ContentViolation extends Error {}

const EXAM_FREQS = ['高', '中', '低'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0) throw new ContentViolation(`${path} 必须为非空字符串`);
  if (value.length > max) throw new ContentViolation(`${path} 长度不得超过 ${max}`);
  return value;
}

function optionalString(value: unknown, path: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, path, max);
}

function requireArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new ContentViolation(`${path} 必须为非空数组`);
  if (value.length > max) throw new ContentViolation(`${path} 最多 ${max} 条`);
  return value;
}

function parseDefinition(value: unknown, path: string): VocabDefinition {
  if (!isPlainObject(value)) throw new ContentViolation(`${path} 必须为对象`);
  return { pos: requireString(value.pos, `${path}.pos`, 30), meaning: requireString(value.meaning, `${path}.meaning`, 500) };
}

function parseExample(value: unknown, path: string): VocabExample {
  if (!isPlainObject(value)) throw new ContentViolation(`${path} 必须为对象`);
  return { en: requireString(value.en, `${path}.en`, 1000), zh: requireString(value.zh, `${path}.zh`, 1000) };
}

/** LLM 输出契约 = VocabContentSchema：未知键丢弃，可选字段缺省归一为 null */
function parseVocabContent(value: unknown): VocabContent {
  if (!isPlainObject(value)) throw new ContentViolation('响应必须为 JSON 对象');
  const definitions = requireArray(value.definitions, 'definitions', 10).map((d, i) => parseDefinition(d, `definitions[${i}]`));
  const examples = requireArray(value.examples, 'examples', 10).map((e, i) => parseExample(e, `examples[${i}]`));
  let examFreq: VocabContent['examFreq'] = null;
  if (value.examFreq !== undefined && value.examFreq !== null) {
    if (typeof value.examFreq !== 'string' || !(EXAM_FREQS as readonly string[]).includes(value.examFreq)) {
      throw new ContentViolation('examFreq 必须为 高/中/低 或 null');
    }
    examFreq = value.examFreq as VocabContent['examFreq'];
  }
  return {
    phonetic: optionalString(value.phonetic, 'phonetic', 100),
    definitions,
    examples,
    extra: optionalString(value.extra, 'extra', 20000),
    examFreq,
  };
}

function parseContent(raw: string): VocabContent | null {
  try {
    return parseVocabContent(JSON.parse(extractJsonContent(raw)));
  } catch {
    return null;
  }
}

/** 契约失败原因（拼进重试消息；解析成功时不会调用） */
function failureReason(raw: string): string {
  try {
    parseVocabContent(JSON.parse(extractJsonContent(raw)));
    return '未知';
  } catch (err) {
    return (err as Error).message.slice(0, 300);
  }
}

interface ChatMessage {
  role: string;
  content: string;
}

/** 查词：30 秒超时 + 契约失败自动重试 1 次；错误分类见 LlmErrorKind */
export async function lookupWord(config: VocabLlmConfig, word: string, signal?: AbortSignal): Promise<VocabContent> {
  const base = config.baseUrl.replace(/\/+$/, '');
  const call = async (messages: ChatMessage[]): Promise<string> => {
    const timeout = AbortSignal.timeout(30_000);
    const combined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, temperature: 0.3 }),
        signal: combined,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      if ((err as Error).name === 'TimeoutError') throw new LlmError('network', '请求超时（30 秒），请检查网络或服务商状态');
      throw new LlmError('cors', '无法连接 LLM 服务：该服务商可能不允许浏览器直连（CORS），或地址/网络有误');
    }
    if (res.status === 401 || res.status === 403) throw new LlmError('unauthorized', `API Key 无效或无权限（HTTP ${res.status}）`);
    if (res.status === 429) throw new LlmError('rate_limit', '触发服务商限流（HTTP 429），请稍后重试');
    if (!res.ok) throw new LlmError('network', `服务商返回 HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: VOCAB_SYSTEM_PROMPT },
    { role: 'user', content: word },
  ];
  const first = await call(messages);
  const parsed = parseContent(first);
  if (parsed) return parsed;
  const retry = await call([
    ...messages,
    { role: 'assistant', content: first },
    { role: 'user', content: `你上次的输出不符合 JSON 契约（${failureReason(first)}）。请严格按要求重新输出纯 JSON。` },
  ]);
  const retried = parseContent(retry);
  if (retried) return retried;
  throw new LlmError('contract', 'LLM 两次输出都不符合词卡 JSON 契约，请更换模型或重试');
}
