import { chromium } from '@playwright/test';
import path from 'path';

const FILE = 'file://' + path.resolve('docs/superpowers/spikes/2026-08-21-inkwell-spike.html');
const OUT = 'docs/superpowers/spikes';

const shots = [
  { name: 'a-light-full',   theme: 'light', pct: 100, low: false, mode: 'math' },
  { name: 'b-light-cross',  theme: 'light', pct: 52,  low: false, mode: 'math' },
  { name: 'c-light-tail',   theme: 'light', pct: 4,   low: true,  mode: 'math' },
  { name: 'd-dark-cross',   theme: 'dark',  pct: 52,  low: false, mode: 'math' },
  { name: 'e-dark-english', theme: 'dark',  pct: 70,  low: false, mode: 'english' },
  { name: 'f-light-break',  theme: 'light', pct: 60,  low: false, mode: 'break' },
  { name: 'g-light-empty',  theme: 'light', pct: 0,   low: false, mode: 'math' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(FILE, { waitUntil: 'load' });
await page.waitForTimeout(400);

for (const s of shots) {
  await page.evaluate(({ theme, pct, low, mode }) => {
    document.querySelector(`#themeSeg button[data-v="${theme}"]`).click();
    document.querySelector(`#modeSeg button[data-v="${mode}"]`)?.click();
    document.querySelector(`#modeSeg2 button[data-v="${mode}"]`)?.click();
    const m2 = document.querySelector(`#modeSeg2 button[data-v="${mode}"]`);
    if (m2) m2.click();
    const lt = document.getElementById('lowtime');
    if (lt.checked !== low) lt.click();
    const p = document.getElementById('pct');
    p.value = pct; p.dispatchEvent(new Event('input'));
  }, s);
  await page.waitForTimeout(260);
  await page.locator('.stage').screenshot({ path: `${OUT}/shot-${s.name}.png` });
}

// 读数校验
const readout = await page.evaluate(() => ({
  area: document.getElementById('roA').textContent,
  h: document.getElementById('roH').textContent,
  k: document.getElementById('roK').textContent,
  inkPaths: document.querySelectorAll('#wellFull .inkbody path').length,
  marks: document.querySelectorAll('#wellFull .marks line').length,
  hasMask: !!document.querySelector('#wellFull mask'),
  hasReliefClip: !!document.querySelector('#wellFull clipPath[id^="reliefClip"]'),
  surfTransform: document.querySelector('#wellFull .surf-g').getAttribute('transform'),
}));

console.log('读数：', JSON.stringify(readout, null, 2));
console.log(errors.length ? '❌ 错误：\n' + errors.join('\n') : '✅ 无 JS/console 错误');
await browser.close();
