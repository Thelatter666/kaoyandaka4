/**
 * 单词本 E2E（浏览器行为侧）
 *
 * 不调真 LLM：进场走本地模式（`#/local` 新建账户），再向 IndexedDB `kaoyandaily_local`
 * 的 `vocabCards` 播种两张卡（一条新词 + 一条已学到期），经顶部导航进入单词本走完整复习流。
 *
 * 覆盖只有真实浏览器才能验的部分：
 *   1. 词库列表 2 张卡 + 三索引切换行为（顺序 = createdAt 升序；掌握程度 = 档升序；
 *      乱序只断言「同集合的排列」，避免种子随机的 flaky）；
 *   2. 复习流：概况「1 新词 · 1 到期」→ 新词首学正面即详解 →「知道了」→
 *      到期卡正面只有单词 + 音标（无释义 DOM、背面 aria-hidden）→ 翻面 →「认识」→ 完成态；
 *   3. SRS 落库（直读 IndexedDB）：learn 置 firstLearnedAt 且 nextReviewDate=今天+1；
 *      known 升档到 2、intervalDays=2、nextReviewDate=今天+2；
 *   4. 全页无常驻（无限循环）CSS 动画（沿用 power-save.spec 扫描法）+ 无 console error；
 *   5. 收尾按 accountId 级联清理测试账户全部 store。
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
  firstLearnedAt: string | null;
  lastReviewedAt: string | null;
  masteryLevel: number;
  intervalDays: number;
  nextReviewDate: string;
  isMastered: boolean;
  correctCount: number;
  wrongCount: number;
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
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    /* 未登录时 /api/v1/auth/me 正常返回 401，属预期 */
    if (msg.type() === 'error' && !msg.text().includes('401')) consoleErrors.push(msg.text());
  });

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
