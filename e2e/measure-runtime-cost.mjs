/**
 * 节能模式运行时开销基准（性能验收脚本）
 *
 * 回答一个问题：节能模式相对正常模式，前端运行时开销到底降了多少？
 *
 * ── 度量口径（2026-09-27 与需求方确认）──────────────────────────────
 *   CPU 侧：Chromium 进程树的 CPU 时间增量（renderer / gpu-process / browser 分别记账）
 *   GPU 侧：CDP Tracing 采到的 viz|cc|gpu 范畴事件忙碌时长合计
 *           （含 Display::DrawAndSwap / DirectRenderer::DrawFrame /
 *             SkiaOutputSurfaceImplOnGpu::* 等真实合成与光栅工作）
 *   合计：最终得分 = 0.3 × CPU 降幅 + 0.7 × GPU 降幅，门槛 ≥ 70%
 *   佐证：ioreg IOAccelerator 的 Device Utilization %（整机 GPU 占用，含显示扫描等
 *         与前端无关的常量底噪，故只作旁证、不入公式）、CDP Performance.getMetrics
 *         的主线程 / 样式 / 布局计数、绘制帧数。
 *
 * ── 为什么不只用 ioreg 的 GPU 占用 ────────────────────────────────
 *   实测该读数有 ~45% 的常量底（显示扫描 + 窗口服务），前端全部静止也降不到 0，
 *   用它当门槛会让「降 70%」在数学上不可能达成；故门槛用可归因到浏览器的
 *   viz/cc/gpu 忙碌时长，ioreg 作为「真机 GPU 确实更闲了」的旁证。
 *
 * ── 用法 ────────────────────────────────────────────────────────
 *   前置：另开终端 npm run dev:client（本脚本不自起 dev server，避免污染测量）
 *   node e2e/measure-runtime-cost.mjs                    # 默认 3 轮 × 4 场景
 *   node e2e/measure-runtime-cost.mjs --reps=1 --seconds=6   # 快速冒烟
 *   node e2e/measure-runtime-cost.mjs --flat-glass        # 额外测 Level B（去玻璃模糊）
 *   node e2e/measure-runtime-cost.mjs --headless          # 无窗口（软件合成，数值仅供对比）
 *
 *   退出码：0 = 达标；1 = 未达标；2 = 环境不满足（dev server 未启动 / 无 Chrome）
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

/* ---------- 参数 ---------- */
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const REPS = Number(arg('reps', 3));
const SECONDS = Number(arg('seconds', 10));
const FLAT_GLASS = process.argv.includes('--flat-glass');
const HEADLESS = process.argv.includes('--headless');
const JSON_OUT = arg('json', '');
const BASELINE_URL = arg('url', 'http://localhost:5173');
const GATE = 70; // 达标线（%）

const MARKER = `kaoyandaily-perf-${Date.now()}`;
const PAD = (s, n) => String(s).padEnd(n);
const PADL = (s, n) => String(s).padStart(n);
const pct = (a, b) => (a === 0 ? 0 : 100 * (1 - b / a));

/* ---------- 环境检查 ---------- */
const probe = await fetch(BASELINE_URL).then((r) => r.ok).catch(() => false);
if (!probe) {
  console.error(`✗ ${BASELINE_URL} 无响应。请先另开终端执行：npm run dev:client`);
  process.exit(2);
}

/* ---------- CPU：Chromium 进程树 ---------- */
function psTable() {
  const out = execSync('ps -eo pid,ppid,time,args', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const rows = [];
  for (const line of out.split('\n').slice(1)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (m) rows.push({ pid: +m[1], ppid: +m[2], time: m[3], args: m[4] });
  }
  return rows;
}

function parseCpuTime(t) {
  // ps 的 TIME 形如 0:00.05 / 12:34.56 / 1:02:03
  const daySplit = t.split('-'); // 天分隔（本场景不会出现，稳妥处理）
  const days = daySplit.length > 1 ? Number(daySplit[0]) : 0;
  const parts = (daySplit.at(-1) ?? t).split(':').map(Number);
  const secs =
    parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts.length === 2 ? parts[0] * 60 + parts[1]
    : (parts[0] ?? 0);
  return days * 86400 + secs;
}

function treeCpu(rootPid) {
  const procs = psTable();
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const children = new Map();
  for (const p of procs) {
    if (!children.has(p.ppid)) children.set(p.ppid, []);
    children.get(p.ppid).push(p.pid);
  }
  const acc = { tree: 0, renderer: 0, gpuProc: 0, browser: 0, procs: 0 };
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    const p = byPid.get(pid);
    if (!p) continue;
    const cpu = parseCpuTime(p.time);
    acc.tree += cpu;
    acc.procs += 1;
    if (p.args.includes('--type=renderer')) acc.renderer += cpu;
    else if (p.args.includes('--type=gpu-process')) acc.gpuProc += cpu;
    else if (pid === rootPid) acc.browser += cpu;
    for (const c of children.get(pid) ?? []) stack.push(c);
  }
  return acc;
}

