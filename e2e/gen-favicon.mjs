// 一次性脚本：由 client/public/favicon.svg 生成 PNG 兜底图标
// - favicon-32x32.png：透明圆角（旧浏览器 tab 图标）
// - apple-touch-icon.png：全幅深色底（iOS 主屏幕图标不支持透明）
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pubDir = path.resolve(__dirname, '../client/public');
const svg = readFileSync(path.join(pubDir, 'favicon.svg'), 'utf8');

// 全幅变体：去掉圆角底板，深色铺满（apple touch icon）
const fullBleed = svg
  .replace('<rect x="2" y="2" width="60" height="60" rx="16" fill="#101828"/>',
           '<rect width="64" height="64" fill="#101828"/>')
  .replace('<clipPath id="clip"><rect x="2" y="2" width="60" height="60" rx="16"/></clipPath>',
           '<clipPath id="clip"><rect width="64" height="64"/></clipPath>')
  .replace(/<rect x="2" y="2" width="60" height="60" fill="url\(#(glowPurple|glowGreen)\)"\/>/g,
           '<rect width="64" height="64" fill="url(#$1)"/>');

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(content, size, omitBackground) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0">${content.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  );
  return page.screenshot({ omitBackground });
}

writeFileSync(path.join(pubDir, 'favicon-32x32.png'), await render(svg, 32, true));
writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), await render(fullBleed, 180, false));

await browser.close();
console.log('favicon-32x32.png & apple-touch-icon.png generated');
