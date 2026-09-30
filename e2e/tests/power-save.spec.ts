/**
 * 节能模式 E2E 断言（浏览器行为侧）
 *
 * 单测（client/src/utils/powerSave.test.ts）覆盖纯函数，本文件覆盖只有真实浏览器
 * 才能验的部分：
 *   1. 首帧即带 <html data-power-save="on">，且页面布局与正常模式逐元素一致
 *      （需求红线：节能模式只降开销、不改布局）；
 *   2. 节能模式下不存在任何仍在无限循环的 CSS 动画（加载转圈白名单除外）——
 *      这条能自动抓住将来新增的常驻动效，比手写选择器清单可靠；
 *   3. 顶栏按钮真实可用（点击 → 属性 + localStorage 双向生效、可再次关闭）；
 *   4. 无 console error。
 *
 * 进入应用走本地模式（#/local → 新建账户 → 进入），无需数据库与服务器会话。
 */
import { test, expect, type Page } from '@playwright/test';

/** 需要在两种模式下逐一比对盒模型的关键元素（覆盖顶栏 / 页面容器 / 背景层 / 玻璃面） */
const LAYOUT_SELECTORS = [
  '.top-nav',
  '.top-nav__links',
  '.top-nav__actions',
  '#main-content',
  '.page-transition',
  '.aurora-background',
  '.glass-2',
  'button.glass-1',
];

/** 加载转圈豁免名单（与 styles/power-save.css 第 2 节保持一致） */
const SPINNER_ALLOWLIST = ['btn__spinner', 'plan-spin', 'review-spin'];

async function enterLocalApp(page: Page) {
  await page.goto('/#/local');
  await page.waitForSelector('#local-email');
  await page.locator('#local-email').fill(`e2e-power-${Date.now()}@local.test`);
  await page.getByRole('button', { name: '创建本地账户', exact: true }).click();
  await page.locator('[aria-label^="以 "]').first().click();
  await page.waitForSelector('.top-nav');
}

/** 等布局真正稳定：入场动画（page-enter 240ms + reveal 的 stagger 延迟）跑完
 *  之前取盒模型会量到动画中间态（正常模式 78px vs 节能模式 68px 的假差异即由此而来） */
async function waitStable(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#main-content') as HTMLElement | null;
      const nav = document.querySelector('.top-nav') as HTMLElement | null;
      if (!el || !nav) return false;
      const prev = (window as unknown as { __psStable?: string }).__psStable;
      const cur = [el.getBoundingClientRect().y, nav.getBoundingClientRect().y, el.getBoundingClientRect().height]
        .map((n) => Math.round(n * 10) / 10)
        .join(',');
      (window as unknown as { __psStable?: string }).__psStable = cur;
      return prev === cur;
    },
    undefined,
    { timeout: 8000, polling: 250 },
  );
}