/* ---------- GPU：整机占用（旁证） ---------- */
function gpuDeviceUtil() {
  try {
    const out = execSync(
      `ioreg -r -c IOAccelerator -d 1 2>/dev/null | grep -o '"Device Utilization %"=[0-9]*' | head -1`,
      { encoding: 'utf8' },
    );
    const n = parseInt(out.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/* ---------- 采样窗口 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measureWindow(page, cdp, seconds) {
  // 预热 1s：把上一窗口的收尾帧与定时器抖动排除
  await sleep(1000);

  const cpu0 = treeCpu(ROOT_PID);
  const m0 = await cdp.send('Performance.getMetrics').catch(() => null);
  const util = [];
  const utilTimer = setInterval(() => {
    const v = gpuDeviceUtil();
    if (v !== null) util.push(v);
  }, 1000);

  // Tracing：增量聚合，不保留原始事件（12s 窗口可达 20 万事件）
  let gpuBusyUs = 0;
  let drawFrames = 0;
  const onTrace = (e) => {
    for (const ev of e.value) {
      if (ev.ph !== 'X' || !ev.dur) continue;
      if (/(^|,)(viz|cc|gpu)(,|$)/.test(ev.cat)) gpuBusyUs += ev.dur;
      if (ev.name === 'Display::DrawAndSwap') drawFrames += 1;
    }
  };
  cdp.on('Tracing.dataCollected', onTrace);
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,cc,gpu,viz,benchmark',
    transferMode: 'ReportEvents',
  });

  await sleep(seconds * 1000);
  await new Promise((res) => {
    cdp.once('Tracing.tracingComplete', res);
    cdp.send('Tracing.end');
  });
  cdp.off('Tracing.dataCollected', onTrace);
  clearInterval(utilTimer);

  const cpu1 = treeCpu(ROOT_PID);
  const m1 = await cdp.send('Performance.getMetrics').catch(() => null);
  const metric = (mm, name) =>
    mm ? (mm.metrics.find((x) => x.name === name)?.value ?? 0) : 0;

  return {
    seconds,
    // CPU（秒）
    cpuTree: +(cpu1.tree - cpu0.tree).toFixed(3),
    cpuRenderer: +(cpu1.renderer - cpu0.renderer).toFixed(3),
    cpuGpuProc: +(cpu1.gpuProc - cpu0.gpuProc).toFixed(3),
    // GPU（毫秒忙碌时长）
    gpuBusyMs: +(gpuBusyUs / 1000).toFixed(1),
    drawFrames,
    ioregUtil: util.length ? +(util.reduce((a, b) => a + b, 0) / util.length).toFixed(1) : null,
    // 主线程 / 样式 / 布局（佐证）
    taskDurMs: +((metric(m1, 'TaskDuration') - metric(m0, 'TaskDuration')) * 1000).toFixed(1),
    scriptDurMs: +((metric(m1, 'ScriptDuration') - metric(m0, 'ScriptDuration')) * 1000).toFixed(1),
    layoutDurMs: +((metric(m1, 'LayoutDuration') - metric(m0, 'LayoutDuration')) * 1000).toFixed(1),
    recalcStyleDurMs: +((metric(m1, 'RecalcStyleDuration') - metric(m0, 'RecalcStyleDuration')) * 1000).toFixed(1),
    layoutCount: metric(m1, 'LayoutCount') - metric(m0, 'LayoutCount'),
    recalcStyleCount: metric(m1, 'RecalcStyleCount') - metric(m0, 'RecalcStyleCount'),
  };
}

/* ---------- 场景 ---------- */
/** 进入本地模式应用（离线、无需数据库与服务器会话）。
 *  本地账户已激活时直接进应用——此时 #/local 属 GUEST_ONLY_PAGES，会被守卫重定向回 #/，
 *  死等 #local-email 必然超时（踩过）。 */
async function enterLocalApp(page) {
  if (await page.locator('.top-nav').count()) return;
  // 必须先导航：about:blank 上读 localStorage 会抛 SecurityError
  await page.goto(`${BASELINE_URL}/#/`);
  const hasAccount = await page.evaluate(() =>
    !!localStorage.getItem('kaoyandaily_local_activeAccount'),
  );
  if (!hasAccount) {
    await page.goto(`${BASELINE_URL}/#/local`);
    await page.waitForSelector('#local-email', { timeout: 30000 });
    await page.locator('#local-email').fill(`perf-${Date.now()}@local.test`);
    await page.getByRole('button', { name: '创建本地账户', exact: true }).click();
    await page.locator('[aria-label^="以 "]').first().click();
  }
  await page.waitForSelector('.top-nav', { timeout: 30000 });
}

/** 确保有一轮进行中的专注（幂等：已在进行中则直接返回；失败时打印页面状态便于定位） */
async function ensureFocusSession(page) {
  await page.evaluate(() => { location.hash = '#/pomodoro'; });
  const start = page.getByRole('button', { name: '开始专注' });
  const done = page.getByRole('button', { name: '提前完成' });
  for (let i = 0; i < 60; i++) {
    if (await done.isVisible().catch(() => false)) return; // 已在进行中
    if (await start.isVisible().catch(() => false)) {
      await start.click({ timeout: 15000 }).catch(() => {});
      await done.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
      if (await done.isVisible().catch(() => false)) return;
      break;
    }
    await sleep(500);
  }
  const state = await page.evaluate(() => ({
    hash: location.hash,
    mode: document.documentElement.getAttribute('data-power-save'),
    text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 400),
  }));
  throw new Error(`未能开始专注：${JSON.stringify(state)}`);
}

const SCENARIOS = [
  {
    name: 'home',
    context: 'app',
    note: '首页挂机（专注进行中）',
    async prepare(page) {
      await ensureFocusSession(page);
      await page.evaluate(() => { location.hash = '#/'; });
      await page.waitForSelector('.aurora-blob');
    },
  },
  {
    name: 'pomodoro',
    context: 'app',
    note: '番茄钟（专注进行中，墨面推进）',
    async prepare(page) {
      await ensureFocusSession(page);
    },
  },
  {
    name: 'statistics',
    context: 'app',
    note: '统计页（学习森林）',
    async prepare(page) {
      await page.evaluate(() => { location.hash = '#/statistics'; });
      await page.waitForSelector('.forest', { timeout: 30000 });
    },
  },
  {
    name: 'landing',
    context: 'guest',
    note: '介绍页滚动（未登录公开页）',
    async prepare(page) {
      await page.goto(`${BASELINE_URL}/#/`);
      await page.waitForSelector('.landing-hero', { timeout: 30000 });
    },
    async during(page, seconds) {
      // 持续滚动：驱动 framer 视差与 whileInView（正常模式最重的每帧路径）
      const end = Date.now() + seconds * 1000;
      let y = 0;
      while (Date.now() < end) {
        y += 600;
        await page.mouse.wheel(0, 600);
        await sleep(400);
        if (y > 6000) { await page.evaluate(() => window.scrollTo(0, 0)); y = 0; }
      }
    },
  },
];

/* ---------- 模式切换（走应用自身的代码路径） ---------- */
async function setMode(page, on) {
  const isOn = await page.evaluate(() => document.documentElement.getAttribute('data-power-save') === 'on');
  if (isOn === on) return;
  const hasButton = await page.locator('.power-save-toggle').count();
  if (hasButton) {
    // 真实用户路径：顶栏按钮 → setPowerSave() → 属性 + localStorage + React 通知
    await page.locator('.power-save-toggle').click();
  } else {
    // 未登录落地页没有顶栏：走 storage 事件路径（等价于另一标签页切换模式），
    // 与按钮一样会设属性并通知 React 订阅者（见 utils/powerSave.ts initPowerSave）
    await page.evaluate((next) => {
      const value = next ? 'on' : 'off';
      localStorage.setItem('kaoyandaily-power-save', value);
      window.dispatchEvent(new StorageEvent('storage', { key: 'kaoyandaily-power-save', newValue: value }));
    }, on);
  }
  await sleep(400);
  const now = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-power-save'),
    stored: localStorage.getItem('kaoyandaily-power-save'),
  }));
  if ((now.attr === 'on') !== on) throw new Error(`模式切换失败：期望 ${on}，实际 ${JSON.stringify(now)}`);
}

