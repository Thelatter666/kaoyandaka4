# 003 — Magnetic 磁性组件：停止永续 rAF 循环，去除双重缓动

- **Status**: TODO
- **Commit**: 64fc253
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: `client/src/components/ui/Magnetic.tsx`，约 15 行改动

## Problem

`Magnetic` 组件包裹着番茄钟页主 CTA「开始专注」（PomodoroPage.tsx:419-426），存在两个叠加问题：

1. **rAF 循环永不停**：`onPointerEnter` 启动后，`applyTransform` 每帧无条件 `requestAnimationFrame(applyTransform)`（哪怕 `target === current` 已经完全收敛），只有组件卸载才停。鼠标悬停期间（含触摸设备 tap 触发 pointerenter 后），永久 60fps 写 `style.transform`：

```ts
// Magnetic.tsx:33-49 — 当前
const applyTransform = useCallback(() => {
  if (!elRef.current) return;
  const dx = targetRef.current.x - currentRef.current.x;
  const dy = targetRef.current.y - currentRef.current.y;
  // 接近目标值时直接对齐，避免抖动
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
    currentRef.current = { ...targetRef.current };
  } else {
    currentRef.current.x += dx * 0.12;
    currentRef.current.y += dy * 0.12;
  }
  elRef.current.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
  rafRef.current = requestAnimationFrame(applyTransform);
}, []);
```

2. **CSS transition 与 rAF lerp 双重缓动**：元素内联了 `transition: transform var(--dur-fast) var(--ease-out)`（160ms ease-out），而 rAF 又逐帧推进 lerp。每帧写入 transform 都重启一次 160ms 过渡，两个缓动叠加导致实际收敛比预期更慢、相位更糊：

```ts
// Magnetic.tsx:108-110 — 当前
style: {
  display: 'inline-block',
  willChange: 'transform',
  transition: 'transform var(--dur-fast) var(--ease-out)',
  ...style,
},
```

rAF lerp（每帧 0.12 因子，等效 easeOutQuad 家族）本身就是完整的缓动，CSS transition 是多余的。

## Target

- 收敛即停：`|dx| < 0.1 && |dy| < 0.1` 时把位置对齐到 target 并 **cancelAnimationFrame 停止循环**，不再自请求下一帧
- 删除内联 `transition: transform ...`，缓动完全交给 rAF lerp（平滑度不变）
- 指针离开/超出半径：target 归零后循环自然收敛停止；重新进入/移动时 `startRAF`（已存在，幂等）重新启动

```ts
// 目标 — applyTransform（自包含停止逻辑，不引入额外依赖）
const applyTransform = useCallback(() => {
  if (!elRef.current) return;
  const dx = targetRef.current.x - currentRef.current.x;
  const dy = targetRef.current.y - currentRef.current.y;
  // 接近目标值时直接对齐并停止循环（避免空闲时 60fps 空转）
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
    currentRef.current = { ...targetRef.current };
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return;
  }
  currentRef.current.x += dx * 0.12;
  currentRef.current.y += dy * 0.12;
  elRef.current.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
  rafRef.current = requestAnimationFrame(applyTransform);
}, []);
```

注意：`handlePointerLeave` 只把 target 归零、不停止循环 —— 收敛到 0 后由新逻辑自行停止，行为正确，无需改动。

## Repo conventions to follow

- 不动 `startRAF`/`stopRAF` 的幂等守卫（Magnetic.tsx:76-86）：`startRAF` 在循环已停时重新启动，`stopRAF` 仍是卸载清理入口
- 保留 `willChange: 'transform'`（单元素常驻，不扩 scope）

## Steps

1. `Magnetic.tsx` 中 `applyTransform`（33-49 行）按上面的目标版本整体替换
2. `Magnetic.tsx` 第 109 行删除 `transition: 'transform var(--dur-fast) var(--ease-out)',`（只删这一行，`willChange` 与 `display` 保留）

## Boundaries

- 不新增/不删除其他 handlers；`handlePointerMove`、`handlePointerLeave`、`startRAF`、`stopRAF`、卸载清理全部不动
- 不改 `strength`/`radius` 默认值与调用方（番茄钟页、其他页面使用者）
- 不触碰 `willChange` 与 `display`

## Verification

- **Mechanical**: `npm run lint` 与 `npm run build` 通过；无未使用变量
- **Feel check**：
  - 悬停「开始专注」：按钮仍平滑跟随鼠标（无卡顿、无抖动），远离时平滑归位
  - 性能验证：DevTools Performance 录制 5 秒（悬停后手指不动），确认没有持续帧活动（或控制台执行两次 `document.querySelector('.pomodoro-cta').parentElement.style.transform` 间隔 300ms，值完全一致且不再变化）
  - 触摸模拟（DevTools 设备模式）：tap 一次后无持续 rAF（Battery/Performance 面板无帧活动）
- **Done when**: 悬停静止时无任何 rAF 帧；手感与改动前一致或更跟手
