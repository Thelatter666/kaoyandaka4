/**
 * 单词本 E2E（浏览器行为侧）
 *
 * 不调真 LLM：进场走本地模式（`#/local` 新建账户），再向 IndexedDB `kaoyandaily_local`
 * 的 `vocabCards` 播种两张卡（一条新词 + 一条已学到期），经顶部导航进入单词本走完整复习流。
 * 第二个用例不开 LLM：把配置写成不可达地址，验「查词失败 → 暂存空卡 → 待补全」支路。
 * 第三个用例同样不调真 LLM：localStorage 写入生效中的提示词预设 + 死地址配置，验
 * 「预设选中态 → 批量 3 词逐词失败自动暂存 → 待补全卡 ×3 + 汇总 Toast」。
 *
 * 覆盖只有真实浏览器才能验的部分：
 *   1. 词库列表 2 张卡 + 三索引切换行为（顺序 = createdAt 升序；掌握程度 = 档升序；
 *      乱序只断言「同集合的排列」，避免种子随机的 flaky）；
 *   2. 复习流：概况「1 新词 · 1 到期」→ 新词首学正面即详解 →「知道了」→
 *      到期卡正面只有单词 + 音标（无释义 DOM、背面 aria-hidden）→ 翻面 →「认识」→ 完成态；
 *   3. SRS 落库（直读 IndexedDB）：learn 置 firstLearnedAt 且 nextReviewDate=今天+1；
 *      known 升档到 2、intervalDays=2、nextReviewDate=今天+2；
 *   4. 暂存支路：死地址查词失败 → 错误文案 + 「暂存单词」→ 空内容卡带「待补全」徽标、
 *      不进复习概况（仍「1 新词 · 1 到期」）、「待补全」过滤可见且默认勾选；
 *   5. 提示词预设：localStorage 里的生效预设显示为选中态（item--active + radio aria-checked），
 *      预览只读全文含契约骨架与自定义 extra 要求；
 *   6. 批量查词：textarea 输入 3 词 →「批量生成（3）」+「将处理 3 个词」→ 死地址逐词失败
 *      自动暂存 → 直读 IndexedDB 3 条空内容卡 + 汇总 Toast「已暂存 3」；
 *   7. 全页无常驻（无限循环）CSS 动画（沿用 power-save.spec 扫描法）+ 无 console error；
 *   8. 收尾按 accountId 级联清理测试账户全部 store + 设备级两键。
 */
import { test, expect, type Page } from '@playwright/test';

const BUSINESS_STORES = [
  'presets',
  'tasks',
  'reviews',
  'courses',
  'episodes',
  'focusSessions',
  'studyRecords',
  'settings',
  'vocabCards',
];

const NEW_WORD = 'abandon';
const NEW_MEANING = '放弃；抛弃';
const DUE_WORD = 'benefit';
const DUE_MEANING = '益处；好处';
const DUE_PHONETIC = '/ˈbenɪfɪt/';

/* 暂存用例：查词指向不可达地址（localhost:9 —— Chrome 保留端口，fetch 立即失败），
   不依赖任何真实 LLM；错误不阻塞暂存路径 */
const STASH_WORD = 'resilience';
const DEAD_LLM_BASE = 'http://localhost:9/v1';

/* 提示词预设 + 批量用例：预设与死地址配置由测试直接写 localStorage，
   批量 3 词必然逐词失败并自动暂存为待补全卡 */
const PRESET_ID = 'e2e-prompt-root';
const PRESET_NAME = '只讲词根';
const PRESET_EXTRA = '只输出词根词缀拆解，不要辨析和记忆法';
const BATCH_INPUT = 'alpha, beta, gamma';
const BATCH_WORDS = ['alpha', 'beta', 'gamma'];
const LOCAL_VOCAB_KEYS = ['kaoyandaily-vocab-llm-config', 'kaoyandaily-vocab-prompt-presets'];

/** 加载转圈豁免名单（与 power-save.spec / styles/power-save.css 保持一致） */
const SPINNER_ALLOWLIST = ['btn__spinner', 'plan-spin', 'review-spin'];