async function setFlatGlass(page, on) {
  await page.evaluate((v) => {
    if (v) document.documentElement.setAttribute('data-flat-glass', '');
    else document.documentElement.removeAttribute('data-flat-glass');
  }, on);
  await sleep(300);
}

/* ---------- 主流程 ---------- */
const browser = await chromium.launch({
  channel: 'chrome',
  headless: HEADLESS,
  args: [`--${MARKER}`],
});

let ROOT_PID = 0;
{
  const procs = psTable();
  const root = procs.find((p) => p.args.includes(MARKER) && !p.args.includes('--type='));
  if (!root) {
    console.error('✗ 未找到 Chromium 主进程 pid');
    await browser.close();
    process.exit(2);
  }
  ROOT_PID = root.pid;
}

/* 两个 context 分开：应用（本地模式登录态）与访客（未登录落地页）。
   测量窗口内只保留当前场景的页面 —— 后台标签仍会驱动 CSS 动画与合成，
   混在一起会污染另一侧的读数。 */
const contexts = { app: null, guest: null };
const pages = { app: null, guest: null };
const cdps = { app: null, guest: null };
let activeKind = null;

async function usePage(kind) {
  for (const other of ['app', 'guest']) {
    if (other !== kind && pages[other]) {
      await pages[other].close();
      pages[other] = null;
      cdps[other] = null;
    }
  }
  if (!contexts[kind]) {
    contexts[kind] = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'no-preference',
    });
  }
  if (!pages[kind]) {
    pages[kind] = await contexts[kind].newPage();
    cdps[kind] = await contexts[kind].newCDPSession(pages[kind]);
    // Performance 域需显式 enable 才会累积 TaskDuration / LayoutCount 等计数
    await cdps[kind].send('Performance.enable').catch(() => {});
    if (kind === 'app') await enterLocalApp(pages[kind]);
  }
  activeKind = kind;
  return pages[kind];
}

