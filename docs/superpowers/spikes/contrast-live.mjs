/**
 * 砚池对比度实测脚本 — 指向真实番茄钟页（spec §9 验收标准 2）
 *
 * 原型基线（docs/superpowers/spikes/contrast.mjs 实测，真实页面应达同等水平）：
 *   浅色 52%   阳文 7.68:1 / 阴文 7.41:1
 *   深色 52%   阳文 15.53:1 / 阴文 8.21:1
 *   浅色英语   阳文 9.26:1 / 阴文 8.93:1
 * 门槛：数字 62px 属大字号 ≥3:1；副标题 13px 属正文 ≥4.5:1（最紧，按它算）。
 *
 * 用法：dev server（5173/3001）已运行时 `node contrast-live.mjs`（依赖 e2e 的
 * @playwright/test）。脚本会登录测试账号、自建「砚池测量」预设并起 25 分钟
 * 会话（非低时态），然后在页内把 Date.now() 冻结到目标剩余比例 —— rAF 每帧按
 * 冻结时钟计算 live 分数并直写墨面 transform，无需等待真实时间流逝。
 * 运行结束会把会话提前完成，账号数据可反复测量。
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const EMAIL = process.env.INKWELL_TEST_EMAIL ?? 'inkwell-test@example.com';
const PASSWORD = process.env.INKWELL_TEST_PASSWORD ?? 'test-pass-123';
/** 测量预设（25 分钟 → 全程非低时态，排除低时金色对对比度的干扰） */
const PRESETS = {
  math: { name: '砚池测量·数学', subject: 'math', durationMinutes: 25 },
  english: { name: '砚池测量·英语', subject: 'english', durationMinutes: 25 },
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

async function login() {
  await p.goto(`${BASE}/#/login`);
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', PASSWORD);
  await p.click('button:has-text("登录")');
  await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 10000 });
}

async function gotoPomodoro() {
  await p.goto(`${BASE}/#/pomodoro`);
  await p.waitForSelector('.inkwell:not(.inkwell--mini)', { timeout: 15000 });
  await p.waitForTimeout(600);
}

/** 确保处于空闲态：提前完成进行中会话（播澄清）并回到空闲 */
async function ensureIdle() {
  if (await p.locator('button:has-text("提前完成")').count()) {
    await p.click('button:has-text("提前完成")');
    await p.waitForSelector('text=专注完成！', { timeout: 5000 });
    await p.click('button:has-text("继续专注")');
    await p.waitForTimeout(400);
  }
}