interface SeedInfo {
  accountId: string;
  today: string;
  tomorrow: string;
  dayAfter: string;
}

interface StoredVocabRow {
  id: string;
  word: string;
  definitions: Array<{ pos: string; meaning: string }>;
  examples: Array<{ en: string; zh: string }>;
  firstLearnedAt: string | null;
  lastReviewedAt: string | null;
  masteryLevel: number;
  intervalDays: number;
  nextReviewDate: string;
  isMastered: boolean;
  correctCount: number;
  wrongCount: number;
}

/**
 * 收集非预期 console error，除外两类预期项：
 * - 未登录时 `/api/v1/auth/me` 返回 401（本地模式同样请求，浏览器写成资源加载日志）；
 * - 调用方显式声明的不可达端点（暂存用例的 LLM 死地址）：连接失败同样会被浏览器
 *   写成 `Failed to load resource: net::ERR_*` 的 error 日志，位置即该请求 URL。
 */
function trackConsoleErrors(page: Page, ignoredUrlPrefixes: string[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (msg.text().includes('401')) return;
    const url = msg.location()?.url ?? '';
    if (ignoredUrlPrefixes.some((prefix) => url.startsWith(prefix))) return;
    errors.push(msg.text());
  });
  return errors;
}

/** 本地模式进场：新建账户 → 进入应用（同 power-save.spec，不依赖服务器会话） */
async function enterLocalApp(page: Page) {
  await page.goto('/#/local');
  await page.waitForSelector('#local-email');
  await page.locator('#local-email').fill(`e2e-vocab-${Date.now()}@local.test`);
  await page.getByRole('button', { name: '创建本地账户', exact: true }).click();
  await page.locator('[aria-label^="以 "]').first().click();
  await page.waitForSelector('.top-nav');
}

/**
 * 向当前激活账户的 vocabCards 播种两张卡（浏览器内算「今天」，与前端 today() 同口径）：
 * - 新词：firstLearnedAt=null（新词区），createdAt 较晚；
 * - 到期卡：firstLearnedAt 非空、masteryLevel=1、nextReviewDate=今天，createdAt 较早
 *   （因此「顺序」与「掌握程度」两种索引的期望次序不同，索引切换可判别）。
 */
async function seedVocabCards(page: Page): Promise<SeedInfo> {
  return page.evaluate<SeedInfo>(
    ({ newWord, newMeaning, dueWord, dueMeaning, duePhonetic }) => {
      const stored = JSON.parse(localStorage.getItem('kaoyandaily_local_activeAccount') ?? 'null') as {
        accountId?: string;
      } | null;
      const accountId = stored?.accountId;
      if (!accountId) throw new Error('本地账户未激活，无法播种词卡');
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const addDays = (dateStr: string, days: number) => {
        const d = new Date(`${dateStr}T00:00:00`);
        d.setDate(d.getDate() + days);
        return fmt(d);
      };
      const today = fmt(new Date());
      const now = Date.now();
      const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

      const rows = [
        {
          accountId,
          id: 'e2e-vocab-due',
          word: dueWord,
          phonetic: duePhonetic,
          definitions: [
            { pos: 'n.', meaning: dueMeaning },
            { pos: 'v.', meaning: '有益于' },
          ],
          examples: [{ en: 'The new policy will benefit students.', zh: '新政策将使学生受益。' }],
          extra: null,
          examFreq: '高',
          masteryLevel: 1,
          intervalDays: 1,
          nextReviewDate: today,
          isMastered: false,
          firstLearnedAt: iso(86_400_000),
          correctCount: 1,
          wrongCount: 0,
          lastReviewedAt: null,
          createdAt: iso(2 * 86_400_000),
          updatedAt: iso(86_400_000),
        },
        {
          accountId,
          id: 'e2e-vocab-new',
          word: newWord,
          phonetic: '/əˈbændən/',
          definitions: [{ pos: 'v.', meaning: newMeaning }],
          examples: [{ en: 'He abandoned the plan.', zh: '他放弃了这个计划。' }],
          extra: '**记忆**：a + band + on',
          examFreq: '高',
          masteryLevel: 0,
          intervalDays: 0,
          nextReviewDate: addDays(today, 1),
          isMastered: false,
          firstLearnedAt: null,
          correctCount: 0,
          wrongCount: 0,
          lastReviewedAt: null,
          createdAt: iso(86_400_000),
          updatedAt: iso(86_400_000),
        },
      ];

      return new Promise<SeedInfo>((resolve, reject) => {
        const req = indexedDB.open('kaoyandaily_local');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const txn = db.transaction('vocabCards', 'readwrite');
          for (const row of rows) txn.objectStore('vocabCards').put(row);
          txn.oncomplete = () =>
            resolve({ accountId, today, tomorrow: addDays(today, 1), dayAfter: addDays(today, 2) });
          txn.onerror = () => reject(txn.error);
        };
      });
    },
    {
      newWord: NEW_WORD,
      newMeaning: NEW_MEANING,
      dueWord: DUE_WORD,
      dueMeaning: DUE_MEANING,
      duePhonetic: DUE_PHONETIC,
    }
  );
}

