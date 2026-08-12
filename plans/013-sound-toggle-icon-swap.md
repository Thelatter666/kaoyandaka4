# 013 — SoundToggle 图标切换压缩至 200ms

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file（SoundToggle.tsx）

## Problem

番茄钟页头提示音开关的图标切换用 `AnimatePresence mode="wait"`：旧图标先退出 150ms，新图标再进入 150ms，**串行共 300ms**。开关是"确认反馈"，300ms 有慢一拍感；`mode="wait"` 的串行在此场景无必要（两个图标尺寸相同、位置相同）。

`client/src/components/ui/SoundToggle.tsx:57-64` 当前代码：

```tsx
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={enabled ? 'on' : 'off'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15 }}
          className="sound-toggle__icon"
        >
```

## Target

单段 100ms（`duration: 0.1`），总时长 200ms 内完成；保持 `mode="wait"` 避免双图标重叠闪烁（scale 0.6 的交叉叠影会闪）。

## Repo conventions to follow

- 状态指示切换基准：`--dur-fast: 160ms`（tokens.css）。图标交叉切换比纯颜色过渡需要更短单段，0.1s 是刻意收窄（两段串行 0.2s ≈ --dur-fast 量级）。
- `initial={false}` 保留（首挂载不播）。

## Steps

1. **`SoundToggle.tsx:63`**：

   ```tsx
          transition={{ duration: 0.1 }}
   ```

## Boundaries

- 不要动 `AnimatePresence` / `motion.span` 结构与 key 逻辑。
- 不要动 scale 0.6/1 值（图标缩放语义正确）。
- 提示音偏好保存逻辑（乐观更新/回滚）不在此范围。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client` 通过。
- **Feel check**: 快速连点开关：图标切换干脆（≤200ms 完成），无重叠闪烁；`prefers-reduced-motion` 下无动画（framer `useReducedMotion` 未在此组件使用——若 DevTools 下仍有动画，说明需在 `initial/animate` 加 `reducedMotion ? false : ...` 分支，与 Dropdown.tsx 的既有模式一致）。
- **Done when**: 切换总时长 ≤200ms，连点不闪烁。
