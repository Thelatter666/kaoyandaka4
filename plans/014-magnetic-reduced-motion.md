# 014 — Magnetic 磁吸增加 prefers-reduced-motion 门控

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 1 file（Magnetic.tsx）

## Problem

`Magnetic` 组件（番茄钟"开始专注"CTA 的磁吸包裹）用 rAF 持续把按钮向鼠标方向位移，**没有任何 reduced-motion 检测**。对前庭敏感用户，装饰性位移在 `prefers-reduced-motion` 下应完全关闭（AUDIT：reduced motion = 去掉位移，保留功能性反馈）。

`client/src/components/ui/Magnetic.tsx` 当前代码（关键部分）：

```tsx
  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const rect = elRef.current?.getBoundingClientRect();
    ...
    elRef.current.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
    rafRef.current = requestAnimationFrame(applyTransform);
  };
```

组件无 `matchMedia` / `useReducedMotion` 引用（`grep -n "matchMedia\|prefers-reduced\|reduced" Magnetic.tsx` 为空）。

## Target

reduced-motion 下：不注册指针位移、不启动 rAF，按钮完全静止（功能不受影响——磁吸纯装饰）。

## Repo conventions to follow

- 仓库既有 JS 侧 reduced-motion 检测模式：`App.tsx:135-136` 用 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`；`BurstParticles.tsx` 同款。Magnetic 未引入 framer，沿用 `window.matchMedia` 模式（不新增依赖）。

## Steps

1. **`Magnetic.tsx`** 顶部新增常量与 hook：

   ```tsx
   // 磁吸为纯装饰位移：reduced-motion 下直接渲染 children，不注册指针逻辑
   const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
   ```

   在组件函数内（`elRef` 声明附近）：

   ```tsx
   const [reducedMotion, setReducedMotion] = useState(() =>
     typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches
   );

   useEffect(() => {
     const mq = window.matchMedia(REDUCED_MOTION_QUERY);
     const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
     mq.addEventListener('change', onChange);
     return () => mq.removeEventListener('change', onChange);
   }, []);
   ```

   （需在 React import 中补 `useState`——当前 `import React, { useRef, useCallback, useEffect } from 'react';` 无 useState。）

2. **渲染分支**：`return` 处（当前 `return <Tag ...>`）改为：

   ```tsx
   if (reducedMotion) return <>{children}</>;
   ```

   放在所有 hooks 之后、现有 `return` 之前。

3. **事件门控（防御）**：`handlePointerMove` / `handlePointerLeave` 开头加：

   ```tsx
   if (reducedMotion) return;
   ```

## Boundaries

- 不要改磁吸强度/半径/缓动算法（0.12 插值、easeOutQuad）。
- 不要动 `will-change: transform` 等样式。
- 不要动 PomodoroPage.tsx 的调用（`strength={0.2} radius={150}` 不变）。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client`、`npm run lint` 通过。
- **Feel check**：
  - 默认：番茄钟页鼠标移近"开始专注"按钮，磁吸位移如常（回归）。
  - DevTools Rendering 面板开 `prefers-reduced-motion: reduce`：鼠标移近/移出按钮完全不动，点击正常。
  - 运行中切换系统 reduced-motion 设置：位移即时停止（matchMedia change 监听）。
- **Done when**: reduced-motion 下按钮零位移、零 rAF 空转。