/** 直读 IndexedDB 当前账户全部词卡（断言 SRS 落库结果） */
async function readVocabCards(page: Page): Promise<StoredVocabRow[]> {
  return page.evaluate<StoredVocabRow[]>(
    () =>
      new Promise<StoredVocabRow[]>((resolve, reject) => {
        const req = indexedDB.open('kaoyandaily_local');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const txn = db.transaction('vocabCards', 'readonly');
          const all = txn.objectStore('vocabCards').getAll();
          all.onsuccess = () => resolve(all.result as StoredVocabRow[]);
          all.onerror = () => reject(all.error);
        };
      })
  );
}

/** 收尾清理：按 accountId 级联清空全部业务 store + accounts 记录 + 激活账户 localStorage */
async function cleanVocabTestAccount(page: Page, accountId: string): Promise<void> {
  await page.evaluate(
    async ({ accountId: target, stores }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('kaoyandaily_local');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const indexKeys = (store: string) =>
        new Promise<IDBValidKey[]>((resolve, reject) => {
          const txn = db.transaction(store, 'readonly');
          const req = txn.objectStore(store).index('accountId').getAllKeys(target);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const deleteKeys = (store: string, keys: IDBValidKey[]) =>
        new Promise<void>((resolve, reject) => {
          if (keys.length === 0) {
            resolve();
            return;
          }
          const txn = db.transaction(store, 'readwrite');
          for (const key of keys) txn.objectStore(store).delete(key);
          txn.oncomplete = () => resolve();
          txn.onerror = () => reject(txn.error);
        });
      for (const store of stores) {
        await deleteKeys(store, await indexKeys(store));
      }
      /* accounts 主键即 accountId，无 accountId 索引 */
      await deleteKeys('accounts', [target]);
      localStorage.removeItem('kaoyandaily_local_activeAccount');
    },
    { accountId, stores: BUSINESS_STORES }
  );
}

/** 读取当前激活本地账户 id（不播种词卡、只清理账户时使用；口径同 seedVocabCards） */
async function activeLocalAccountId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('kaoyandaily_local_activeAccount') ?? 'null') as {
      accountId?: string;
    } | null;
    if (!stored?.accountId) throw new Error('本地账户未激活，无法取得 accountId');
    return stored.accountId;
  });
}

/** 清理设备级 vocab 两键（LLM 连接配置 / 提示词预设），避免测试账户删除后仍有残留 */
async function clearVocabLocalKeys(page: Page): Promise<void> {
  await page.evaluate((keys) => {
    for (const key of keys) localStorage.removeItem(key);
  }, LOCAL_VOCAB_KEYS);
}

/** 所有仍在无限循环的 CSS 动画（排除转圈白名单；扫描法同 power-save.spec）。
 *  可选 rootSelector：只扫该子树（正常模式下避开全站极光背景的既有常驻动画）。 */
