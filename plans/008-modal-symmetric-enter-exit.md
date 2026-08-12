# 008 — Modal 打开补入场动画（开合对称）

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: HIGH
- **Category**: Physicality & origin / Interruptibility
- **Estimated scope**: 1 file（Modal.tsx）

## Problem

Modal 打开时**瞬间出现**（无任何过渡），关闭时有 200ms `scale(0.97) + opacity` 退出动画。开合不对称：打开生硬、退出平滑。所有弹窗（确认删除、课程导入、组件里的弹层）都受影响。

`client/src/components/ui/Modal.tsx:16` 当前代码：

```tsx
const EXIT_DURATION = 200;
```

`Modal.tsx:124-126` 当前代码（面板）：

```tsx
          opacity: exiting ? 0 : 1,
          transform: exiting ? 'scale(0.97)' : 'scale(1)',
          transition: `opacity ${EXIT_DURATION}ms var(--ease-out), transform ${EXIT_DURATION}ms var(--ease-out)`,
```

`Modal.tsx:104-105` 当前代码（遮罩）：

```tsx
          opacity: exiting ? 0 : 1,
          transition: `opacity ${EXIT_DURATION}ms var(--ease-out)`,
```

问题根源：组件只有 `exiting` 单状态位。打开时挂载即终值（opacity 1 / scale 1），transition 无从发生；`visible/exiting` 两阶段只服务退出。

## Target

打开：挂载后从 `opacity 0 / scale(0.97)` 过渡到终值（与退出对称）。时长统一为 `240ms`（对齐 `--dur-med` 令牌；同时把 JS 卸载计时器同步为 240ms，保持 CSS/JS 一致）。过渡用既有 `var(--ease-out)`。

## Repo conventions to follow

- 全站时长令牌：`--dur-fast: 160ms` / `--dur-med: 240ms` / `--dur-slow: 400ms`（`tokens.css`）。Modal 硬编码 200ms 是唯一的离群值，应并入 240ms。
- 退出动画 `scale(0.97)` 是正确的模态基准（AUDIT：modal 保持居中缩放，`transform-origin: center` 正确，不要改成触发点缩放）。
- Toast 组件（`Toast.tsx`）已用"data 标记 + transition 可中断"模式，Modal 沿用同一模式扩展一个 entering 位。

## Steps

1. **`Modal.tsx:16`**：

   ```tsx
   // 开合动画时长：与 tokens.css --dur-med 对齐；退出阶段先播动画再卸载 DOM
   const EXIT_DURATION = 240;
   ```

2. **`Modal.tsx`** 状态机（当前 `const [visible, setVisible] = useState(isOpen);` 与 `const [exiting, setExiting] = useState(false);` 附近）新增 entering 位：

   ```tsx
   // entering 标记开启动画阶段：挂载后下一帧移除，transition 从初始态平滑过渡
   const [entering, setEntering] = useState(false);
   ```

3. **`Modal.tsx`** open 分支（当前 `useEffect` 内 `if (isOpen) { setVisible(true); setExiting(false); return; }`）改为：

   ```tsx
   if (isOpen) {
     setVisible(true);
     setExiting(false);
     // 先渲染初始态（opacity 0 / scale 0.97），下一帧移除 entering 触发过渡
     setEntering(true);
     const raf = requestAnimationFrame(() => setEntering(false));
     return () => cancelAnimationFrame(raf);
   }
   ```

4. **`Modal.tsx:104-105`** 遮罩 style：

   ```tsx
          opacity: entering || exiting ? 0 : 1,
   ```

5. **`Modal.tsx:124-126`** 面板 style：

   ```tsx
          opacity: entering || exiting ? 0 : 1,
          transform: entering || exiting ? 'scale(0.97)' : 'scale(1)',
   ```

   transition 行不变（仍是 `${EXIT_DURATION}ms var(--ease-out)`，现在为 240ms）。

## Boundaries

- 不要动 `scale(0.97)` 数值（模态居中缩放正确）。
- 不要动 focus trap / Escape / 遮罩点击关闭逻辑。
- 不要动 Modal 内联样式的其他部分（关闭按钮的 hover 处理等）。
- 如果某调用方依赖 200ms 的卸载时机（无——EXIT_DURATION 是模块内常量），无需处理。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client` 与 `npm run lint` 通过。
- **Feel check**（DevTools Animations 面板 10% 速度）：
  - 打开任意 Modal（如计划页删除任务确认框）：面板从 `scale(0.97) + opacity 0` 平滑放大淡入，240ms。
  - 关闭：对称地缩小淡出，240ms 后 DOM 卸载。
  - 狂点开合：transition 从当前状态重定向（可中断），无跳帧、无排队。
  - 开 `prefers-reduced-motion: reduce`：全局 100ms 规则压缩过渡，卸载计时器 240ms 仍安全（DOM 保留略久无感知影响），确认无闪烁。
- **Done when**: 打开与关闭动画对称、时长一致（240ms），DOM 在退出动画结束后卸载。