console.log(`节能模式运行时开销基准`);
console.log(`  浏览器：系统 Chrome（${HEADLESS ? 'headless' : 'headed'}） pid=${ROOT_PID}`);
console.log(`  轮次：${REPS}  每窗口：${SECONDS}s  场景：${SCENARIOS.map((s) => s.name).join(' / ')}`);
console.log(`  Level B（去玻璃模糊）：${FLAT_GLASS ? '参与测量' : '不参与'}\n`);

const samples = []; // { scenario, mode, rep, ...metrics }
for (let rep = 1; rep <= REPS; rep++) {
  for (const sc of SCENARIOS) {
    for (const mode of ['normal', 'power']) {
      const page = await usePage(sc.context);
      const cdp = cdps[activeKind];
      await sc.prepare(page);
      await setMode(page, mode === 'power');
      await setFlatGlass(page, mode === 'power' && FLAT_GLASS);
      await sleep(1200); // 状态稳定

      const during = sc.during ? sc.during(page, SECONDS) : null;
      const m = await measureWindow(page, cdp, SECONDS);
      if (during) await during;
      samples.push({ scenario: sc.name, mode, rep, ...m });
      process.stdout.write(
        `  · ${PAD(sc.name, 11)} ${PAD(mode, 7)} rep${rep}  cpuTree=${PADL(m.cpuTree, 6)}s  gpuBusy=${PADL(m.gpuBusyMs, 8)}ms  frames=${PADL(m.drawFrames, 5)}  util=${PADL(m.ioregUtil ?? '-', 4)}%\n`,
      );
    }
  }
}

