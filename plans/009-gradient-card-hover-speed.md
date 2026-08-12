# 009 — GradientCard hover 从 400ms 弹性降为 240ms ease-out

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion & tokens
- **Estimated scope**: 1 file（GradientCard.css）

## Problem

全站通用内容卡（首页 4 张 Bento 卡、预设卡、番茄钟 dock 卡、统计页卡片都经 GradientCard 渲染）的 hover 上浮用了 **400ms 弹性曲线**：`transform var(--dur-slow) var(--ease-spring)`（`--ease-spring = cubic-bezier(0.34, 1.56, 0.64, 1)`，带明显回弹）。这些卡每天 hover 数十次，每次划过都播放 400ms 弹簧，拖沓且有"回弹晃眼"感。

`client/src/components/ui/GradientCard.css:16-18` 当前代码：

```css
  transition:
    transform var(--dur-slow) var(--ease-spring),
    box-shadow var(--dur-med) var(--ease-out);
```

`GradientCard.css:171` 当前代码（水印放大微旋，同问题）：

```css
  transition: transform var(--dur-slow) var(--ease-spring);
```

`GradientCard.css:147` 当前代码（CTA 箭头位移）：

```css
  transition: transform var(--dur-slow) var(--ease-out);
```

仓库惯例（AUDIT 决策顺序）：**hover/颜色变化 → 快 + ease-out**；弹性曲线 `--ease-spring` 只保留给"按压回弹"（设计文档 13.4：PomodoroPage 的 `.btn:active` 用 `--ease-spring`）与刻度珠点亮。hover 上浮用弹簧是误用。

## Target

- 卡片 hover：`transform var(--dur-med) var(--ease-out)`（240ms，无回弹），`box-shadow` 保持 `var(--dur-med) var(--ease-out)`。
- 水印 hover：`transform var(--dur-med) var(--ease-out)`。
- CTA 箭头 hover 位移：`transform var(--dur-med) var(--ease-out)`（400→240）。
- 更新文件头注释第 4 行描述，避免后续实现者误读。

## Repo conventions to follow

- hover 上浮正确范例：`Card.css` 的 `.card--hoverable:hover`（`transform var(--dur-med) var(--ease-out)` + translateY(-2px)）。
- 弹性曲线唯一合法用途是按压/点亮（`PomodoroPage.css` `.pomodoro-hero .btn:active` scale(0.96) + `--ease-spring`；`RingCountdown.css` 刻度珠）。

## Steps

1. **`GradientCard.css:17`**：

   ```css
     transform var(--dur-med) var(--ease-out),
   ```

2. **`GradientCard.css:171`**：

   ```css
   transition: transform var(--dur-med) var(--ease-out);
   ```

3. **`GradientCard.css:147`**：

   ```css
   transition: transform var(--dur-med) var(--ease-out);
   ```

4. **`GradientCard.css` 头部注释第 4 行**：`hover scale 1.03 + y -4（--ease-spring）` → `hover scale 1.03 + y -4（240ms ease-out）`。

## Boundaries

- 不要改 hover 位移量（scale 1.03 / y -4 / 水印 scale 1.1 rotate 3°）——只改曲线与时长。
- 不要动 `(hover:hover)(pointer:fine)` 门控与 reduced-motion 区块。
- 不要动 PresetCard / HomePage / PomodoroPage 里对 GradientCard 的样式覆盖。

## Verification

- **Mechanical**: `npm run lint` 通过（纯 CSS 改动）。
- **Feel check**（DevTools Animations 面板）：
  - hover 首页"今日专注"卡：240ms 平滑上浮，**无回弹过冲**。
  - 快速连续划过多张卡：无拖尾、无滞后感。
  - 水印图标放大微旋与卡片同速，无错位感。
  - reduced-motion 下 hover 无位移（回归确认）。
- **Done when**: hover 全程 240ms、无过冲回弹，划过卡片无拖尾。
