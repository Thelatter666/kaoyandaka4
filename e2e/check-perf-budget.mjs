/**
 * 性能预算守门脚本（性能优化 P2-5）
 *
 * 对 client/dist 构建产物做静态断言，任一失败以非零码退出并打印明细：
 *   1. index.html 的 modulepreload 不包含 motion-vendor（动效库不得进首屏关键路径）
 *   2. 所有 assets/*.js 不含 "invalid_type" 字符串（zod 不得泄漏进前端包）
 *   3. 应用页首屏 JS（入口 + modulepreload 的 vendor chunk 原始体积合计）≤ 200KB
 *   4. client/public/screenshots 目录总大小 ≤ 250KB
 *
 * 用法：先 npm run build，再 node e2e/check-perf-budget.mjs（或 cd e2e && npm run check:budget）
 * Node 零依赖，可直接在 CI 中运行。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'client/dist');
const ASSETS = path.join(DIST, 'assets');
const SCREENSHOTS = path.join(ROOT, 'client/public/screenshots');

/* 预算阈值 */
const ENTRY_JS_BUDGET = 200 * 1024; // 首屏 JS 原始体积
const SCREENSHOTS_BUDGET = 250 * 1024; // 截图目录总大小

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

/* dist 不存在时给出明确提示（需先构建） */
if (!existsSync(DIST) || !existsSync(path.join(DIST, 'index.html'))) {
  console.error('client/dist 不存在或缺少 index.html，请先在仓库根目录执行 npm run build');
  process.exit(1);
}

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`✗ ${msg}`);
};
const pass = (msg) => console.log(`✓ ${msg}`);

const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');

/* ---------- 断言 1：modulepreload 不含 motion-vendor ---------- */
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
  (m) => m[1],
);
const motionPreloaded = preloads.filter((href) => href.includes('motion-vendor'));
if (motionPreloaded.length > 0) {
  fail(`index.html modulepreload 含 motion-vendor：${motionPreloaded.join(', ')}`);
} else {
  pass(`modulepreload 不含 motion-vendor（当前预载：${preloads.join(', ') || '无'}）`);
}

/* ---------- 断言 2：assets/*.js 不含 "invalid_type"（zod 泄漏） ---------- */
const jsFiles = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const zodLeaks = jsFiles.filter((f) =>
  readFileSync(path.join(ASSETS, f), 'utf8').includes('invalid_type'),
);
if (zodLeaks.length > 0) {
  fail(`以下 JS 含 "invalid_type"（zod 泄漏）：${zodLeaks.join(', ')}`);
} else {
  pass(`全部 ${jsFiles.length} 个 JS 均不含 "invalid_type"`);
}

/* ---------- 断言 3：首屏 JS ≤ 200KB（入口 + modulepreload 原始体积） ---------- */
const entrySrc = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
if (!entrySrc) {
  fail('index.html 未找到 module 入口 script');
} else {
  const critical = [entrySrc, ...preloads];
  let total = 0;
  const detail = [];
  for (const href of critical) {
    const file = path.join(DIST, href.replace(/^\//, ''));
    const size = statSync(file).size;
    total += size;
    detail.push(`  ${path.basename(href)}: ${kb(size)}`);
  }
  const msg = `首屏 JS 合计 ${kb(total)}（预算 ${kb(ENTRY_JS_BUDGET)}）\n${detail.join('\n')}`;
  if (total > ENTRY_JS_BUDGET) fail(msg);
  else pass(msg);
}

/* ---------- 断言 4：screenshots 目录总大小 ≤ 250KB ---------- */
if (!existsSync(SCREENSHOTS)) {
  fail(`截图目录不存在：${SCREENSHOTS}`);
} else {
  const files = readdirSync(SCREENSHOTS).filter((f) => !f.startsWith('.'));
  let total = 0;
  const detail = [];
  for (const f of files) {
    const size = statSync(path.join(SCREENSHOTS, f)).size;
    total += size;
    detail.push(`  ${f}: ${kb(size)}`);
  }
  const msg = `screenshots 目录合计 ${kb(total)}（预算 ${kb(SCREENSHOTS_BUDGET)}）\n${detail.join('\n')}`;
  if (total > SCREENSHOTS_BUDGET) fail(msg);
  else pass(msg);
}

if (failed) {
  console.error('\n性能预算检查未通过');
  process.exit(1);
}
console.log('\n性能预算检查全部通过');