await browser.close();


/* ---------- 汇总（中位数 + 时长加权） ---------- */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const agg = (scenario, mode, key) =>
  median(samples.filter((s) => s.scenario === scenario && s.mode === mode).map((s) => s[key]));

const METRICS = [
  ['cpuTree', 'CPU 进程树（s）', 'cpu'],
  ['cpuRenderer', 'CPU renderer（s）', 'cpu'],
  ['cpuGpuProc', 'CPU gpu进程（s）', 'cpu'],
  ['gpuBusyMs', 'GPU 忙碌（ms）', 'gpu'],
  ['drawFrames', '绘制帧数（次）', 'gpu'],
  ['ioregUtil', '整机GPU占用（%）', 'info'],
  ['taskDurMs', '主线程任务（ms）', 'info'],
  ['scriptDurMs', 'JS 执行（ms）', 'info'],
  ['layoutDurMs', '布局（ms）', 'info'],
  ['recalcStyleDurMs', '样式重算（ms）', 'info'],
  ['layoutCount', '布局次数', 'info'],
  ['recalcStyleCount', '样式重算次数', 'info'],
];

console.log(`\n${'='.repeat(96)}`);
console.log(`逐场景结果（${REPS} 轮中位数；窗口 ${SECONDS}s，故 CPU 秒数 ≈ 单核占比 × ${SECONDS}s）`);
console.log(`${'='.repeat(96)}`);
for (const sc of SCENARIOS) {
  console.log(`\n【${sc.name}】${sc.note}`);
  console.log(`  ${PAD('指标', 20)} ${PADL('正常', 10)} ${PADL('节能', 10)} ${PADL('降幅', 9)}`);
  for (const [key, label, kind] of METRICS) {
    const a = agg(sc.name, 'normal', key);
    const b = agg(sc.name, 'power', key);
    if (a === null && b === null) continue;
    const d = kind === 'info' ? '' : `${pct(a, b).toFixed(1)}%`;
    console.log(`  ${PAD(label, 20)} ${PADL(a, 10)} ${PADL(b, 10)} ${PADL(d, 9)}`);
  }
}

/* 时长加权总降幅（各场景窗口时长相同 → 等权；若将来权重不同，改此处） */
const cpuR = SCENARIOS.reduce((a, sc) => a + pct(agg(sc.name, 'normal', 'cpuTree'), agg(sc.name, 'power', 'cpuTree')), 0) / SCENARIOS.length;
const gpuR = SCENARIOS.reduce((a, sc) => a + pct(agg(sc.name, 'normal', 'gpuBusyMs'), agg(sc.name, 'power', 'gpuBusyMs')), 0) / SCENARIOS.length;
const score = 0.3 * cpuR + 0.7 * gpuR;

console.log(`\n${'='.repeat(96)}`);
console.log(`总评（0.3 × CPU 降幅 + 0.7 × GPU 降幅）`);
console.log(`${'='.repeat(96)}`);
console.log(`  CPU 降幅（进程树 CPU 时间）      ${cpuR.toFixed(1)}%   × 0.3 = ${(0.3 * cpuR).toFixed(1)}`);
console.log(`  GPU 降幅（viz/cc/gpu 忙碌时长）   ${gpuR.toFixed(1)}%   × 0.7 = ${(0.7 * gpuR).toFixed(1)}`);
console.log(`  ────────────────────────────────────────────`);
console.log(`  加权合计                        ${score.toFixed(1)}%   （门槛 ${GATE}%）`);

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      { meta: { reps: REPS, seconds: SECONDS, flatGlass: FLAT_GLASS, headless: HEADLESS, gate: GATE, at: new Date().toISOString(), cpuR, gpuR, score }, samples },
      null,
      2,
    ),
  );
  console.log(`\n  原始数据已写入 ${JSON_OUT}`);
}

if (score >= GATE) {
  console.log(`\n✓ 达标：节能模式加权降幅 ${score.toFixed(1)}% ≥ ${GATE}%`);
  process.exit(0);
}
console.log(`\n✗ 未达标：加权降幅 ${score.toFixed(1)}% < ${GATE}%（考虑启用 Level B：加 --flat-glass 复测，或追加优化手段）`);
process.exit(1);
