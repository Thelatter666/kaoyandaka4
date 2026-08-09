# 002 — 首页迷你钟每秒"打嗝"，改为连续推进

- **Status**: TODO
- **Commit**: 64fc253
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: `client/src/styles/tokens.css` + `client/src/components/timer/RingCountdown.css`，共 2 行实质改动

## Problem

非 smooth 路径（当前唯一使用者是首页迷你环 `HomePage.tsx:363-369`）每秒钟更新一次 `remainingSeconds`，进度环的过渡时长是 400ms：

```css
/* RingCountdown.css:66-71 — 当前 */
.ring-countdown__progress {
  filter: drop-shadow(0 0 10px currentColor);
  transition:
    stroke-dashoffset var(--dur-slow) linear,
    stroke var(--dur-med) var(--ease-out);
}
```

```ts
// tokens.css:141 — --dur-slow: 400ms
```

结果是每秒钟环"动 400ms、停 600ms"：1 秒的 60% 时间圆环静止不动，看起来像在打嗝，且环的视觉位置落后真实时间最多 400ms。1 秒周期的连续进度应该用**接近整周期**的线性过渡，让环在一秒内匀速推进不停顿。

## Target

新增令牌 `--dur-ring: 900ms`（1 秒周期留 100ms 余量，避免新旧偏移值交错时反向回抽），进度环非平滑路径的 dashoffset 过渡改用 900ms 线性：

```css
/* tokens.css — 追加（放在 --dur-slow 之后） */
--dur-ring: 900ms; /* 秒环逐秒过渡：≈1s 周期连续推进，不打嗝 */
```

```css
/* RingCountdown.css:66-71 — 改为 */
.ring-countdown__progress {
  filter: drop-shadow(0 0 10px currentColor);
  transition:
    stroke-dashoffset var(--dur-ring) linear,
    stroke var(--dur-med) var(--ease-out);
}
```

其余行为不变：smooth（rAF）路径有自己的覆盖规则（RingCountdown.css:75-77），不受影响；`prefers-reduced-motion` 已全局取消该过渡（RingCountdown.css:198-207），不动。

## Repo conventions to follow

- 时长/缓动一律收进 tokens.css 的动效区（tokens.css:138-149），组件内不硬编码数值
- 恒定运动用 linear（项目内既有先例：RingCountdown.css:69 的 `linear`）

## Steps

1. `client/src/styles/tokens.css` 第 141 行 `--dur-slow: 400ms;` 之后插入一行 `--dur-ring: 900ms; /* 秒环逐秒过渡：≈1s 周期连续推进，不打嗝 */`
2. `client/src/components/timer/RingCountdown.css` 第 69 行 `stroke-dashoffset var(--dur-slow) linear,` 改为 `stroke-dashoffset var(--dur-ring) linear,`

## Boundaries

- 不触碰 `.ring-countdown--smooth` 覆盖规则（75-77 行）
- 不触碰 reduced-motion 块
- 不改动 HomePage 的 setInterval 驱动逻辑
- 若 `--dur-slow` 在文件里只剩本处使用，也不要删除该令牌（其他文件可能引用，且属于公共动效区）

## Verification

- **Mechanical**: `npm run lint` 通过
- **Feel check**（首页有进行中会话时，DevTools Animations 面板开 10% 播放）：
  - 迷你环每秒内**匀速连续**消减，无"动 400ms 停 600ms"的停顿节拍
  - 圆环端点落后真实剩余时间不超过约 1 秒（视觉可接受），无反向回抽
  - 后台标签页回来时环瞬间跳至正确位置（无过渡、无回抽动画）
- **Done when**: 连续观察 10 秒，环的运动是单一连续线性推进；切换到番茄钟页（smooth 路径）确认不受影响
