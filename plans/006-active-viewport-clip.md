# 006 — 进行中态圆盘不被视口截断（视觉 QA 发现）

- **Status**: TODO
- **Commit**: 64fc253
- **Severity**: MEDIUM
- **Category**: Physicality & origin（布局对动效的承载）
- **Estimated scope**: `client/src/pages/PomodoroPage.css`，约 10 行

## Problem

视觉 QA（1280×720 视口截图，QA 图 `pomodoro-active-lowtime.png`）确认：**进行中态页面首屏只露出圆盘的上半部分**，下半环与辉光被视口底部裁掉。用户点下「开始专注」后第一眼看到的是半个钟。

原因：active 布局垂直总高超出 720px 视口 —— 导航 ~64px + 舞台 padding `var(--space-2xl) var(--space-2xl) var(--space-xl)`（48px 上/48px 侧/32px 下）+ 400px 圆盘 + hero gap `var(--space-lg)`（24px）+ 操作按钮行 ~48px + `pomodoro-below` margin-top `var(--space-2xl)`（48px）+ dock 区 ~180px。

```css
/* PomodoroPage.css:26-28 — 当前舞台留白 */
.pomodoro-hero__stage {
  padding: var(--space-2xl) var(--space-2xl) var(--space-xl);
}

/* PomodoroPage.css:11-16 — hero 间距 */
.pomodoro-hero {
  gap: var(--space-lg);
}

/* PomodoroPage.css:119-121 — 下方内容区 */
.pomodoro-below {
  margin-top: var(--space-2xl);
}
```

## Target

active 态收紧垂直留白，让「圆盘 + 操作按钮」在 720px 高视口下完整可见（dock 允许部分露出，靠滚动到达）：

```css
/* 目标 — 追加 */
/* 进行中态：收紧舞台垂直留白，保证圆盘与操作按钮 720px 视口内完整可见 */
.pomodoro-active .pomodoro-hero__stage {
  padding: var(--space-lg) 0 var(--space-md);
}

.pomodoro-active .pomodoro-hero {
  gap: var(--space-md);
}

.pomodoro-active + .pomodoro-below {
  margin-top: var(--space-lg);
}
```

合计节省：舞台 48→24 顶、32→16 底（40px），hero gap 24→16（8px），below margin 48→24（24px），共 ~72px；圆盘整体上移后 720px 视口内圆环完整、按钮可见。

## Repo conventions to follow

- 移动端已有一致的留白收敛先例（PomodoroPage.css:295-298 的 `@media (max-width: 767px)` 把舞台 padding 收为 `var(--space-lg) 0`）——本计划是同一思路在 active 态的应用
- 只改间距，不动布局结构（grid 列、flex 方向均保留）

## Steps

1. `PomodoroPage.css` 中 `.pomodoro-hero__stage` 规则（18-28 行）之后追加 `.pomodoro-active .pomodoro-hero__stage` 覆盖（值如上）
2. 追加 `.pomodoro-active .pomodoro-hero` gap 覆盖
3. 追加 `.pomodoro-active + .pomodoro-below` margin-top 覆盖

## Boundaries

- 不改变 idle/completed 态的留白（它们不在 `.pomodoro-active` 内，选择器天然隔离）
- 不缩小圆盘尺寸、不隐藏 dock、不改 grid 结构
- 不触碰 `@media (max-width: 1023px)` 的堆叠布局（282-292 行）

## Verification

- **Mechanical**: `npm run lint` 通过
- **Feel check**（1280×720 视口）：
  - 开始专注后首屏：圆环完整可见（含底部端点与辉光），「提前完成/取消」按钮在环下方可见
  - idle 态留白不变（选择器不命中）
  - 窄屏（<1024px 堆叠布局）与移动端（<767px）下无回退异常
- **Done when**: 720px 视口首屏圆环 100% 可见；三个状态（idle/active/completed）视觉留白均衡