async function infiniteAnimations(page: Page, rootSelector?: string) {
  return page.evaluate(
    ({ allow, rootSelector: rootSel }) => {
      const root = rootSel ? document.querySelector(rootSel) : null;
      const scope: ParentNode = root ?? document;
      const hits: Array<{ tgt: string; name: string; iter: string }> = [];
      for (const el of scope.querySelectorAll('*')) {
        const cls = (el.className?.baseVal ?? el.className ?? '').toString();
        if (allow.some((a) => cls.includes(a))) continue;
        const cs = getComputedStyle(el as Element);
        if (cs.animationName === 'none') continue;
        const iterations = cs.animationIterationCount;
        const isInfinite = iterations
          .split(',')
          .some((v) => v.trim() === 'infinite' || (parseFloat(v) > 1 && cs.animationDuration !== '0s'));
        if (isInfinite) {
          hits.push({ tgt: cls.slice(0, 60) || (el as Element).tagName, name: cs.animationName, iter: iterations });
        }
      }
      return hits;
    },
    { allow: SPINNER_ALLOWLIST, rootSelector }
  );
}

test('单词本：播种词卡 → 三索引 → 首学/复习调度 → 无无限动画/无 console error', async ({ page }) => {
  const consoleErrors = trackConsoleErrors(page);

  let accountId: string | null = null;
  let cleaned = false;

  try {
    await enterLocalApp(page);

    /* 顶栏第 8 项「单词本」在本地模式同样渲染 */
    await expect(page.getByRole('link', { name: '单词本' })).toBeVisible();

    /* ---------- 播种 + 进入词库 ---------- */
    const seed = await seedVocabCards(page);
    accountId = seed.accountId;

    await page.getByRole('link', { name: '单词本' }).click();
    await expect(page.locator('.vocab-card')).toHaveCount(2);
    await expect(page.locator('.vocab-toolbar__count')).toHaveText('2 词');

    /* ---------- 1a. 顺序索引：createdAt 升序（播种的到期卡更早） ---------- */
    await page.getByRole('button', { name: '顺序', exact: true }).click();
    await expect(page.locator('.vocab-card__word')).toHaveText([DUE_WORD, NEW_WORD]);

    /* ---------- 1b. 掌握程度索引：档升序（新词 0 在前，到期卡 1 在后） ---------- */
    await page.getByRole('button', { name: '掌握程度', exact: true }).click();
    await expect(page.locator('.vocab-card__word')).toHaveText([NEW_WORD, DUE_WORD]);

    /* ---------- 1c. 乱序：只断言「同集合的排列」（洗牌结果随机，不断言具体次序） ---------- */
    await page.getByRole('button', { name: '乱序', exact: true }).click();
    let shuffled = await page.locator('.vocab-card__word').allTextContents();
    expect(shuffled).toHaveLength(2);
    expect([...shuffled].sort()).toEqual([NEW_WORD, DUE_WORD].sort());
    await page.getByRole('button', { name: '乱序', exact: true }).click();
    shuffled = await page.locator('.vocab-card__word').allTextContents();
    expect([...shuffled].sort(), '重选乱序后仍是同一集合').toEqual([NEW_WORD, DUE_WORD].sort());

    /* ---------- 2. 复习 tab 概况 + 默认配额 ---------- */
    await page.getByRole('tab', { name: '复习' }).click();
    await expect(page.locator('.vocab-review__panel-count')).toHaveText('1 新词 · 1 到期');
    await expect(page.locator('.vocab-quota__btn--active')).toHaveText('10');

    await page.getByRole('button', { name: '开始复习' }).click();

    /* ---------- 2a. 新词首学：正面即完整详解（不遮答案） ---------- */
    const firstCard = page.locator('.vocab-first');
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator('.vocab-flip__word')).toHaveText(NEW_WORD);
    await expect(firstCard.locator('.vocab-first__badge')).toHaveText('新词首学');
    await expect(firstCard.locator('.vocab-detail__meaning')).toHaveText([NEW_MEANING]);

    await page.getByRole('button', { name: '知道了' }).click();

    /* ---------- 2b. 到期卡正面：只有单词 + 音标，释义不可达 ---------- */
    await expect(page.locator('.vocab-flip[data-phase="front"]')).toBeVisible();
    const frontFace = page.locator('.vocab-flip__face--front');
    await expect(frontFace.locator('.vocab-flip__word')).toHaveText(DUE_WORD);
    await expect(frontFace.locator('.vocab-flip__phonetic')).toHaveText(DUE_PHONETIC);
    /* 正面 DOM 不含详解；背面整面 aria-hidden，三键 disabled */
    await expect(frontFace.locator('.vocab-detail'), '正面不应出现释义详解').toHaveCount(0);
    await expect(page.locator('.vocab-flip__face--back')).toHaveAttribute('aria-hidden', 'true');
    /* 背面整面 aria-hidden 时 getByRole 不可达，用类定位三键并断言禁用 */
    await expect(page.locator('.vocab-grade--known')).toBeDisabled();
    await expect(page.locator('.vocab-grade--fuzzy')).toBeDisabled();
    await expect(page.locator('.vocab-grade--unknown')).toBeDisabled();

    /* 复习视图（.vocab-page 子树）无常驻动画——正常模式扫子树以避开全站极光背景 */
    expect(await infiniteAnimations(page, '.vocab-page'), '复习页不应有无限动画').toEqual([]);

    /* ---------- 2c. 翻面 → 自评「认识」→ 完成态 ---------- */
    await page.locator('.vocab-flip__tap').click();
    await expect(page.locator('.vocab-flip[data-phase="back"]')).toBeVisible();
    await expect(page.locator('.vocab-flip__face--back .vocab-detail__meaning')).toHaveText([
      DUE_MEANING,
      '有益于',
    ]);
    await page.locator('.vocab-grade--known').click();

    await expect(page.locator('.vocab-review__panel-title')).toHaveText('本轮复习完成');
    await expect(page.locator('.vocab-review__panel-count')).toHaveText('今日新学 1 · 复习 1 · 重练 0');

    /* ---------- 3. SRS 落库：直读 IndexedDB ---------- */
    const rows = await readVocabCards(page);
    const byWord = new Map(rows.map((row) => [row.word, row]));
    const newRow = byWord.get(NEW_WORD);
    const dueRow = byWord.get(DUE_WORD);
    expect(newRow, `应能读到新词卡 ${NEW_WORD}`).toBeTruthy();
    expect(dueRow, `应能读到到期卡 ${DUE_WORD}`).toBeTruthy();
    /* 新词「知道了」：只置 firstLearnedAt，次日到期 */
    expect(newRow!.firstLearnedAt).not.toBeNull();
    expect(newRow!.nextReviewDate).toBe(seed.tomorrow);
    expect(newRow!.masteryLevel).toBe(0);
    /* 到期卡「认识」：1 档 → 2 档，间隔 SRS_INTERVALS[2]=2，今天+2 */
    expect(dueRow!.masteryLevel).toBe(2);
    expect(dueRow!.intervalDays).toBe(2);
    expect(dueRow!.nextReviewDate).toBe(seed.dayAfter);
    expect(dueRow!.isMastered).toBe(false);
    expect(dueRow!.correctCount).toBe(2);
    expect(dueRow!.lastReviewedAt).not.toBeNull();

    /* ---------- 4a. 返回词库后仍无常驻动画 ---------- */
    await page.getByRole('button', { name: '返回词库' }).click();
    await expect(page.locator('.vocab-card')).toHaveCount(2);
    expect(await infiniteAnimations(page, '.vocab-page'), '词库页不应有无限动画').toEqual([]);

    /* ---------- 4b. 节能模式全页扫描（沿用 power-save.spec 的判法：属性 + 全页扫描） ---------- */
    await page.evaluate(() => localStorage.setItem('kaoyandaily-power-save', 'on'));
    await page.reload();
    await page.waitForSelector('.vocab-card');
    await expect(page.locator('.vocab-card')).toHaveCount(2);
    await expect(page.locator('html')).toHaveAttribute('data-power-save', 'on');
    await page.waitForTimeout(300);
    expect(await infiniteAnimations(page), '节能模式下词库页不应有无限动画').toEqual([]);
    await page.getByRole('tab', { name: '复习' }).click();
    await expect(page.locator('.vocab-review__panel-count')).toHaveText('0 新词 · 0 到期');
    await page.waitForTimeout(200);
    expect(await infiniteAnimations(page), '节能模式下复习空闲态不应有无限动画').toEqual([]);

    /* ---------- 5. 收尾：级联清理测试账户 ---------- */
    await cleanVocabTestAccount(page, accountId);
    cleaned = true;
    expect(await readVocabCards(page), '清理后测试账户不应残留词卡').toEqual([]);

    /* ---------- 4c. 全程无 console error ---------- */
    expect(consoleErrors, '页面不应有 console error').toEqual([]);
  } finally {
    if (accountId && !cleaned) {
      /* 断言失败路径的兜底清理：尽力而为，不遮盖主断言错误 */
      try {
        await cleanVocabTestAccount(page, accountId);
      } catch {
        /* 页面已关闭等场景无需处理 */
      }
    }
  }
});