/** 读取一批选择器的盒模型（取第一个可见匹配），用于两模式比对 */
async function boxes(page: Page) {
  return page.evaluate((selectors) => {
    const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
    for (const sel of selectors) {
      const el = [...document.querySelectorAll(sel)].find(
        (e) => (e as HTMLElement).offsetParent !== null,
      );
      if (!el) {
        out[sel] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[sel] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    }
    return out;
  }, LAYOUT_SELECTORS);
}

/** 所有仍在无限循环的 CSS 动画（排除转圈白名单） */
async function infiniteAnimations(page: Page) {
  return page.evaluate((allow) => {
    const hits: Array<{ tgt: string; name: string; iter: string }> = [];
    for (const el of document.querySelectorAll('*')) {
      const cls = (el.className?.baseVal ?? el.className ?? '').toString();
      if (allow.some((a) => cls.includes(a))) continue;
      const cs = getComputedStyle(el as Element);
      if (cs.animationName === 'none') continue;
      const iterations = cs.animationIterationCount;
      const isInfinite = iterations
        .split(',')
        .some((v) => v.trim() === 'infinite' || (parseFloat(v) > 1 && cs.animationDuration !== '0s'));
      if (isInfinite) hits.push({ tgt: cls.slice(0, 60) || (el as Element).tagName, name: cs.animationName, iter: iterations });
    }
    return hits;
  }, SPINNER_ALLOWLIST);
}

test('节能模式：首帧标记 / 无限动画清零 / 布局与正常模式一致', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('401')) consoleErrors.push(msg.text());
  });

  await enterLocalApp(page);

  /* 1. 正常模式基线：无属性；记录布局 */
  await expect(page.locator('html')).not.toHaveAttribute('data-power-save', 'on');
  await waitStable(page);
  const normalBoxes = await boxes(page);
  expect(normalBoxes['.top-nav'], '正常模式下顶栏应可见').not.toBeNull();

  /* 2. 首帧即生效：预先写入偏好后刷新，模块顶层（createRoot 之前）就应带上属性 */
  await page.evaluate(() => localStorage.setItem('kaoyandaily-power-save', 'on'));
  await page.reload();
  await page.waitForSelector('.top-nav');
  await expect(page.locator('html')).toHaveAttribute('data-power-save', 'on');
  await waitStable(page);

  /* 3. 无限动画清零（转圈白名单除外） */
  const infinite = await infiniteAnimations(page);
  expect(infinite, `节能模式下仍有无限动画：${JSON.stringify(infinite)}`).toEqual([]);

  /* 4. 布局与正常模式逐元素一致（容差 0.5px，仅吸收亚像素舍入） */
  const powerBoxes = await boxes(page);
  for (const sel of LAYOUT_SELECTORS) {
    const a = normalBoxes[sel];
    const b = powerBoxes[sel];
    if (a === null && b === null) continue;
    expect(b, `${sel} 在节能模式下消失`).not.toBeNull();
    expect(a, `${sel} 正常模式下存在但节能模式下不存在`).not.toBeNull();
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(Math.abs(a![k] - b![k]), `${sel} 的 ${k} 偏移 ${a![k]} → ${b![k]}`).toBeLessThanOrEqual(0.5);
    }
  }

  /* 5. 顶栏按钮真实可用：关闭 → 属性与存储同步清除 */
  await page.locator('.power-save-toggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-power-save', 'on');
  expect(await page.evaluate(() => localStorage.getItem('kaoyandaily-power-save'))).toBe('off');

  /* 再开回来：属性与存储同步置位，且按钮给出 aria-pressed 状态 */
  await page.locator('.power-save-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-power-save', 'on');
  await expect(page.locator('.power-save-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('kaoyandaily-power-save'))).toBe('on');

  /* 6. 无 console error */
  expect(consoleErrors, '页面不应有 console error').toEqual([]);
});

test('节能模式不破坏计时：倒计时照走，墨面按节拍继续推进', async ({ page }) => {
  await enterLocalApp(page);
  /* 先开节能模式，再起会话：验的就是降频驱动路径本身 */
  await page.locator('.power-save-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-power-save', 'on');

  await page.evaluate(() => { location.hash = '#/pomodoro'; });
  await page.getByRole('button', { name: '开始专注' }).click();
  await page.getByRole('button', { name: '提前完成' }).waitFor();

  const readClock = () =>
    page.evaluate(() => document.querySelector('.inkwell__t-time')?.textContent?.trim() ?? null);
  /** 墨面位移：.inkwell__surf-g 的 transform 属性由 JS 直写 */
  const readInk = () =>
    page.evaluate(() => document.querySelector('.inkwell__surf-g')?.getAttribute('transform') ?? null);

  const clock0 = await readClock();
  const ink0 = await readInk();
  await page.waitForTimeout(3400);
  const clock1 = await readClock();
  const ink1 = await readInk();

  expect(clock0, '应能读到倒计时读数').toMatch(/^\d{1,2}:\d{2}$/);
  expect(clock1, '应能读到倒计时读数').toMatch(/^\d{1,2}:\d{2}$/);
  expect(clock1, '倒计时应继续走（3 秒后读数应更小）').not.toBe(clock0);
  expect(ink0, '应能读到墨面位移').toMatch(/^translate\(0 /);
  expect(ink1, '墨面应继续推进').not.toBe(ink0);
});
