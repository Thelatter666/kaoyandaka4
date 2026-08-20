# 砚池 Inkstone Well 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 执行方式已由 mywf 决策门定案：**本对话内分批执行 + 完整审核**（Q1-B / Q2-A）。不派子代理 —— 视觉调参必须「边做边看」，spike 阶段的 4 个 bug 全是看到渲染结果才暴露的。

**Goal:** 把番茄钟计时器从「极光玻璃圆环」重做为砚池 Inkstone Well —— 墨面高度表达本轮剩余、池壁外沿水痕表达今日累积。

**Architecture:** 纯函数（等面积映射 LUT、波形路径生成）抽成两个独立模块以便在 node 环境下单测；`RingCountdown` 重写为 SVG 砚池，每帧只写墨面平移量，波纹交给 CSS 无限动画；双主题差异与降级全部由 CSS 承担，零 JS 分支；`PomodoroPage` 只改完成态切换时序。

**Tech Stack:** React 18 + TypeScript、SVG（mask / clipPath）、CSS 自定义属性、Vitest（node 环境）

## Global Constraints

- 设计依据：`docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md`（以下简称 spec）、`docs/adr/0001`–`0004`、术语表 `CONTEXT.md`
- 参考实现：`docs/superpowers/spikes/2026-08-21-inkwell-spike.html`（已验证的交互原型，几何与参数以它为准）
- **术语**：全程使用 `CONTEXT.md` 正式术语（砚池 / 墨堂 / 墨面 / 池壁 / 水痕 / 注墨 / 澄清 / 涟漪 / 阳文 / 阴文 / 反光带）。禁止出现「光晕核心 / 进度环 / 刻度珠」
- **颜色红线**：组件 CSS 只写 `var(--color-xxx)`，禁止字面色值。所有新色进 `client/src/styles/tokens.css`
- **vitest 环境是 node，不是 jsdom**：单测只覆盖纯函数。新模块中 `@shared` 只允许 `import type`（编译期擦除），禁止运行时导入
- **不动业务逻辑**：`plannedEndAt` 单一真源、响铃 worker、会话恢复、统计口径一律不改
- **不动落地页** `client/src/components/landing/FeaturePomodoroSection.tsx`（延后项）
- **零重渲染约束**：rAF 每帧只写 SVG 属性，不得 setState；中心数字每秒至多 1 次 setState
- 几何常量（viewBox 单位）：`VB=360`、`C=180`、`R_WALL=160`、`R_SAFE=104`、`R_MARK_IN=168`、`R_MARK_OUT=176`、`SURFACE_TRAVEL=320`
- 每个 Task 结束前必须 `npx vitest run` 与 `npm run lint` 全绿；既有 97 tests 不得回归

---

### Task 1: 等面积映射模块（纯函数，TDD）

**Files:**
- Create: `client/src/components/timer/inkSurface.ts`
- Test: `client/src/components/timer/inkSurface.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `SURFACE_TRAVEL: 320`
  - `areaToHeight(f: number): number` — 剩余面积占比 → 墨面高度占比，输入越界自动钳制到 [0,1]
  - `surfaceY(f: number): number` — 墨面在 viewBox 中的 y 坐标（供组件与后续 Task 使用）

- [ ] **Step 1: 写失败测试**

创建 `client/src/components/timer/inkSurface.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { areaToHeight, surfaceY, SURFACE_TRAVEL } from './inkSurface';