/** 起一轮指定科目的 25 分钟专注（预设按科目命名，避免 dock 科目排序点错卡） */
async function startSession(subjectKey) {
  const preset = PRESETS[subjectKey];
  await p.evaluate(async (body) => {
    await fetch('/api/v1/presets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }, preset);
  // 同 hash goto 不会重新导航，须 reload 让页面重新拉取预设列表
  await p.reload();
  await p.waitForSelector('.inkwell:not(.inkwell--mini)', { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.locator(`.preset-card:has-text("${preset.name}")`).first().click();
  await p.click('button:has-text("开始专注")');
  await p.waitForSelector('button:has-text("提前完成")', { timeout: 5000 });
  await p.waitForTimeout(700); // 注墨 520ms 收尾
}

/** 冻结页内时钟到剩余比例 frac（rAF 将持续把墨面写在该比例对应高度） */
async function freezeAt(frac) {
  await p.evaluate(async (frac) => {
    const res = await fetch('/api/v1/focus/active', { credentials: 'include' });
    const s = await res.json();
    if (!s) throw new Error('无进行中会话，无法冻结');
    const endMs = new Date(s.plannedEndAt).getTime();
    window.__realNow = Date.now.bind(Date);
    Date.now = () => endMs - frac * s.plannedDurationSeconds * 1000;
  }, frac);
  await p.waitForTimeout(400); // 等两个 rAF 帧以上，墨面写到冻结值
}

async function unfreeze() {
  await p.evaluate(() => {
    if (window.__realNow) Date.now = window.__realNow;
  });
}

async function setTheme(theme) {
  await p.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await p.waitForTimeout(300);
}

/**
 * 数字带 / 副标题带对比度：截图 → 5%/95% 分位亮度比（与原型 contrast.mjs 同法）。
 * 数字带按墨面位置拆阳文段（之上）/阴文段（之下）；副标题整带测一个值。
 */
async function measure() {
  const buf = await p.locator('.inkwell:not(.inkwell--mini)').screenshot();
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
  return await p.evaluate(async (url) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const svg = document.querySelector('.inkwell:not(.inkwell--mini) svg');
    const t = svg.querySelector('.inkwell__relief .inkwell__t-time').getBBox();
    const sub = svg.querySelector('.inkwell__relief .inkwell__t-sub');
    const surfY = parseFloat(
      svg.querySelector('.inkwell__surf-clip').getAttribute('transform').match(/-?[\d.]+/g).pop()
    );
    const k = img.width / 360;
    const L = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const band = (x, y0, y1, w) => {
      const h = Math.max(1, Math.round((y1 - y0) * k));
      const d = cx.getImageData(Math.round(x * k), Math.round(y0 * k), Math.round(w * k), h).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) px.push(L([d[i], d[i + 1], d[i + 2]]));
      px.sort((a, b) => a - b);
      const lo = px[Math.floor(px.length * 0.05)];
      const hi = px[Math.floor(px.length * 0.95)];
      return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
    };
    const top = t.y, bot = t.y + t.height;
    const out = {
      surfY: +surfY.toFixed(1),
      above: surfY > top + 4 ? band(t.x, top, Math.min(surfY, bot), t.width) : null,
      below: surfY < bot - 4 ? band(t.x, Math.max(surfY, top), bot, t.width) : null,
      subtitle: null,
    };
    if (sub) {
      const sb = sub.getBBox();
      out.subtitle = band(sb.x, sb.y, sb.y + sb.height, sb.width);
    }
    return out;
  }, dataUrl);
}

const fmt = (v) => (v === null ? '  —  ' : String(v).padStart(5));

// ================= 流程 =================
await login();
await gotoPomodoro();
await ensureIdle();

console.log('WCAG 对比度（真实页面 · 5%/95% 分位 · 数字大字号 ≥3:1，副标题正文 ≥4.5:1）\n');

// 场景 1/2：数学墨，浅色与深色 52%
await startSession('math');
await freezeAt(0.52);
const mathLight = await measure();
await setTheme('dark');
const mathDark = await measure();
await setTheme('light');
await unfreeze();

console.log(`浅色 数学 52%  阳文${fmt(mathLight.above)}:1   阴文${fmt(mathLight.below)}:1   副标题${fmt(mathLight.subtitle)}:1`);
console.log(`深色 数学 52%  阳文${fmt(mathDark.above)}:1   阴文${fmt(mathDark.below)}:1   副标题${fmt(mathDark.subtitle)}:1`);

// 场景 3：英语墨，浅色 52%（提前完成当前会话 → 澄清时序测量见下）
const t0 = Date.now();
await p.click('button:has-text("提前完成")');
await p.waitForSelector('text=专注完成！');
const clarifyMs = Date.now() - t0;
await p.click('button:has-text("继续专注")');
await p.waitForTimeout(400);
await startSession('english');
await freezeAt(0.52);
const engLight = await measure();
console.log(`浅色 英语 52%  阳文${fmt(engLight.above)}:1   阴文${fmt(engLight.below)}:1   副标题${fmt(engLight.subtitle)}:1`);

// 标准 8（零重渲染）：解冻后让会话自然走秒，观察 3s —— 期望除 rAF 直写的
// transform 外，仅中心数字两份文本（阳文 + mask）每秒各一次字符变更，
// 无节点增删/其他属性变更
await unfreeze();
await p.waitForTimeout(600); // 跳过解冻瞬间的追帧
const mutationStats = await p.evaluate(() => new Promise((resolve) => {
  const root = document.querySelector('.inkwell:not(.inkwell--mini)');
  let transformWrites = 0, textUpdates = 0, other = 0;
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes' && m.attributeName === 'transform') transformWrites++;
      else if (m.type === 'characterData') textUpdates++;
      else other++;
    }
  });
  obs.observe(root, { subtree: true, attributes: true, characterData: true, childList: true });
  setTimeout(() => { obs.disconnect(); resolve({ transformWrites, textUpdates, other }); }, 3000);
}));
console.log(`\n零重渲染（3s 观察窗）：rAF transform 写入 ${mutationStats.transformWrites} 次 / ` +
  `数字文本更新 ${mutationStats.textUpdates} 次（阳文+mask 各 1 次/秒）/ 其他变更 ${mutationStats.other} 次`);
console.log(`澄清时序（标准 7）：点击提前完成 → 完成卡出现 = ${clarifyMs}ms（须 ≥700ms）`);

// 场景 4（标准 4 末段）：f=3% 自动触发低时（剩余 45s ≤ 300s）——
// 薄墨面 + 池壁泛金 + 金色数字三者层次，数字段仍须 ≥3:1
await freezeAt(0.03);
const tailLight = await measure();
await p.locator('.inkwell:not(.inkwell--mini)').screenshot({ path: '/tmp/inkwell-tail-lowtime.png' });
console.log(`浅色 末段 3%（低时金） 阳文${fmt(tailLight.above)}:1   阴文${fmt(tailLight.below)}:1   副标题${fmt(tailLight.subtitle)}:1`);
await unfreeze();
await p.waitForTimeout(1000);

// 标准 5（mini 干净）：首页迷你砚池仅池底/墨面/阳文数字/凹陷，波纹动画须关闭
//（.inkwell__wave-a 元素本身是墨面裁剪形状，必然存在，检查的是计算样式）
await p.goto(`${BASE}/#/home`);
await p.waitForTimeout(800);
const mini = await p.evaluate(() => {
  const m = document.querySelector('.inkwell--mini');
  if (!m) return null;
  const anims = [...m.querySelectorAll('.inkwell__wave-a, .inkwell__wave-b')].map(
    (el) => getComputedStyle(el).animationName
  );
  return {
    waveAnimations: anims.every((a) => a === 'none'),
    marks: m.querySelectorAll('.inkwell__mark').length,
    spots: m.querySelectorAll('ellipse').length,
    timeText: m.querySelector('.inkwell__relief .inkwell__t-time')?.textContent ?? null,
  };
});
await p.locator('.inkwell--mini').screenshot({ path: '/tmp/inkwell-mini.png' }).catch(() => {});
console.log(`mini 干净（标准 5）：${JSON.stringify(mini)}（waveAnimations/marks/spots 应为 true/0/0，数字可读）`);

await b.close();
