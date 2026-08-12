# 010 — 预设页创建胶囊 hover 展开降速并去除 scale(0)

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: MEDIUM
- **Category**: Easing & duration / Performance
- **Estimated scope**: 1 file（PresetsPage.css）

## Problem

预设页"新建预设"渐变胶囊按钮的 hover 展开动画全部是 **500ms**，其中胶囊本体动画的是 **`width`（布局属性）**；标题文字用 **`transform: scale(0)`** 起始（AUDIT 反模式：真实世界没有东西从 0 出现）。预设页是每日页面，胶囊 hover 频繁；500ms 的展开 + 布局动画让交互显得慢且不流畅。

`client/src/pages/PresetsPage.css:29-33` 当前代码：

```css
  cursor: pointer;
  transition:
    width 500ms var(--ease-out),
    box-shadow 500ms var(--ease-out);
```

`PresetsPage.css:47` / `:62` / `:72` 当前代码（渐变底、辉光、图标）：

```css
  transition: opacity 500ms var(--ease-out);
  ...
  transition: transform 500ms var(--ease-out);
```

`PresetsPage.css:86-89` 当前代码（标题，从 scale(0) 放大）：

```css
  white-space: nowrap;
  transform: scale(0);
  transition: transform 500ms var(--ease-out) 150ms;
```

## Target

- 胶囊展开 500ms → **240ms**（`var(--dur-med)`，对齐全站 hover 时长），渐变底/辉光/图标同降。
- 标题起始态 `scale(0)` → **`opacity: 0; transform: scale(0.9)`**（从接近真实尺寸出现，符合 AUDIT 的 0.9–0.97 区间），过渡保留 150ms 延迟（延迟是展开节奏的一部分，保留但缩短为 120ms）。
- `width` 布局动画是组件本质效果（胶囊变宽），无法用 transform 替代；降速后单次 hover 的 layout 成本可接受。不改动画属性本身。

## Repo conventions to follow

- 时长令牌 `--dur-med: 240ms`、`--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`（tokens.css）。
- 入场/出现形态正确范例：`RingCountdown.css` 刻度珠 `scale(0.5)→1` 无 opacity 但对象是 SVG 小圆点；文本出现应带 opacity（`Dropdown.tsx` 菜单 `opacity: 0, y: -10`）。本计划采用 `opacity + scale(0.9)`。

## Steps

1. **`PresetsPage.css:31-32`**：

   ```css
     width var(--dur-med) var(--ease-out),
     box-shadow var(--dur-med) var(--ease-out);
   ```

2. **`PresetsPage.css:47`**（`.presets-create__bg`）与 **`:62`**（`.presets-create__glow`）：

   ```css
   transition: opacity var(--dur-med) var(--ease-out);
   ```

3. **`PresetsPage.css:72`**（`.presets-create__icon`）：

   ```css
   transition: transform var(--dur-med) var(--ease-out);
   ```

4. **`PresetsPage.css:88-89`**（`.presets-create__title`）：

   ```css
   transform: scale(0.9);
   opacity: 0;
   transition:
     transform var(--dur-med) var(--ease-out) 120ms,
     opacity var(--dur-med) var(--ease-out) 120ms;
   ```

   并确认 hover 规则（约第 117-127 行）里 title 的目标态是 `scale(1)`——在其上补 `opacity: 1`（若 hover 规则只写了 transform，需加 opacity；实际 hover 态由既有规则控制，检查 `.presets-create:hover .presets-create__title` 是否已含 opacity: 1，若无则补）。

5. **reduced-motion 区块**（约第 117 行起）：已对全部 `transition: none`，无需改动；`scale(0.9)/opacity 0` 初始态在 reduced-motion 下会瞬变到终值（hover 规则），无感知问题——若 hover 规则未写 opacity，则在 reduced-motion 下标题 opacity 0 不可见，需在 `.presets-create__title` 常态补 `opacity: 1` 的前提是 hover 规则负责展开。**实现时以实际代码为准：保证 reduced-motion 下标题始终可见**（transition: none 时初始态不得残留 opacity: 0）。

## Boundaries

- 不要改胶囊的 hover 目标态（宽度、颜色、辉光值）。
- 不要动渐变配色（`--presets-create--primary/math/...`）。
- 不要动 PresetsPage.tsx 结构。

## Verification

- **Mechanical**: `npm run lint` 通过。
- **Feel check**：
  - hover 胶囊：240ms 平滑展开，标题从 0.9 放大淡入，无"从点炸开"感。
  - DevTools Performance 录制 hover 一次：无长任务、无连续 layout 抖动（width 动画单次运行）。
  - 开 `prefers-reduced-motion: reduce`：胶囊不展开形变，标题可见（不残留 opacity 0）。
- **Done when**: 展开 240ms、标题从 scale(0.9)+opacity 0 出现、reduced-motion 下标题可见。
