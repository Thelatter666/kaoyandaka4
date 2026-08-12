# 012 — 热力图格子 hover 换用项目令牌

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file（StudyHeatmap.css）

## Problem

热力图格子 hover 缩放硬编码 `0.12s ease`——裸 `ease`（浏览器默认曲线）与硬编码时长，全站唯一离群写法。缩放 1.35 本身是贡献图惯例（确认信息），保留；只换曲线与时长令牌。

`client/src/components/heatmap/StudyHeatmap.css:74` 当前代码：

```css
  transition: transform 0.12s ease;
```

## Target

```css
  transition: transform var(--dur-fast) var(--ease-out);
```

（160ms + `cubic-bezier(0.22, 1, 0.36, 1)`，与全站 hover 反馈一致，且对高频划格子更快停稳。）

## Repo conventions to follow

- 时长/缓动一律走 `tokens.css` 令牌；hover 反馈基准 `--dur-fast` + `--ease-out`（`Button.css`、`TaskItem.css` 均如此）。
- reduced-motion 区块（StudyHeatmap.css:179）已正确，不动。

## Steps

1. **`StudyHeatmap.css:74`** 替换为：

   ```css
   transition: transform var(--dur-fast) var(--ease-out);
   ```

## Boundaries

- 不要改 `scale(1.35)` 与 `z-index` 提升逻辑。
- 不要动档位配色。

## Verification

- **Mechanical**: `npm run lint` 通过。
- **Feel check**: 首页热力图划过格子：放大即时、无拖尾；`prefers-reduced-motion` 下无缩放（回归确认）。
- **Done when**: 格子 hover 使用 `--dur-fast` + `--ease-out`，行为无感知差异（更快停稳）。
