/**
 * 介绍页 S4「真实界面」截图脚本（设计文档《滚动式介绍页设计》§6）
 *
 * 以 mock 登录态访问应用，截取 首页 / 番茄钟 / 统计 三个真实页面，
 * 输出至 client/public/screenshots/（16:10，供 ScreenshotsSection 引用）。
 *
 * 用法：确保 dev 环境运行（5173 + 3001），然后：
 *   node e2e/take-landing-screenshots.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const BASE = process.env.LANDING_SHOT_BASE ?? 'http://localhost:5173';
const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/public/screenshots',
);

const PAGES = [
  { hash: '#/', name: 'home' },
  { hash: '#/pomodoro', name: 'pomodoro' },
  { hash: '#/statistics', name: 'statistics' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

/* mock 登录态（useAuth 读取 localStorage 开关）。
   同标签页写 localStorage 不触发 storage 事件，需 reload 让 App 重挂载读取。 */
await page.goto(BASE + '/#/');
await page.evaluate(() => window.localStorage.setItem('yantai_mock_auth', '1'));
await page.reload();

for (const target of PAGES) {
  await page.goto(`${BASE}/${target.hash}`);
  await page.waitForLoadState('networkidle');
  /* 等待入场动画与网络字体稳定，避免截图出现半透明元素/字体抖动 */
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, `${target.name}.png`) });
  console.log(`saved ${target.name}.png`);
}

await browser.close();
console.log('done →', OUT_DIR);
