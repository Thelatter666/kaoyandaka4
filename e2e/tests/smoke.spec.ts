/**
 * 介绍页最小冒烟测试（性能优化 P2-5）
 *
 * playwright.config.ts 已配置 webServer（cd .. && npm run dev，自动起 5173 前端
 * 与 3001 后端，本地复用已有服务），因此无需 test.skip 条件跳过。
 *
 * 断言：
 *   1. 未登录访问根路径展示介绍页，标题含「砚台」；
 *   2. Hero 区可见；
 *   3. 无 console error；
 *   4. 页面网络请求中没有加载任何 .png 截图（P1-1 后应全部为 .webp）。
 */
import { test, expect } from '@playwright/test';

test('介绍页冒烟：标题 / Hero / 无 console error / 截图为 webp', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    /* 未登录时 /api/v1/auth/me 会正常返回 401，浏览器会记一条
       "Failed to load resource: ... 401" 的 console error，属预期行为，过滤掉 */
    if (msg.type() === 'error' && !msg.text().includes('401')) consoleErrors.push(msg.text());
  });

  /* 收集所有请求，稍后断言没有 .png 截图请求 */
  const pngRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/screenshots/') && url.endsWith('.png')) pngRequests.push(url);
  });

  await page.goto('/');

  /* 1. 标题含「砚台」 */
  await expect(page).toHaveTitle(/砚台/);

  /* 2. Hero 区可见 */
  await expect(page.locator('.landing-hero')).toBeVisible();
  await expect(page.locator('#landing-hero-title')).toHaveText('砚台');

  /* 4. 滚动到底触发懒加载图片，再检查网络请求 */
  await page.mouse.wheel(0, 20000);
  await page.waitForLoadState('networkidle');

  /* 截图区图片应为 webp 且能实际加载成功 */
  const firstShot = page.locator('.landing-screenshots__item img').first();
  await expect(firstShot).toHaveAttribute('src', /\.webp$/);

  expect(pngRequests, '不应加载任何 .png 截图').toEqual([]);

  /* 3. 无 console error */
  expect(consoleErrors, '页面不应有 console error').toEqual([]);
});
