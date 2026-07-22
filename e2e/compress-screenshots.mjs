/**
 * 介绍页截图压缩脚本（性能优化 P1-1）
 *
 * 读取 client/public/screenshots/ 下的三张 PNG，输出同名 .webp 到同目录，
 * 并打印转换前后体积对比。截图更新（take-landing-screenshots.mjs 重跑）后
 * 可复用本脚本重新压缩。
 *
 * 用法：node e2e/compress-screenshots.mjs
 * 质量：默认 80；若合计超过 250KB 预算，可通过环境变量 WEBP_QUALITY 降低（如 75）。
 */
import sharp from 'sharp';
import { statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/public/screenshots',
);
const NAMES = ['home', 'pomodoro', 'statistics'];
const QUALITY = Number(process.env.WEBP_QUALITY ?? 80);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

let totalBefore = 0;
let totalAfter = 0;

for (const name of NAMES) {
  const src = path.join(DIR, `${name}.png`);
  const dst = path.join(DIR, `${name}.webp`);
  if (!existsSync(src)) {
    console.error(`缺少源文件：${src}`);
    process.exit(1);
  }
  const info = await sharp(src).webp({ quality: QUALITY }).toFile(dst);
  const before = statSync(src).size;
  const after = statSync(dst).size;
  totalBefore += before;
  totalAfter += after;
  console.log(
    `${name}.png ${kb(before)} → ${name}.webp ${kb(after)}（${info.width}x${info.height}，quality=${QUALITY}）`,
  );
}

console.log(`合计：${kb(totalBefore)} → ${kb(totalAfter)}`);
if (totalAfter > 250 * 1024) {
  console.warn('警告：webp 合计超过 250KB 预算，请降低 WEBP_QUALITY 重试（如 75）');
  process.exit(1);
}
