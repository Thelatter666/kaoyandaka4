# 007 — 修复任务完成庆祝动画挂载即播

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 2 files（TaskItem.tsx / TaskItem.css）

## Problem

计划页加载时，**所有已完成任务会集体播放一次"打勾庆祝"动画**（图标缩放 + 整卡下沉）。

`.task-item` 的入场过渡用了 `transition` + `@starting-style`（只在挂载时播放一次，状态更新不重播——注释明确写了这个意图），但完成态动画用的是 `animation` keyframes，**元素首次渲染时只要 class 含 `task-item--done` 就会从头播放**。页面加载、切页回来、数据刷新后重新挂载，已完成任务（用户每天都会留下已完成任务）全部闪一遍动画，视觉噪声大，且与入场淡入叠加显得混乱。

`client/src/components/tasks/TaskItem.css:90-91` 当前代码：

```css
/* 完成瞬间：CheckCircle2 缩放进入（从 0.8 放大到 1） */
.task-item--done .task-item__toggle svg {
  animation: check-celebration var(--dur-fast) var(--ease-out);
}
```

`client/src/components/tasks/TaskItem.css:109-110` 当前代码：

```css
/* 完成时整卡微妙反馈：轻微下沉（物理感） */
.task-item--done {
  animation: task-complete-settle var(--dur-fast) var(--ease-out);
}
```

预期行为：动画只在**状态从"未完成"变为"完成"的瞬间**播放，挂载时（无论初始是否已完成）不播。

## Target

首次渲染抑制两个动画；之后用户勾选任务（class 从无到有）时动画正常播放。

## Repo conventions to follow

- 仓库已有同类"挂载抑制"模式：`HomePage.css` 用 `animation: none` 覆盖选择器让完成态任务跳过入场动画：
  ```css
  .home-list > li.home-task--done {
    opacity: 0.62;
    animation: none;
  }
  ```
- 令牌一律用 `var(--dur-fast)` / `var(--ease-out)`（本文件已符合）。

## Steps

1. **`client/src/components/tasks/TaskItem.tsx`**：在组件内新增首次挂载标记。

   在现有 import 之后（`useState, useRef, useEffect` 已导入）加状态：
   ```tsx
   // 首次挂载标记：挂载完成一帧后置 false。用于抑制挂载即播的完成庆祝动画
   // （动画只应在"未完成 → 完成"的状态切换瞬间播放）
   const [mounted, setMounted] = useState(false);
   useEffect(() => {
     const raf = requestAnimationFrame(() => setMounted(true));
     return () => cancelAnimationFrame(raf);
   }, []);
   ```

2. **`TaskItem.tsx`** classNames 数组加入抑制类（现有代码第 ~63 行）：

   ```tsx
   const classNames = [
     'task-item',
     'glass-1',
     task.isCompleted ? 'task-item--done' : '',
     isSortMode ? 'task-item--sorting' : '',
     !mounted ? 'task-item--initial' : '',
   ]
   ```

3. **`client/src/components/tasks/TaskItem.css`**：在 `@keyframes check-celebration` 块之前（约第 93 行）新增：

   ```css
   /* 首次挂载抑制：页面加载时已完成的任务不播庆祝动画（动画只应在
      状态切换瞬间播放；rAF 后 class 移除，之后勾选正常生效） */
   .task-item--initial.task-item--done,
   .task-item--initial.task-item--done .task-item__toggle svg {
     animation: none;
   }
   ```

4. **`TaskItem.css`** 的 reduced-motion 区块（约第 181-186 行）已有完整降级，无需改动。

## Boundaries

- 不要改动 `.task-item` 的入场 `transition` + `@starting-style`（那是正确且刻意的设计）。
- 不要改动 PlanPage.tsx / HomePage.tsx 对 TaskItem 的调用。
- 不要改动 `check-celebration` / `task-complete-settle` 的 keyframes 本身。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client` 与 `npm run lint` 均通过。
- **Feel check**（DevTools Animations 面板 10% 播放速度）：
  - 加载计划页：已完成任务**不**播放任何缩放/下沉动画，只有入场淡入。
  - 点击一个未完成任务：勾选图标缩放 + 整卡下沉**正常播放一次**。
  - 取消勾选再勾选：动画再次播放（状态切换，正确）。
  - DevTools Rendering 面板开 `prefers-reduced-motion: reduce`：勾选无动画（既有降级，回归确认）。
- **Done when**: 刷新计划页时已完成任务无庆祝动画；手动勾选时动画播放。