test('单词本：LLM 不可达 → 暂存空卡 → 待补全过滤 → 不进复习概况', async ({ page }) => {
  /* 死地址的连接失败会被浏览器写成资源加载 error 日志（location = 该端点 URL），按前缀豁免 */
  const consoleErrors = trackConsoleErrors(page, [DEAD_LLM_BASE]);

  let accountId: string | null = null;
  let cleaned = false;

  try {
    await enterLocalApp(page);

    /* 播种两张正常卡（复用既有播种法），让复习概况有可对照的基线 */
    const seed = await seedVocabCards(page);
    accountId = seed.accountId;

    /* 把 LLM 配置写死为不可达地址：查词必然以 LlmError('cors') 失败，暂存路径不依赖 LLM */
    await page.evaluate(
      ({ base }) => {
        localStorage.setItem(
          'kaoyandaily-vocab-llm-config',
          JSON.stringify({ baseUrl: base, apiKey: 'sk-e2e-dead', model: 'e2e-dead-model' })
        );
      },
      { base: DEAD_LLM_BASE }
    );

    await page.getByRole('link', { name: '单词本' }).click();
    await expect(page.locator('.vocab-card')).toHaveCount(2);

    /* ---------- 1. 查词失败：分类文案 + 重试 + 「暂存单词」入口 ---------- */
    await page.locator('.vocab-toolbar').getByRole('button', { name: '查询单词' }).click();
    await page.getByLabel('要查询的单词或短语').fill(STASH_WORD);
    await page.getByRole('button', { name: '查询', exact: true }).click();

    const queryError = page.locator('.vocab-query__error-text');
    await expect(queryError).toBeVisible();
    await expect(queryError, '连接失败应给出直连失败类文案').toContainText('无法连接 LLM 服务');
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible();
    await expect(page.getByRole('button', { name: '暂存单词' })).toBeVisible();

    /* ---------- 2. 暂存：空内容卡入库并带「待补全」徽标 ---------- */
    await page.getByRole('button', { name: '暂存单词' }).click();
    await expect(page.locator('.toast-item', { hasText: '已暂存，LLM 恢复后可补全' })).toBeVisible();
    await expect(page.locator('.vocab-query__error'), '暂存成功后查询弹窗应关闭').toHaveCount(0);

    await expect(page.locator('.vocab-card')).toHaveCount(3);
    const stashedCard = page.locator('.vocab-card', { hasText: STASH_WORD });
    await expect(stashedCard.locator('.vocab-card__word')).toHaveText(STASH_WORD);
    await expect(stashedCard.locator('.vocab-card__badge--pending')).toHaveText('待补全');

    /* 落库口径：definitions/examples 空数组即待补全标记，无新列；SRS 字段照常初始化 */
    const stashedRow = (await readVocabCards(page)).find((row) => row.word === STASH_WORD);
    expect(stashedRow, '应能读到暂存卡').toBeTruthy();
    expect(stashedRow!.definitions).toEqual([]);
    expect(stashedRow!.examples).toEqual([]);
    expect(stashedRow!.firstLearnedAt).toBeNull();
    expect(stashedRow!.masteryLevel).toBe(0);
    expect(stashedRow!.nextReviewDate).toBe(seed.tomorrow);

    /* ---------- 3. 复习概况不含待补全卡：仍是播种的「1 新词 · 1 到期」 ---------- */
    await page.getByRole('tab', { name: '复习' }).click();
    await expect(page.locator('.vocab-review__panel-count')).toHaveText('1 新词 · 1 到期');
    await expect(page.getByRole('button', { name: '开始复习' })).toBeEnabled();

    /* ---------- 4. 「待补全」过滤：只列该卡、默认勾选、可批量补全 ---------- */
    await page.getByRole('tab', { name: '词库' }).click();
    const pendingFilter = page.getByRole('button', { name: '待补全 (1)' });
    await expect(pendingFilter).toBeEnabled();
    await pendingFilter.click();
    await expect(page.locator('.vocab-card')).toHaveCount(1);
    await expect(page.locator('.vocab-card__word')).toHaveText(STASH_WORD);
    await expect(page.locator('.vocab-card__check')).toBeChecked();
    await expect(page.getByRole('button', { name: '补全选中（1）' })).toBeVisible();

    /* 展开：空内容占位 + 单卡「AI 补全」入口 */
    await page.locator('.vocab-card__toggle').click();
    await expect(page.locator('.vocab-detail__empty-title')).toHaveText('内容待补全');
    await expect(page.getByRole('button', { name: 'AI 补全' })).toBeVisible();

    /* ---------- 5. 收尾：级联清理测试账户，全程无 console error ---------- */
    await cleanVocabTestAccount(page, accountId);
    cleaned = true;
    expect(await readVocabCards(page), '清理后测试账户不应残留词卡').toEqual([]);

    expect(consoleErrors, '页面不应有 console error（401 与死地址网络日志除外）').toEqual([]);
  } finally {
    if (accountId && !cleaned) {
      try {
        await cleanVocabTestAccount(page, accountId);
      } catch {
        /* 页面已关闭等场景无需处理 */
      }
    }
  }
});

