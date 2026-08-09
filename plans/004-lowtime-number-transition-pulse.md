# 004 — 低时警示：中心数字与环同步过渡，并加数字紧迫脉动

- **Status**: TODO
- **Commit**: 64fc253
- **Severity**: LOW
- **Category**: Cohesion & tokens / Missed opportunities
- **Estimated scope**: `client/src/components/timer/RingCountdown.css`，约 20 行改动
- **Depends on**: 005（本计划使用 `var(--ease-in-out)` 令牌，必须先执行 005）

## Problem

进入低时警示（剩余 ≤300s）时，进度环的颜色按 `transition: stroke var(--dur-med) var(--ease-out)` 花 240ms 渐变到金红（RingCountdown.css:70），但中心数字是**瞬间跳色**的：

```css
/* RingCountdown.css:152-158 — 深色主题数字，无任何过渡 */
[data-theme="dark"] .ring-countdown__time {
  background: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  color: var(--_rc-c1);
  -webkit-text-fill-color: var(--_rc-c1);
}
```

浅色主题的数字是渐变填充（`background: linear-gradient(135deg, var(--_rc-c1), var(--_rc-c2))` + background-clip: text，RingCountdown.css:139-150），`background` 不可过渡——这一支保持快切是合理的（写明注释即可）。深色主题的 `color` 是可过渡属性，现在却与环不同步。

另外：低时状态下环有 2s 的呼吸脉动（`ring-breathe`，opacity 0.7↔1），而中心数字完全静止——紧迫感只体现在环上，数字纹丝不动。

## Target

1. 深色主题数字加 240ms 颜色过渡，与环的 stroke 渐变同步；浅色渐变保持快切并注明限制
2. 低时状态中心数字加 2s 脉动，与环的呼吸**同周期同相位**（同为 0%/100% opacity 1、50% 淡出）：

```css
/* 目标 — 深色主题数字过渡 */
[data-theme="dark"] .ring-countdown__time {
  background: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  color: var(--_rc-c1);
  -webkit-text-fill-color: var(--_rc-c1);
  transition: color var(--dur-med) var(--ease-out);
}
```

```css
/* 目标 — 低时数字脉动（与环呼吸同 2s 周期，50% 相位对齐） */
@keyframes time-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.75;
  }
}

.ring-countdown--lowtime .ring-countdown__time {
  animation: time-pulse 2s var(--ease-in-out) infinite;
}
```

3. reduced-motion 块（RingCountdown.css:198-207）追加数字脉动取消：

```css
@media (prefers-reduced-motion: reduce) {
  .ring-countdown--lowtime .ring-countdown__progress,
  .ring-countdown--lowtime .ring-countdown__time,
  .ring-countdown__bead--lit {
    animation: none;
  }
  /* ...其余保持原样 */
}
```

## Repo conventions to follow

- 缓动用令牌：本计划引用 `var(--ease-in-out)`（由计划 005 在 tokens.css 新增）；`--dur-med: 240ms` 为既有令牌
- 脉动与环呼吸同构：`ring-breathe`（RingCountdown.css:80-92）是 0%/100%→opacity 1、50%→0.7、2s infinite——`time-pulse` 照此骨架，数值更温和（0.75 而非 0.7，数字仍需保持可读）
- 动画使用后加注释说明（文件内既有的中文注释风格）

## Steps

1. RingCountdown.css 深色数字规则（152-158 行）追加 `transition: color var(--dur-med) var(--ease-out);`
2. 在浅色数字规则（139-150 行）的注释处补充一句：`/* 浅色渐变填充 background 不可过渡，低时切色为快切（深色纯色有 240ms 过渡） */`
3. 在 `ring-breathe` keyframes 之后追加 `time-pulse` keyframes 与 `.ring-countdown--lowtime .ring-countdown__time` 规则（值如上）
4. reduced-motion 块（198-207 行）的选择器列表加入 `.ring-countdown--lowtime .ring-countdown__time`

## Boundaries

- 不触碰 `.ring-countdown--lowtime .ring-countdown__progress` 的既有呼吸规则
- 不触碰浅色渐变的结构（背景可过渡方案属更大重构，不在此计划内）
- 仅改 RingCountdown.css 一个文件

## Verification

- **Mechanical**: `npm run lint` 通过（CSS 无 lint 报错）
- **Feel check**（开始一个 5 分钟会话立即进入低时态）：
  - 深色主题：数字颜色随环同步 240ms 渐变到金红，不跳变
  - 浅色主题：数字渐变快切（可接受），环照常渐变
  - 数字脉动与环呼吸同拍（同为 2s 周期，弱拍同刻）：慢速播放观察两者 50% 相位同时最淡
  - 模拟 `prefers-reduced-motion: reduce`：数字无脉动、环无呼吸、仅颜色保留
- **Done when**: 低时态下数字与环的节律一致；reduced-motion 下脉动消失
