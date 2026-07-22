/**
 * 介绍页滚动实测脚本（临时验证用）：未登录访问 5173，
 * 逐段滚动截图（桌面 1280 / 移动 375 / reduced-motion），输出 /tmp/landing-verify/。
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const OUT = '/tmp/landing-verify';

const browser = await chromium.launch();

/* 1) 桌面端逐段滚动 */
const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await desktop.goto(BASE + '/#/');
await desktop.waitForLoadState('networkidle');
await desktop.waitForTimeout(1200);
await desktop.screenshot({ path: `${OUT}/d1-hero.png` });

const totalHeight = await desktop.evaluate(() => document.body.scrollHeight);
const steps = 9;
for (let i = 1; i <= steps; i++) {
  const y = Math.round((totalHeight - 800) * (i / steps));
  await desktop.evaluate((v) => window.scrollTo(0, v), y);
  await desktop.waitForTimeout(700);
  await desktop.screenshot({ path: `${OUT}/d${i + 1}-scroll-${Math.round((i / steps) * 100)}.png` });
}
await desktop.close();

/* 2) 移动端 375px */
const mobile = await browser.newPage({ viewport: { width: 375, height: 720 } });
await mobile.goto(BASE + '/#/');
await mobile.waitForLoadState('networkidle');
await mobile.waitForTimeout(1200);
await mobile.screenshot({ path: `${OUT}/m1-hero.png` });
await mobile.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45));
await mobile.waitForTimeout(700);
await mobile.screenshot({ path: `${OUT}/m2-mid.png` });
await mobile.close();

/* 3) reduced-motion */
const reduced = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await reduced.goto(BASE + '/#/');
await reduced.waitForLoadState('networkidle');
await reduced.waitForTimeout(800);
await reduced.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.3));
await reduced.waitForTimeout(500);
await reduced.screenshot({ path: `${OUT}/r1-pomodoro.png` });
await reduced.close();

await browser.close();
console.log('verify shots done');