describe('areaToHeight — 等面积映射（ADR-0003）', () => {
  it('边界钉死：空池与满池', () => {
    expect(areaToHeight(0)).toBe(0);
    expect(areaToHeight(1)).toBe(1);
  });

  it('中点严格对称：半池面积对应半池高度', () => {
    expect(areaToHeight(0.5)).toBeCloseTo(0.5, 6);
  });

  it('末段高度被放大（这正是本映射存在的理由）', () => {
    // 圆内弓形：面积 1% → 高度约 3.3%；5% → 约 9.7%；10% → 约 15.6%
    expect(areaToHeight(0.01)).toBeCloseTo(0.033, 2);
    expect(areaToHeight(0.05)).toBeCloseTo(0.097, 2);
    expect(areaToHeight(0.10)).toBeCloseTo(0.156, 2);
  });

  it('放大倍数随剩余减少而增大', () => {
    const k = (f: number) => areaToHeight(f) / f;
    expect(k(0.01)).toBeGreaterThan(k(0.05));
    expect(k(0.05)).toBeGreaterThan(k(0.10));
    expect(k(0.10)).toBeGreaterThan(1);
  });

  it('单调不减', () => {
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const h = areaToHeight(i / 200);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('越界输入被钳制', () => {
    expect(areaToHeight(-0.5)).toBe(0);
    expect(areaToHeight(1.5)).toBe(1);
  });
});

describe('surfaceY — 墨面 y 坐标', () => {
  it('满池在池顶，空池在池底', () => {
    expect(surfaceY(1)).toBeCloseTo(20, 6);   // 180 + 160 - 320
    expect(surfaceY(0)).toBeCloseTo(340, 6);  // 180 + 160
  });

  it('SURFACE_TRAVEL 为池直径', () => {
    expect(SURFACE_TRAVEL).toBe(320);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run client/src/components/timer/inkSurface.test.ts`
Expected: FAIL —— `Failed to resolve import "./inkSurface"`

- [ ] **Step 3: 写实现**

创建 `client/src/components/timer/inkSurface.ts`：

```ts
/**
 * 砚池墨面几何：等面积映射（ADR-0003）
 *
 * 墨面高度由「剩余面积占比」决定，而非线性对应剩余比例 —— 圆形墨堂底部收窄，
 * 线性映射会把末段（剩余不足 5 分钟）的高度变化压缩到几乎不可见，而那恰是最
 * 需要被感知的时刻。
 *
 * 圆内弓形：面积占比 f = (θ - sinθ)/2π，高度占比 h = (1 - cos(θ/2))/2。
 * f → h 无闭式解，故模块加载时预生成查找表 + 每帧线性插值。
 *
 * ⚠ 不要把 areaToHeight(f) 简化成 f —— 会静默摧毁末段可读性，且无任何测试报错。
 */

/** 池壁圆心 y 与半径（viewBox 单位，与 RingCountdown 共用） */
const CENTER = 180;
const R_WALL = 160;

/** 墨面行程：自池底到池顶的总位移 = 池直径 */
export const SURFACE_TRAVEL = 2 * R_WALL;

/** 查找表点数：101 点在 400px 上的高度误差 < 0.2px，足够 */
const LUT_N = 101;

/** 以 θ 均匀采样得到单调的 (f, h) 序列，再按 f 等距重采样为查找表 */
const LUT: Float64Array = (() => {
  const SAMPLES = 4096;
  const fs: number[] = [];
  const hs: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const theta = (i / SAMPLES) * 2 * Math.PI;
    fs.push((theta - Math.sin(theta)) / (2 * Math.PI));
    hs.push((1 - Math.cos(theta / 2)) / 2);
  }
  const table = new Float64Array(LUT_N);
  let j = 0;
  for (let k = 0; k < LUT_N; k++) {
    const f = k / (LUT_N - 1);
    while (j < SAMPLES && fs[j + 1] < f) j++;
    const f0 = fs[j];
    const f1 = fs[j + 1] ?? 1;
    const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
    table[k] = hs[j] + ((hs[j + 1] ?? 1) - hs[j]) * t;
  }
  table[0] = 0;
  table[LUT_N - 1] = 1;
  return table;
})();

/** 剩余面积占比 → 墨面高度占比（越界钳制到 [0,1]） */
export function areaToHeight(f: number): number {
  const clamped = Math.min(1, Math.max(0, f));
  const x = clamped * (LUT_N - 1);
  const i = Math.floor(x);
  if (i >= LUT_N - 1) return LUT[LUT_N - 1];
  return LUT[i] + (LUT[i + 1] - LUT[i]) * (x - i);
}

/** 剩余面积占比 → 墨面在 viewBox 中的 y 坐标（h=1 池顶 / h=0 池底） */
export function surfaceY(f: number): number {
  return CENTER + R_WALL - areaToHeight(f) * SURFACE_TRAVEL;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run client/src/components/timer/inkSurface.test.ts`
Expected: PASS，8 tests

- [ ] **Step 5: 全量回归**

Run: `npx vitest run`
Expected: PASS，105 tests（原 97 + 新 8）

- [ ] **Step 6: 提交**

```bash
git add client/src/components/timer/inkSurface.ts client/src/components/timer/inkSurface.test.ts
git commit -m "feat(inkwell): 墨面等面积映射模块（101 点 LUT + 线性插值，含单测）"
```

---

### Task 2: 波形路径生成模块（纯函数，TDD）

**Files:**
- Create: `client/src/components/timer/inkWavePaths.ts`
- Test: `client/src/components/timer/inkWavePaths.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type WaveVariant = 'normal' | 'lowtime' | 'break'`
  - `WAVE_PATHS: Record<WaveVariant, { inkA: string; inkB: string; reliefA: string }>` —— 模块加载时预生成的 9 条静态路径字符串
  - `WAVE_PERIOD_PX: { A: 260; B: 180 }` —— 供 CSS 动画位移量对齐（横向平移一个空间周期即无缝循环）

- [ ] **Step 1: 写失败测试**

创建 `client/src/components/timer/inkWavePaths.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { WAVE_PATHS, WAVE_PERIOD_PX } from './inkWavePaths';

/** 从路径 d 中反解波幅：取绝对值 < 50 的 y 值极差的一半（排除闭合用的远点） */
function amplitudeOf(d: string): number {
  const ys = [...d.matchAll(/L (-?[\d.]+) (-?[\d.]+)/g)]
    .map((m) => parseFloat(m[2]))
    .filter((v) => Math.abs(v) < 50);
  return (Math.max(...ys) - Math.min(...ys)) / 2;
}

describe('WAVE_PATHS — 三变体波形预生成（spec §4.2）', () => {
  it('三个变体齐全', () => {
    expect(Object.keys(WAVE_PATHS).sort()).toEqual(['break', 'lowtime', 'normal']);
  });

  it('常态波幅：主波 5.8 / 副波 3.6', () => {
    expect(amplitudeOf(WAVE_PATHS.normal.inkA)).toBeCloseTo(5.8, 1);
    expect(amplitudeOf(WAVE_PATHS.normal.inkB)).toBeCloseTo(3.6, 1);
  });

  it('低时波幅为常态的 1.6 倍', () => {
    expect(amplitudeOf(WAVE_PATHS.lowtime.inkA)).toBeCloseTo(5.8 * 1.6, 1);
    expect(amplitudeOf(WAVE_PATHS.lowtime.inkB)).toBeCloseTo(3.6 * 1.6, 1);
  });

  it('休息波幅为常态的 1.25 倍', () => {
    expect(amplitudeOf(WAVE_PATHS.break.inkA)).toBeCloseTo(5.8 * 1.25, 1);
    expect(amplitudeOf(WAVE_PATHS.break.inkB)).toBeCloseTo(3.6 * 1.25, 1);
  });

  it('阳文裁剪边缘必须与主波同幅，否则阴阳互补失效', () => {
    for (const v of ['normal', 'lowtime', 'break'] as const) {
      expect(amplitudeOf(WAVE_PATHS[v].reliefA)).toBeCloseTo(
        amplitudeOf(WAVE_PATHS[v].inkA),
        3
      );
    }
  });

  it('墨体向下闭合、阳文裁剪向上闭合（互补方向相反）', () => {
    expect(WAVE_PATHS.normal.inkA).toMatch(/^M -520 720 L /);    // 向下延伸
    expect(WAVE_PATHS.normal.reliefA).toMatch(/^M -520 -720 L /); // 向上延伸
  });

  it('空间周期用于 CSS 无缝平移', () => {
    expect(WAVE_PERIOD_PX).toEqual({ A: 260, B: 180 });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run client/src/components/timer/inkWavePaths.test.ts`
Expected: FAIL —— `Failed to resolve import "./inkWavePaths"`

- [ ] **Step 3: 写实现**

创建 `client/src/components/timer/inkWavePaths.ts`：

```ts
/**
 * 墨面波纹路径（spec §4.2）
 *
 * 波幅写在 path 的 d 里，无法用 CSS 缩放实现 —— 对波形组 scaleY 会连带拉伸整个
 * 墨体。故在模块加载时预生成三个变体 × 三条路径 = 9 条静态字符串，状态跨越时
 * 切换 d 属性，每帧成本为零。
 *
 * 低时与休息互斥（低时判定限定专注态），无需组合变体。
 */

const VB = 360;

/** 主波 / 副波的基础波幅与空间周期（viewBox 单位）。时间周期互质，避免拍频 */
const BASE = {
  A: { amp: 5.8, period: 260 },
  B: { amp: 3.6, period: 180 },
} as const;

/** 波幅系数：常态 / 低时警示 / 休息 */
const AMP_SCALE = { normal: 1, lowtime: 1.6, break: 1.25 } as const;

export type WaveVariant = keyof typeof AMP_SCALE;

export const WAVE_PERIOD_PX = { A: BASE.A.period, B: BASE.B.period } as const;

/** 正弦上边缘采样点；步长 6 单位在 400px 上足够平滑 */
function edgePoints(amp: number, period: number, x0: number, x1: number): string[] {
  const STEP = 6;
  const pts: string[] = [];
  for (let x = x0; x <= x1; x += STEP) {
    const y = -amp * Math.sin(((x - x0) / period) * Math.PI * 2);
    pts.push(`${x.toFixed(1)} ${y.toFixed(2)}`);
  }
  return pts;
}

/** 墨体：波边缘 + 向下闭合（填充墨面之下） */
function inkPath(amp: number, period: number): string {
  const x0 = -2 * period;
  const x1 = VB + 2 * period;
  return `M ${x0} ${VB * 2} L ${edgePoints(amp, period, x0, x1).join(' L ')} L ${x1} ${VB * 2} Z`;
}

/** 阳文裁剪：同一条波边缘 + 向上闭合（填充墨面之上，与墨体严格互补） */
function reliefPath(amp: number, period: number): string {
  const x0 = -2 * period;
  const x1 = VB + 2 * period;
  return `M ${x0} ${-VB * 2} L ${edgePoints(amp, period, x0, x1).join(' L ')} L ${x1} ${-VB * 2} Z`;
}

export const WAVE_PATHS = Object.fromEntries(
  (Object.keys(AMP_SCALE) as WaveVariant[]).map((variant) => {
    const k = AMP_SCALE[variant];
    return [
      variant,
      {
        inkA: inkPath(BASE.A.amp * k, BASE.A.period),
        inkB: inkPath(BASE.B.amp * k, BASE.B.period),
        reliefA: reliefPath(BASE.A.amp * k, BASE.A.period),
      },
    ];
  })
) as Record<WaveVariant, { inkA: string; inkB: string; reliefA: string }>;
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run client/src/components/timer/inkWavePaths.test.ts`
Expected: PASS，7 tests

- [ ] **Step 5: 全量回归**

Run: `npx vitest run`
Expected: PASS，112 tests

- [ ] **Step 6: 提交**

```bash
git add client/src/components/timer/inkWavePaths.ts client/src/components/timer/inkWavePaths.test.ts
git commit -m "feat(inkwell): 波形路径生成模块（常态/低时×1.6/休息×1.25 三变体预生成，含单测）"
```

---

### Task 3: 墨色令牌

**Files:**
- Modify: `client/src/styles/tokens.css`

**Interfaces:**
- Consumes: 无
- Produces: 供 Task 4–6 使用的 CSS 自定义属性 —— `--color-ink-{math,english,408,free,break}`、`--color-ink-stone`、`--color-ink-stone-deep`、`--color-ink-highlight`、`--color-ink-highlight-break`、`--color-ink-mark`、`--ink-opacity`、`--dur-inking`、`--dur-clarify`

- [ ] **Step 1: 先读现状（红线：改已有文件前必须先读）**

Run: `sed -n '85,100p' client/src/styles/tokens.css`
确认第 93 行附近为番茄钟相关注释与 `--color-timer-*` 令牌块。

- [ ] **Step 2: 浅色主题令牌块内新增**

在 `--color-timer-low` 所在块之后插入：

```css
  /* ---- 砚池墨色（材质色，语义不同于交互强调色，故不复用 --color-accent-*） ---- */
  --color-ink-math: #7E2418;             /* 朱砂 */
  --color-ink-english: #123A5C;          /* 靛青 */
  --color-ink-408: #2A2A33;              /* 松烟 */
  --color-ink-free: #3E4650;             /* 漫游：中性墨 */
  --color-ink-break: #17705A;            /* 休息：清水/淡茶 */
  --color-ink-stone: #E8E6E1;            /* 砚石池底 */
  --color-ink-stone-deep: #D6D2CA;       /* 砚石池底暗部与斑点 */
  --color-ink-highlight: rgba(255, 255, 255, 0.55);       /* 反光带 */
  --color-ink-highlight-break: rgba(255, 255, 255, 0.78); /* 休息态反光带更亮 */
  --color-ink-mark: #8C8578;             /* 水痕（统一中性色，不分科目） */
  --color-ink-concave: rgba(16, 24, 40, 0.16); /* 凹面暗角 */
  --ink-opacity: 1;                      /* 墨体不透明度（深色主题为半透荧光墨） */
```

- [ ] **Step 3: 深色主题令牌块内新增**

在 `[data-theme="dark"]` 块内的 accent 色之后插入：

```css
  /* ---- 砚池墨色（深色主题：荧光彩墨半透 + 内发光；池底转暗） ---- */
  --color-ink-math: #F4786A;
  --color-ink-english: #6BA8E8;
  --color-ink-408: #A9B4C4;
  --color-ink-free: #8B95A5;
  --color-ink-break: #3ECF8E;
  --color-ink-stone: #16202F;
  --color-ink-stone-deep: #0E1622;
  --color-ink-highlight: rgba(255, 255, 255, 0.30);
  --color-ink-highlight-break: rgba(255, 255, 255, 0.46);
  --color-ink-mark: #7C8796;
  --color-ink-concave: rgba(0, 0, 0, 0.34);
  --ink-opacity: 0.38;
```

- [ ] **Step 4: 时长令牌新增**

在 `--dur-ring` 所在行之后插入（`--dur-ring` 本身保留，仍被其他组件引用）：

```css
  --dur-inking: 520ms;   /* 注墨：底部上升注满 */
  --dur-clarify: 700ms;  /* 澄清：转清 + 涟漪 + 水痕刻入 */
```

- [ ] **Step 5: 同步第 93 行旧注释用词**

把 `/* 番茄钟「光晕核心」（设计文档 5.1）：数字渐变提亮端（模式色混入 30% 白）与低时警示金 */`
改为 `/* 番茄钟砚池：低时警示金；数字渐变提亮端为旧环形设计遗留，砚池不再使用 */`

- [ ] **Step 6: 验证令牌可解析且未破坏构建**

Run: `npm run build:client 2>&1 | tail -5`
Expected: 构建成功，无 CSS 解析报错

Run: `grep -c "color-ink-" client/src/styles/tokens.css`
Expected: `22`（浅色 11 + 深色 11）

- [ ] **Step 7: 提交**

```bash
git add client/src/styles/tokens.css
git commit -m "feat(inkwell): 新增砚池墨色与时长令牌（双主题各 10 项 + 注墨/澄清时长）"
```

---

### Task 4: RingCountdown 重写为砚池

**Files:**
- Modify: `client/src/components/timer/RingCountdown.tsx`（整体重写）
- Modify: `client/src/components/timer/RingCountdown.css`（整体重写）

**Interfaces:**
- Consumes: `inkSurface.ts` 的 `surfaceY`、`SURFACE_TRAVEL`；`inkWavePaths.ts` 的 `WAVE_PATHS`、`WaveVariant`
- Produces: `RingCountdown` 组件，props 为
  - `totalSeconds: number`
  - `remainingSeconds: number`
  - `mode: 'focus' | 'short_break' | 'long_break'`
  - `subject?: 'math' | 'english' | '408' | 'free'` —— **新增**，决定墨色；缺省 `'free'`
  - `ariaLabel?: string`
  - `completedRoundsToday?: number` —— 语义改为水痕道数，上限 60（满后外扩第二圈）
  - `subtitle?: string`
  - `modeLabel?: string`
  - `variant?: 'full' | 'mini'`
  - `surfaceRefs?: React.MutableRefObject<SVGElement[] | null>` —— **替代原 `progressCircleRef`**，供 `SmoothRing` 逐帧直写平移
  - `extraClassName?: string` —— 追加到根元素 class 列表，供 `PomodoroPage` 注入 `inkwell--clarify`（Task 5 依赖此 prop，必须在本 Task 一次建好）
  - 移除导出 `PROGRESS_CIRCUMFERENCE`

- [ ] **Step 1: 先读现状**

Run: `sed -n '1,60p' client/src/components/timer/RingCountdown.tsx`
确认现有 props 与导出，记下 `PROGRESS_CIRCUMFERENCE` 的两个消费点（`PomodoroPage.tsx:23` 导入、`:670` 使用）。

- [ ] **Step 2: 重写组件**

完整替换 `client/src/components/timer/RingCountdown.tsx`（几何、层序、mask/clip 结构照 spec §3.1、§6.1 与原型；四条结构禁忌见注释）：

```tsx
import React, { useId, useMemo } from 'react';
import { formatSeconds } from '../../utils/duration';
import { surfaceY } from './inkSurface';
import { WAVE_PATHS, type WaveVariant } from './inkWavePaths';
import './RingCountdown.css';

/**
 * 砚池 Inkstone Well（spec docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md）
 *
 * 一方砚台的墨池：墨面高度表达本轮剩余（等面积映射，ADR-0003），池壁外沿水痕
 * 表达今日累积（ADR-0001）。计时文字随墨面在阳文/阴文间连续切换（ADR-0002）；
 * 深色主题不做阴文，文字恒为阳文（ADR-0004）。
 *
 * 三条结构禁忌（spike 已踩，勿重犯）：
 *  1. <clipPath> 子元素只能是 shape/text/use —— 不得套 <g> 承载平移，否则裁剪区
 *     为空、阳文被整体裁掉，而 getBBox() 不受裁剪影响，读数正常极易误判。
 *  2. mask 必须挂在未被平移的外层组 —— 挂在 translate 之内会使挖空坐标整体偏移。
 *  3. 砚石纹不得进入中心文字安全区（r < R_SAFE），否则深斑点把数字糊成一团。
 *  4. CSS 的 fill 规则必须限定在 .inkwell__relief 之内 —— CSS 优先级高于呈现属性，
 *     无限定的 fill 会染掉 mask 内的黑字，使阴文挖空静默失效。
 */

type TimerMode = 'focus' | 'short_break' | 'long_break';
type Subject = 'math' | 'english' | '408' | 'free';

interface RingCountdownProps {
  totalSeconds: number;
  remainingSeconds: number;
  mode: TimerMode;
  /** 决定墨色；休息态由 mode 覆盖 */
  subject?: Subject;
  ariaLabel?: string;
  /** 今日已完成轮次 → 水痕道数，满 60 道外扩第二圈 */
  completedRoundsToday?: number;
  subtitle?: string;
  modeLabel?: string;
  variant?: 'full' | 'mini';
  /** 供 SmoothRing 逐帧直写墨面平移的元素集合（.surf-g 与 .surf-clip） */
  surfaceRefs?: React.MutableRefObject<SVGElement[] | null>;
  /** 追加到根元素 class（PomodoroPage 用它注入 inkwell--clarify 触发澄清） */
  extraClassName?: string;
}

const MODE_LABELS: Record<TimerMode, string> = {
  focus: '专注中',
  short_break: '短休息',
  long_break: '长休息',
};

const VB = 360;
const C = 180;
const R_WALL = 160;
const R_SAFE = 104;
const R_MARK_IN = 168;
const R_MARK_OUT = 176;
/** 一圈水痕道数：6° 间隔 → 60 道满圈 */
const MARKS_PER_RING = 60;
const MARK_STEP_DEG = 6;
/** 低时警示阈值：沿用既有 300s */
const LOW_TIME_THRESHOLD_SECONDS = 300;
/** 副标题按字宽截断上限（全宽计 1、半宽计 0.5） */
const SUBTITLE_WIDTH_LIMIT = 18;

/** 分钟粒度 aria-label，避免 aria-live 每秒播报 */
function buildDefaultAriaLabel(mode: TimerMode, remainingSeconds: number): string {
  if (remainingSeconds > 0 && remainingSeconds < 60) {
    return `${MODE_LABELS[mode]} 剩余不到 1 分钟`;
  }
  const snapped = Math.floor(remainingSeconds / 60) * 60;
  return `${MODE_LABELS[mode]} 剩余 ${Math.floor(snapped / 60)} 分 ${snapped % 60} 秒`;
}

/** 按字宽截断：全宽字符计 1、半宽计 0.5（文字已移入 SVG，CSS ellipsis 失效） */
function truncateByWidth(text: string, limit: number): string {
  let width = 0;
  let out = '';
  for (const ch of text) {
    width += /[\u3000-\u9FFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.5;
    if (width > limit) return out + '…';
    out += ch;
  }
  return out;
}

/** 砚石纹：确定性 seed 斑点，仅布于环带 [R_SAFE, R_WALL-16]，中心留白给文字 */
function useStoneSpots(enabled: boolean) {
  return useMemo(() => {
    if (!enabled) return [];
    let s = 20260821;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    return Array.from({ length: 22 }, () => {
      const a = rnd() * Math.PI * 2;
      const rr = R_SAFE + rnd() * (R_WALL - 16 - R_SAFE);
      return {
        cx: C + Math.cos(a) * rr,
        cy: C + Math.sin(a) * rr,
        rx: 3 + rnd() * 8,
        ry: 2 + rnd() * 5,
        rot: rnd() * 180,
        opacity: 0.1 + rnd() * 0.12,
      };
    });
  }, [enabled]);
}

export function RingCountdown({
  totalSeconds,
  remainingSeconds,
  mode,
  subject = 'free',
  ariaLabel,
  completedRoundsToday = 0,
  subtitle,
  modeLabel,
  variant = 'full',
  surfaceRefs,
  extraClassName,
}: RingCountdownProps) {
  const isMini = variant === 'mini';
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const spots = useStoneSpots(!isMini);

  const fraction = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;
  const isLowTime = mode === 'focus' && remainingSeconds <= LOW_TIME_THRESHOLD_SECONDS;
  const isBreak = mode !== 'focus';

  const waveVariant: WaveVariant = isLowTime ? 'lowtime' : isBreak ? 'break' : 'normal';
  const paths = WAVE_PATHS[waveVariant];

  const displaySeconds = Math.ceil(remainingSeconds);
  const timeStr = formatSeconds(displaySeconds);
  const label = ariaLabel ?? buildDefaultAriaLabel(mode, displaySeconds);
  const shownSubtitle = subtitle ? truncateByWidth(subtitle, SUBTITLE_WIDTH_LIMIT) : undefined;
  const initialTransform = `translate(0 ${surfaceY(fraction).toFixed(2)})`;

  // 墨色：休息态覆盖科目色
  const inkVar = isBreak ? '--color-ink-break' : `--color-ink-${subject}`;

  const classNames = [
    'inkwell',
    `inkwell--${mode}`,
    isLowTime ? 'inkwell--lowtime' : '',
    isBreak ? 'inkwell--break' : '',
    isMini ? 'inkwell--mini' : '',
    extraClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  /** 收集需要逐帧平移的元素，交给 SmoothRing 直写 */
  const collect = (el: SVGElement | null) => {
    if (!surfaceRefs || !el) return;
    if (!surfaceRefs.current) surfaceRefs.current = [];
    if (!surfaceRefs.current.includes(el)) surfaceRefs.current.push(el);
  };

  const timeFontSize = isMini ? 46 : 62;

  return (
    <div
      className={classNames}
      role="timer"
      aria-live="polite"
      aria-label={label}
      style={{ '--_ink': `var(${inkVar})` } as React.CSSProperties}
    >
      <div className="inkwell__hall glass-2">
        <svg className="inkwell__svg" viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
          <defs>
            <clipPath id={`hall-${uid}`}>
              <circle cx={C} cy={C} r={R_WALL} />
            </clipPath>

            {/* 阴文：以文字为 mask 从墨中挖空，透出砚石池底。
                挂点见结构禁忌 2 —— 使用此 mask 的组不得被平移。 */}
            <mask id={`inkMask-${uid}`}>
              <rect x={0} y={0} width={VB} height={VB} fill="#fff" />
              <text
                className="inkwell__t-time"
                x={C}
                y={C}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={timeFontSize}
                fill="#000"
              >
                {timeStr}
              </text>
              {!isMini && (
                <>
                  <text className="inkwell__t-mode" x={C} y={C + 52} textAnchor="middle" fontSize={15} fill="#000">
                    {modeLabel ?? MODE_LABELS[mode]}
                  </text>
                  {shownSubtitle && (
                    <text className="inkwell__t-sub" x={C} y={C + 76} textAnchor="middle" fontSize={13} fill="#000">
                      {shownSubtitle}
                    </text>
                  )}
                </>
              )}
            </mask>

            {/* 阳文裁剪：竖向平移放在 clipPath 自身 transform（结构禁忌 1），
                横向波动由内部 path 的 CSS 动画负责 */}
            <clipPath
              id={`reliefClip-${uid}`}
              className="inkwell__surf-clip"
              transform={initialTransform}
              ref={collect as React.Ref<SVGClipPathElement>}
            >
              <path className="inkwell__wave-a" d={paths.reliefA} />
            </clipPath>

            <radialGradient id={`stone-${uid}`} cx="42%" cy="34%" r="78%">
              <stop offset="0%" stopColor="var(--color-ink-stone)" />
              <stop offset="100%" stopColor="var(--color-ink-stone-deep)" />
            </radialGradient>
            <radialGradient id={`concave-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="72%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="var(--color-ink-concave)" />
            </radialGradient>
          </defs>

          <g clipPath={`url(#hall-${uid})`}>
            <circle cx={C} cy={C} r={R_WALL} fill={`url(#stone-${uid})`} />
            {spots.map((sp, i) => (
              <ellipse
                key={i}
                cx={sp.cx}
                cy={sp.cy}
                rx={sp.rx}
                ry={sp.ry}
                transform={`rotate(${sp.rot} ${sp.cx} ${sp.cy})`}
                fill="var(--color-ink-stone-deep)"
                opacity={sp.opacity}
              />
            ))}

            {/* 墨体：外层承载 mask（不平移），内层承载竖向平移 */}
            <g className="inkwell__body" mask={`url(#inkMask-${uid})`}>
              <g
                className="inkwell__surf-g"
                transform={initialTransform}
                ref={collect as React.Ref<SVGGElement>}
              >
                {!isMini && (
                  <g className="inkwell__glow">
                    <path className="inkwell__wave-a" d={paths.inkA} fill="var(--_ink)" />
                  </g>
                )}
                {!isMini && (
                  <path className="inkwell__wave-b" d={paths.inkB} fill="var(--_ink)" opacity={0.45} />
                )}
                <path className="inkwell__wave-a" d={paths.inkA} fill="var(--_ink)" />
              </g>
            </g>

            {!isMini && (
              <g
                className="inkwell__surf-g"
                transform={initialTransform}
                ref={collect as React.Ref<SVGGElement>}
              >
                <line
                  className="inkwell__highlight"
                  x1={C - R_WALL}
                  y1={0}
                  x2={C + R_WALL}
                  y2={0}
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* 阳文：实体字，裁剪到墨面之上（深色主题由 CSS 解除裁剪） */}
            <g className="inkwell__relief" clipPath={`url(#reliefClip-${uid})`}>
              <text
                className="inkwell__t-time"
                x={C}
                y={C}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={timeFontSize}
              >
                {timeStr}
              </text>
              {!isMini && (
                <>
                  <text className="inkwell__t-mode" x={C} y={C + 52} textAnchor="middle" fontSize={15}>
                    {modeLabel ?? MODE_LABELS[mode]}
                  </text>
                  {shownSubtitle && (
                    <text className="inkwell__t-sub" x={C} y={C + 76} textAnchor="middle" fontSize={13}>
                      {shownSubtitle}
                    </text>
                  )}
                </>
              )}
            </g>

            <circle cx={C} cy={C} r={R_WALL} fill={`url(#concave-${uid})`} pointerEvents="none" />

            <circle
              className="inkwell__lowring"
              cx={C}
              cy={C}
              r={R_WALL - 4}
              fill="none"
              strokeWidth={8}
            />

            <circle className="inkwell__ripple" cx={C} cy={C} r={6} fill="none" />
          </g>

          {/* 水痕：池壁外沿，不受墨堂裁剪 */}
          {!isMini && (
            <g className="inkwell__marks">
              {Array.from({ length: Math.max(0, Math.floor(completedRoundsToday)) }, (_, i) => {
                const ring = Math.floor(i / MARKS_PER_RING);
                const rad = ((-90 + (i % MARKS_PER_RING) * MARK_STEP_DEG) * Math.PI) / 180;
                const ri = R_MARK_IN + ring * 12;
                const ro = R_MARK_OUT + ring * 12;
                return (
                  <line
                    key={i}
                    className="inkwell__mark"
                    x1={C + Math.cos(rad) * ri}
                    y1={C + Math.sin(rad) * ri}
                    x2={C + Math.cos(rad) * ro}
                    y2={C + Math.sin(rad) * ro}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 重写样式**

完整替换 `client/src/components/timer/RingCountdown.css`：

```css
/* ============================================================
   砚池 Inkstone Well（spec §3）
   墨色经 --_ink 下发（由组件按科目/休息态设置）；双主题差异与降级全部由
   CSS 承担，组件内无 JS 分支。
   ============================================================ */

.inkwell {
  width: min(88vw, 400px);
  aspect-ratio: 1 / 1;
  position: relative;
  flex-shrink: 0;
}

.inkwell--mini { width: 120px; }

/* ---- 墨堂：凹面池体 ---- */
.inkwell__hall {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  box-shadow:
    var(--shadow-glass-md),
    inset 0 10px 26px var(--color-ink-concave),
    inset 0 -4px 14px rgba(255, 255, 255, 0.3);
}

.inkwell__svg { display: block; width: 100%; height: 100%; }

/* ---- 墨体 ---- */
.inkwell__body { opacity: var(--ink-opacity); }
.inkwell__glow { display: none; }
[data-theme="dark"] .inkwell__glow { display: block; filter: blur(9px); opacity: 0.5; }

/* 波纹：纯 CSS 无限动画，与逐帧墨面平移完全解耦（spec §6.2）
   位移量 = 空间周期，保证无缝循环 */
@keyframes inkwell-wave-a { to { transform: translateX(-260px); } }
@keyframes inkwell-wave-b { to { transform: translateX(180px); } }
.inkwell__wave-a { animation: inkwell-wave-a 11s linear infinite; }
.inkwell__wave-b { animation: inkwell-wave-b 7s linear infinite; }
.inkwell--lowtime .inkwell__wave-a { animation-duration: 5s; }
.inkwell--lowtime .inkwell__wave-b { animation-duration: 3.2s; }
/* mini 无波纹（波幅缩放后低于感知阈，spec §3.2） */
.inkwell--mini .inkwell__wave-a,
.inkwell--mini .inkwell__wave-b { animation: none; }

/* ---- 反光带 ---- */
.inkwell__highlight { stroke: var(--color-ink-highlight); }
.inkwell--break .inkwell__highlight { stroke: var(--color-ink-highlight-break); }

/* ---- 文字 ----
   字体度量规则**必须**同时命中 mask 内文字与阳文层文字：两者字形须逐像素一致，
   否则阴文挖空与阳文实体会错位。 */
.inkwell__t-time {
  font-family: var(--font-mono);
  font-weight: var(--font-bold);
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.inkwell__t-mode { font-weight: var(--font-medium); }

/* ⚠ 结构禁忌 4：fill 规则**只能**限定在 .inkwell__relief 之内。
   mask 内的文字依靠 fill="#000" 呈现属性完成挖空，而 CSS 优先级高于呈现属性 ——
   若写成无限定的 `.inkwell__t-time { fill: ... }`，会把 mask 里的黑字染成墨色，
   挖空当场失效、阴文彻底消失（且不会有任何报错）。 */
.inkwell__relief .inkwell__t-time { fill: var(--_ink); }
.inkwell__relief .inkwell__t-mode { fill: var(--_ink); opacity: 0.75; }
.inkwell__relief .inkwell__t-sub { fill: var(--color-text-muted); }
.inkwell--lowtime .inkwell__relief .inkwell__t-time,
.inkwell--lowtime .inkwell__relief .inkwell__t-mode { fill: var(--color-timer-low); }

/* 深色主题：不做阴文，文字恒为阳文近白字（ADR-0004）
   依据：深色半透荧光墨挖空仅 1.96:1，低于大字号 3:1 下限；恒阳文实测 15.53:1 */
[data-theme="dark"] .inkwell__relief { clip-path: none; }
[data-theme="dark"] .inkwell__body { mask: none; }
[data-theme="dark"] .inkwell__relief .inkwell__t-time,
[data-theme="dark"] .inkwell__relief .inkwell__t-mode { fill: var(--color-text-primary); }
[data-theme="dark"] .inkwell__relief .inkwell__t-sub { fill: var(--color-text-secondary); }
[data-theme="dark"] .inkwell--lowtime .inkwell__relief .inkwell__t-time { fill: var(--color-timer-low); }

/* ---- 池壁内缘低时泛金 ---- */
.inkwell__lowring {
  stroke: var(--color-timer-low);
  opacity: 0;
  transition: opacity var(--dur-slow) var(--ease-out);
}
.inkwell--lowtime .inkwell__lowring { opacity: 1; }

/* ---- 水痕 ---- */
.inkwell__mark { stroke: var(--color-ink-mark); opacity: 0.62; }

/* ---- 涟漪（澄清期间由 .inkwell--clarify 触发） ---- */
@keyframes inkwell-ripple {
  from { r: 6px; opacity: 0.85; stroke-width: 7; }
  to   { r: 158px; opacity: 0; stroke-width: 1; }
}
.inkwell__ripple { stroke: var(--color-ink-highlight); display: none; }
.inkwell--clarify .inkwell__ripple {
  display: block;
  animation: inkwell-ripple 400ms var(--ease-out) 120ms both;
}
/* 澄清：墨面去饱和转清（0–280ms） */
.inkwell--clarify .inkwell__body {
  filter: saturate(0.12) brightness(1.25);
  transition: filter 280ms linear;
}
/* 澄清：新水痕自内向外刻入（420–700ms） */
@keyframes inkwell-mark-carve {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 0.62; transform: scale(1); }
}
.inkwell--clarify .inkwell__mark:last-of-type {
  transform-box: fill-box;
  transform-origin: center;
  animation: inkwell-mark-carve 280ms var(--ease-spring) 420ms both;
}

/* 注墨不使用 CSS 过渡：墨面 transform 由 rAF 每帧直写，CSS 过渡会与逐帧写入
   互相打架（每次写入都重启过渡，产生阻尼拖尾而非干净的 520ms 上升）。
   注墨改由 SmoothRing 在 rAF 内插值实现（Task 5），此处不留过渡规则。 */

/* ---- reduced-motion：关闭全部动效，墨面直接就位（spec §5.4） ---- */
@media (prefers-reduced-motion: reduce) {
  .inkwell__wave-a,
  .inkwell__wave-b,
  .inkwell--clarify .inkwell__ripple,
  .inkwell--clarify .inkwell__mark:last-of-type { animation: none; }
  .inkwell--clarify .inkwell__body { transition: none; }
  .inkwell__lowring { transition: none; }
}
```

- [ ] **Step 4: 类型检查（此时 PomodoroPage 仍引用旧导出，预期报错）**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: 报 `PROGRESS_CIRCUMFERENCE` 与 `progressCircleRef` 不存在 —— 由 Task 5 修复。**不要在此步修改 PomodoroPage。**

- [ ] **Step 5: 提交**

```bash
git add client/src/components/timer/RingCountdown.tsx client/src/components/timer/RingCountdown.css
git commit -m "feat(inkwell): RingCountdown 重写为砚池（墨面/阴阳文/水痕/波纹/双主题分支）"
```

---

### Task 5: SmoothRing 与 PomodoroPage 接入

**Files:**
- Modify: `client/src/pages/PomodoroPage.tsx`

**Interfaces:**
- Consumes: `RingCountdown` 新 props（`subject`、`surfaceRefs`）、`inkSurface.ts` 的 `surfaceY`
- Produces: 无（页面为叶子消费者）

- [ ] **Step 1: 先读现状**

Run: `sed -n '625,700p' client/src/pages/PomodoroPage.tsx`
确认 `SmoothRing` 的 rAF 结构与 `progressCircleRef` 用法。

- [ ] **Step 2: 换导入**

把第 23 行
`import { RingCountdown, PROGRESS_CIRCUMFERENCE } from '../components/timer/RingCountdown';`
改为
```ts
import { RingCountdown } from '../components/timer/RingCountdown';
import { surfaceY } from '../components/timer/inkSurface';
```

- [ ] **Step 3: 重写 SmoothRing 的逐帧写入**

把 `SmoothRing` 内的 `progressCircleRef` 与 `stroke-dashoffset` 写入替换为墨面平移写入。完整替换 `SmoothRing` 的 ref 声明与 `useEffect`：

```tsx
  // 需要逐帧平移的元素集合（墨体 .surf-g ×2 与阳文裁剪 .surf-clip ×1）
  const surfaceRefs = useRef<SVGElement[] | null>(null);
  /** 注墨窗口结束时刻（ms）；null = 不在注墨中 */
  const inkingUntilRef = useRef<number | null>(null);

  useEffect(() => {
    if (endsAtMs == null) return;
    let rafId = 0;
    let lastSeconds = -1;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, (endsAtMs - now) / 1000);
      const live = totalSeconds > 0 ? Math.min(1, Math.max(0, remaining / totalSeconds)) : 0;

      // 注墨（spec §5.1）：520ms 内墨面自池底升至当前应有高度，之后交回实时值。
      // 在 rAF 内插值而非用 CSS 过渡 —— 过渡会被每帧写入反复重启，产生阻尼拖尾。
      let fraction = live;
      const until = inkingUntilRef.current;
      if (until !== null) {
        if (now >= until) {
          inkingUntilRef.current = null;
        } else {
          const k = 1 - (until - now) / INKING_MS;
          fraction = easeOut(Math.min(1, Math.max(0, k))) * live;
        }
      }

      // 墨面平滑推进：直写 SVG transform，不触发 React 重渲染
      const tf = `translate(0 ${surfaceY(fraction).toFixed(2)})`;
      const els = surfaceRefs.current;
      if (els) for (const el of els) el.setAttribute('transform', tf);

      // 中心倒计时文字：整数秒变化时才 setState
      const secs = Math.ceil(remaining);
      if (secs !== lastSeconds) {
        lastSeconds = secs;
        setDisplaySeconds(secs);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [endsAtMs, totalSeconds]);

  // 会话切换即触发一次注墨（endsAtMs 变化 = 新会话开始或恢复）
  useEffect(() => {
    if (endsAtMs == null) return;
    // 会话恢复（刷新后墨面本就该在中途）不播注墨：仅当剩余接近计划时长才视为新开始
    const remaining = (endsAtMs - Date.now()) / 1000;
    if (totalSeconds > 0 && remaining > totalSeconds - 2) {
      inkingUntilRef.current = Date.now() + INKING_MS;
    }
  }, [endsAtMs, totalSeconds]);
```

其中 `INKING_MS` 在 `PomodoroPage.tsx` 顶部与 `--dur-inking` 对齐声明：

```tsx
/** 注墨时长，与 tokens.css 的 --dur-inking 保持一致 */
const INKING_MS = 520;
/** 澄清时长，与 tokens.css 的 --dur-clarify 保持一致 */
const CLARIFY_MS = 700;
```

并把 Step 6 中 `setTimeout(..., 700)` 的字面量改用 `CLARIFY_MS`。

并把 `SmoothRing` 返回的 `<RingCountdown>` 的 `progressCircleRef={progressCircleRef}` 改为 `surfaceRefs={surfaceRefs}`，同时透传 `subject`。

- [ ] **Step 4: SmoothRing props 增加 subject**

在 `SmoothRingProps` 接口内加 `subject?: 'math' | 'english' | '408' | 'free';`，并在渲染 `<RingCountdown>` 时透传。

- [ ] **Step 5: ringProps 提供 subject**

在 `ringProps` 的三个分支中补 `subject`：
- `step === 'active'` 分支：`subject: activeSession.subjectSnapshot as 'math' | 'english' | '408' | 'free'`
- `breakMode` 分支：不需要（休息态由 `mode` 覆盖墨色）
- 空闲分支：`subject: (selectedPreset?.subject as 'math' | 'english' | '408') ?? 'free'`

- [ ] **Step 6: 完成态时序改造（spec §7.2）**

在组件状态区新增：

```tsx
  /** 澄清阶段：完成后先播砚池澄清 700ms，再切完成态（否则 display:none 使澄清无播放窗口） */
  const [clarifying, setClarifying] = useState(false);
  const clarifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

把 `handleComplete` 中的 `setBurstKey((k) => k + 1); setStep('completed');` 改为：

```tsx
      setClarifying(true);
      clarifyTimerRef.current = setTimeout(() => {
        setClarifying(false);
        setBurstKey((k) => k + 1);
        setStep('completed');
      }, CLARIFY_MS);
```

自然结束检测分支（`prevId && !activeSession` 且非 selfEnded）中同样改为先 `setClarifying(true)` 再于 700ms 后 `setBurstKey` + `setStep('completed')`。

`handleCancel` **不播澄清**，保持原样直接 `setStep('idle')`。

卸载清理：

```tsx
  useEffect(() => () => {
    if (clarifyTimerRef.current) clearTimeout(clarifyTimerRef.current);
  }, []);
```

- [ ] **Step 7: 舞台类名接入澄清态**

在渲染舞台的 `className` 模板中追加 `${clarifying ? ' inkwell-stage--clarify' : ''}`，并把该类透传到 `SmoothRing` 外层容器 —— 具体做法：给 `SmoothRing` 增加 `clarifying?: boolean` prop，在其内部把 `inkwell--clarify` 加到 `RingCountdown` 的外层 `className`。`extraClassName` prop 已在 Task 4 建好，此处直接使用。

- [ ] **Step 8: 同步注释用词**

- 第 38 行 `番茄钟页「光晕核心」（设计文档 5.3 / v2 12.4 / 13.4）` → `番茄钟页砚池（spec docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md）`
- 第 87 行 `// 光晕核心：完成粒子爆散 ...` → `// 砚池：完成粒子爆散 ...`

- [ ] **Step 9: 类型检查与 lint**

Run: `cd client && npx tsc --noEmit`
Expected: 无输出

Run: `npm run lint`
Expected: 无 error

- [ ] **Step 10: 浏览器验证阴文真的挖出来了（此前两次栽在这里）**

Run: `npm run dev`，登录后开 `#/pomodoro`，用 5 分钟预设起一轮专注。

必须亲眼确认三件事：
1. 浅色主题下，墨面经过中心数字时，**墨面之下的数字是镂空透出浅色池底**，不是深色实体字（若是实体字 → fill 规则未限定在 `.inkwell__relief` 内，见结构禁忌 4）
2. 墨面之上的数字是深色实体字，分界随波纹起伏
3. 切深色主题后，数字变为近白实体字且**不再镂空**（ADR-0004 的预期行为，不是 bug）

- [ ] **Step 11: 全量测试**

Run: `npx vitest run`
Expected: PASS，112 tests

- [ ] **Step 12: 提交**

```bash
git add client/src/pages/PomodoroPage.tsx client/src/components/timer/RingCountdown.tsx
git commit -m "feat(inkwell): SmoothRing 改写为墨面逐帧平移 + 完成态先播澄清 700ms"
```

---

### Task 6: 首页 mini 接入与旧术语清理

**Files:**
- Modify: `client/src/pages/HomePage.tsx:363-368`
- Modify: `client/src/components/landing/ScreenshotsSection.tsx:14`
- Modify: `AGENT.md`

**Interfaces:**
- Consumes: `RingCountdown` 新 props
- Produces: 无

- [ ] **Step 1: 先读现状**

Run: `sed -n '342,370p' client/src/pages/HomePage.tsx`
确认 `MiniSessionRing` 只传 `variant/totalSeconds/remainingSeconds/mode`。

- [ ] **Step 2: 首页 mini 透传科目**

`MiniSessionRing` 增加 `subject` prop 并透传给 `RingCountdown`；调用处从进行中会话的 `subjectSnapshot` 取值。若调用处拿不到科目，传 `'free'` —— **不要留 TODO，直接传 `'free'` 并在注释写明首页迷你砚池不区分科目色**。

- [ ] **Step 3: 落地页文案同步**

`ScreenshotsSection.tsx:14` 的 `alt` 与 `caption`：
- `alt: '番茄钟页面：光晕核心环形倒计时'` → `alt: '番茄钟页面：砚池墨面倒计时'`
- `caption: '番茄钟 · 光晕核心'` → `caption: '番茄钟 · 砚池'`

（截图文件本身属延后项，此步只改文案。）

- [ ] **Step 4: AGENT.md 同步**

在「UI 组件库与动效」小节的动效组件行后新增一行：

```markdown
- **砚池计时器**: `client/src/components/timer/` — `RingCountdown`(砚池主体) + `inkSurface.ts`(等面积映射 LUT) + `inkWavePaths.ts`(三变体波形)；设计见 `docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md` 与 `docs/adr/0001`–`0004`；术语见 `CONTEXT.md`。**旧称「光晕核心/进度环/刻度珠」已废弃**
```

- [ ] **Step 5: 确认旧术语已清零**

Run: `grep -rn "光晕核心\|刻度珠" client/src AGENT.md`
Expected: 无输出（`前端重设计文档.md`、`plans/009`、`plans/010` 为历史文档，保留当时用语，不在检索范围）

- [ ] **Step 6: 构建与测试**

Run: `npm run build 2>&1 | tail -5`
Expected: client 与 server 均构建成功

Run: `npx vitest run`
Expected: PASS，112 tests

- [ ] **Step 7: 提交**

```bash
git add client/src/pages/HomePage.tsx client/src/components/landing/ScreenshotsSection.tsx AGENT.md
git commit -m "feat(inkwell): 首页 mini 砚池接入 + 旧术语清理与 AGENT.md 同步"
```

---

### Task 7: 验收复测

**Files:**
- Modify: `docs/superpowers/spikes/contrast.mjs`（改为量真实页面而非原型）

**Interfaces:**
- Consumes: 运行中的 dev server
- Produces: 对比度实测数值，用于核对 spec §9 验收标准 2

- [ ] **Step 1: 启动 dev server**

Run: `npm run dev`（后台任务）
等待 client 就绪于 `http://localhost:5173`

- [ ] **Step 2: 把对比度脚本指向真实页面**

复制 `docs/superpowers/spikes/contrast.mjs` 为 `docs/superpowers/spikes/contrast-live.mjs`，把 `page.goto` 的 file URL 改为 `http://localhost:5173/#/pomodoro`，选择器 `#wellFull` 改为 `.inkwell:not(.inkwell--mini)`，并在测量前用 Playwright 完成登录（复用 `e2e/fixtures` 的真实会话方式）。

- [ ] **Step 3: 逐项核对 spec §9 的 9 条验收标准**

- 标准 1（LUT）：`npx vitest run client/src/components/timer/inkSurface.test.ts` 全绿
- 标准 2（对比度）：`node docs/superpowers/spikes/contrast-live.mjs`，数字段 ≥3:1、副标题段 ≥4.5:1
- 标准 3–7：浏览器人工核对（拖动会话进度不便，可临时用 5 分钟预设走完整轮）
- 标准 8（零重渲染）：React DevTools Profiler 确认 rAF 期间无重渲染，中心数字每秒 1 次
- 标准 9：`npm run lint` 与 `npx vitest run` 全绿

- [ ] **Step 4: 提交复测脚本**

```bash
git add docs/superpowers/spikes/contrast-live.mjs
git commit -m "test(inkwell): 对比度实测脚本指向真实番茄钟页，用于验收复测"
```

- [ ] **Step 5: 汇报效果，等用户亲自检查**

按项目工作流第 6 步：**只汇报效果，不自行判定通过**。列出 9 条验收标准的实测结果，请用户在浏览器亲自确认观感，等待 commit / merge 指令。

---

## 依赖关系

```
Task 1 (inkSurface)  ─┐
Task 2 (inkWavePaths)─┼─→ Task 4 (RingCountdown) ─→ Task 5 (PomodoroPage) ─→ Task 6 (HomePage/术语) ─→ Task 7 (验收)
Task 3 (tokens)      ─┘
```

Task 1–3 相互独立，可任意顺序；Task 4 起必须串行（Task 4 结束时 `tsc` 会报错，由 Task 5 修复，属预期中间态）。

注墨仅在**新会话开始**时播放，**会话恢复（刷新页面）不播** —— 判据为「剩余 > 计划时长 − 2s」。刷新后墨面本就该停在中途，若补播注墨会被误读为重新开始。

## 延后项（不在本计划内）

1. 落地页 `FeaturePomodoroSection.tsx` 重设计（并评估改为复用 `RingCountdown`）
2. 番茄钟页截图 `client/public/screenshots/pomodoro.webp` 更新
3. 提示音开关失效缺陷修复（`playEndSound` 未读 `pomodoroSoundEnabled`）