test('单词本：提示词预设管理 + 批量查词（死地址→全部暂存）', async ({ page }) => {
  /* 批量 3 词各发一次死地址请求，浏览器资源加载 error 日志按 URL 前缀豁免（同暂存用例） */
  const consoleErrors = trackConsoleErrors(page, [DEAD_LLM_BASE]);

  let accountId: string | null = null;
  let cleaned = false;

  try {
    await enterLocalApp(page);
    accountId = await activeLocalAccountId(page);

    /* 设备级两键：生效中的提示词预设（activeId 指向它）+ 死地址 LLM 配置 */
    await page.evaluate(
      ({ deadBase, preset }) => {
        localStorage.setItem(
          'kaoyandaily-vocab-prompt-presets',
          JSON.stringify({ presets: [preset], activeId: preset.id })
        );
        localStorage.setItem(
          'kaoyandaily-vocab-llm-config',
          JSON.stringify({ baseUrl: deadBase, apiKey: 'sk-e2e-dead', model: 'e2e-dead-model' })
        );
      },
      {
        deadBase: DEAD_LLM_BASE,
        preset: { id: PRESET_ID, name: PRESET_NAME, extraRequirement: PRESET_EXTRA },
      }
    );

    await page.getByRole('link', { name: '单词本' }).click();
    await expect(page.locator('.vocab-toolbar').getByRole('button', { name: '查询单词' })).toBeVisible();

    /* ---------- 1. 配置弹窗：提示词区显示该预设为选中态 ---------- */
    await page.locator('.vocab-settings').click();
    const configDialog = page.getByRole('dialog', { name: 'LLM 配置' });
    await expect(configDialog).toBeVisible();
    const prompts = configDialog.locator('.vocab-llm__prompts');
    await expect(prompts.locator('.vocab-llm__prompts-current')).toHaveText(`当前：${PRESET_NAME}`);
    await prompts.locator('.vocab-llm__prompts-toggle').click();
    const activeItem = prompts.locator('.vocab-llm__prompt-item--active');
    await expect(activeItem, '应恰有一条预设处于选中态').toHaveCount(1);
    await expect(activeItem).toContainText(PRESET_NAME);
    await expect(activeItem.getByRole('radio')).toHaveAttribute('aria-checked', 'true');
    await expect(prompts.getByRole('radio', { name: /默认/ })).toHaveAttribute('aria-checked', 'false');

    /* 预览只读全文：契约骨架仍在（不可自定义），仅末尾 extra 要求换成用户值 */
    await activeItem.getByRole('button', { name: '编辑' }).click();
    await prompts.locator('.vocab-llm__preview-toggle').click();
    const preview = prompts.locator('.vocab-llm__preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('只输出一个 JSON 对象');
    await expect(preview).toContainText(`extra 部分的要求：${PRESET_EXTRA}`);
    await expect(preview, '自定义 extra 应替换掉默认要求文案').not.toContainText(
      '词根词缀拆解、2-4 组高频易混词辨析、一句话记忆法'
    );

    /* Esc 关闭配置弹窗（表单未保存即关闭，不应写回预设） */
    await page.keyboard.press('Escape');
    await expect(configDialog).toBeHidden();

    /* ---------- 2. 查询弹窗：textarea 一次输入 3 词 → 批量入口 ---------- */
    await page.locator('.vocab-toolbar').getByRole('button', { name: '查询单词' }).click();
    const queryDialog = page.getByRole('dialog', { name: '查询单词' });
    await expect(queryDialog).toBeVisible();
    await queryDialog.getByLabel('要查询的单词或短语，可一次输入多个').fill(BATCH_INPUT);
    await expect(queryDialog.getByRole('button', { name: '批量生成（3）' })).toBeVisible();
    await expect(queryDialog.locator('.vocab-query__batch-hint')).toHaveText('将处理 3 个词');

    /* ---------- 3. 提交：死地址逐词失败自动暂存；汇总 Toast 3.5s 后消失，第一时间断言 ---------- */
    await queryDialog.getByRole('button', { name: '批量生成（3）' }).click();
    await expect(page.locator('.toast-item', { hasText: '已暂存 3' })).toBeVisible();
    await expect(queryDialog.locator('.vocab-query__batch-progress')).toHaveText('已完成 3/3');
    await expect(queryDialog.locator('.vocab-query__batch-item--staged')).toHaveCount(3);
    await expect(queryDialog.locator('.vocab-query__batch-badge--staged')).toHaveText([
      '已暂存',
      '已暂存',
      '已暂存',
    ]);

    /* ---------- 4. 落库与词库 UI：3 张待补全空卡 ---------- */
    const rows = await readVocabCards(page);
    expect(rows, '批量应入库 3 张卡').toHaveLength(3);
    expect([...rows.map((row) => row.word)].sort()).toEqual([...BATCH_WORDS].sort());
    for (const row of rows) {
      expect(row.definitions, `${row.word} 应为待补全空卡`).toEqual([]);
      expect(row.examples, `${row.word} 应为待补全空卡`).toEqual([]);
      expect(row.firstLearnedAt, `${row.word} 不应有首次学习时间`).toBeNull();
    }

    await queryDialog.getByRole('button', { name: '关闭' }).click();
    await expect(queryDialog).toBeHidden();
    await expect(page.locator('.vocab-card')).toHaveCount(3);
    await expect(page.locator('.vocab-card__badge--pending')).toHaveCount(3);

    /* ---------- 5. 收尾：级联清理测试账户 + 设备级两键 ---------- */
    await cleanVocabTestAccount(page, accountId);
    await clearVocabLocalKeys(page);
    cleaned = true;
    expect(await readVocabCards(page), '清理后测试账户不应残留词卡').toEqual([]);
    expect(
      await page.evaluate(() => [
        localStorage.getItem('kaoyandaily-vocab-llm-config'),
        localStorage.getItem('kaoyandaily-vocab-prompt-presets'),
      ]),
      '设备级两键应清理干净'
    ).toEqual([null, null]);

    expect(consoleErrors, '页面不应有 console error（401 与死地址网络日志除外）').toEqual([]);
  } finally {
    if (accountId && !cleaned) {
      try {
        await cleanVocabTestAccount(page, accountId);
      } catch {
        /* 页面已关闭等场景无需处理 */
      }
    }
  }
});
