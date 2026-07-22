/**
 * 介绍页 S4「真实界面」截图脚本（设计文档《滚动式介绍页设计》§6）
 *
 * 以真实账号访问应用，截取 首页 / 番茄钟 / 统计 三个真实页面，
 * 输出至 client/public/screenshots/（16:10，供 ScreenshotsSection 引用）。
 *
 * 流程（账号系统 T2.4 适配版，mock 已删除）：
 *   1. 真实 UI 注册临时账号（已存在则登录，脚本可重跑）；
 *   2. 为该账号准备演示数据（1 个预设 + 1 条 45 分钟学习记录），
 *      使截图信息密度与历史产物一致；
 *   3. 逐页截图；
 *   4. 清场：删除临时账号（业务数据 ON DELETE CASCADE）与其会话。
 *
 * 用法：确保 dev 环境运行（5173 + 3001）与 MySQL 可达，然后：
 *   node e2e/take-landing-screenshots.mjs
 * 数据库连接可用环境变量覆盖：DB_USER / DB_PASSWORD / DB_NAME / MYSQL_BIN。
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'child_process';
import { unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const BASE = process.env.LANDING_SHOT_BASE ?? 'http://localhost:5173';
const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/public/screenshots',
);

/* 截图专用临时账号（脚本结束即删除，不进入业务数据） */
const SHOT_EMAIL = 't25shots@example.com';
const SHOT_PASSWORD = 't25Passw0rd';

const PAGES = [
  { hash: '#/', name: 'home' },
  { hash: '#/pomodoro', name: 'pomodoro' },
  { hash: '#/statistics', name: 'statistics' },
];

/* ---------- 数据库小工具（仅用于演示数据准备与清场） ---------- */
const MYSQL_BIN = process.env.MYSQL_BIN ?? 'mysql';
const DB_NAME = process.env.DB_NAME ?? 'kaoyandaily';
const DB_ARGS = [
  `-u${process.env.DB_USER ?? 'root'}`,
  `-p${process.env.DB_PASSWORD ?? '0999'}`,
  DB_NAME,
  '-N',
  '-B',
];
function sql(query) {
  return execFileSync(MYSQL_BIN, [...DB_ARGS, '-e', query], { encoding: 'utf8' }).trim();
}

/* ---------- 1. 真实注册（已存在则登录） ---------- */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${BASE}/#/register`);
await page.waitForSelector('#register-email', { timeout: 10000 });
await page.fill('#register-email', SHOT_EMAIL);
await page.fill('#register-password', SHOT_PASSWORD);
await page.fill('#register-confirm', SHOT_PASSWORD);
await page.click('button:has-text("注册并登录")');
const registered = await page
  .waitForSelector('nav[aria-label="主导航"]', { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
if (!registered) {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-email', { timeout: 8000 });
  await page.fill('#login-email', SHOT_EMAIL);
  await page.fill('#login-password', SHOT_PASSWORD);
  await page.click('button:has-text("登录")');
  await page.waitForSelector('nav[aria-label="主导航"]', { timeout: 10000 });
}

/* ---------- 2. 演示数据（真实 API 建预设 + SQL 补一条历史学习记录） ---------- */
const userId = sql(`SELECT id FROM users WHERE email='${SHOT_EMAIL}'`);
if (!userId) throw new Error('临时账号查询失败');

await page.evaluate(async () => {
  const res = await fetch('/api/v1/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: '数学刷题', subject: 'math', durationMinutes: 45 }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`预设创建失败: ${res.status}`);
});

/* 学习记录表无创建 API（只能由专注会话产生），为还原历史截图的
   「本周 45 分钟 / 1 次」密度，直接向该临时账号插入一条演示记录；
   字段对照 study_records（见 server/src/db/schema.sql）。 */
const recordCount = Number(
  sql(`SELECT COUNT(*) FROM study_records WHERE user_id='${userId}' AND preset_name_snapshot='数学刷题'`) || '0',
);
if (recordCount === 0) {
  sql(
    `INSERT INTO study_records
       (id, user_id, preset_name_snapshot, subject_snapshot, sub_subject_snapshot,
        actual_duration_seconds, focus_session_id, task_id, course_episode_id,
        course_name_snapshot, episode_title_snapshot, source, created_at)
     VALUES (UUID(), '${userId}', '数学刷题', 'math', NULL,
             2700, NULL, NULL, NULL, NULL, NULL, 'focus_session', NOW())`,
  );
}

/* ---------- 3. 逐页截图 ---------- */
try {
  for (const target of PAGES) {
    await page.goto(`${BASE}/${target.hash}`);
    await page.waitForLoadState('networkidle');
    /* 等待入场动画与网络字体稳定，避免截图出现半透明元素/字体抖动 */
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, `${target.name}.png`) });
    console.log(`saved ${target.name}.png`);
  }
} finally {
  await browser.close();

  /* ---------- 4. 清场：会话 + 临时账号（业务数据级联删除） ---------- */
  sql(`DELETE FROM sessions WHERE data LIKE '%"userId":"${userId}"%'`);
  sql(`DELETE FROM users WHERE id='${userId}'`);
  console.log(`cleanup done: ${SHOT_EMAIL} 及其业务数据/会话已删除`);
}

/* ---------- 5. 压缩：PNG → WebP（P1-1 体积预算，应用引用 .webp） ----------
   调用 compress-screenshots.mjs 生成同名 .webp 后删除中间产物 PNG，
   保证 client/public/screenshots/ 只留 webp（否则会被打包进 dist 双倍占用）。 */
execFileSync(process.execPath, [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'compress-screenshots.mjs'),
], { stdio: 'inherit' });
for (const target of PAGES) {
  unlinkSync(path.join(OUT_DIR, `${target.name}.png`));
}
console.log('已删除中间产物 PNG，仅保留 webp');

console.log('done →', OUT_DIR);
