# 017 — 番茄钟完成视图补一个轻量淡入

- **Status**: TODO（方案经验证无效，2026-08-12 实测：三元分支两侧同为 `<div>` 时 React 复用 DOM 节点（仅换 className），`@starting-style` 只对元素首次渲染生效故不触发；需给 completed 分支 div 加 `key` 强制重挂载，见 plans/README.md「实施验证结论」）
- **Commit**: c23ba7c
- **Severity**: LOW
- **Category**: Missed opportunity（Delight / Preventing a jarring change）
- **Estimated scope**: 2 files（PomodoroPage.tsx / PomodoroPage.css）

## Problem

专注自然结束/提前完成时：钟盘隐藏（`--hidden`），完成视图（`.pomodoro-completed`：大图标 + 本轮成果 + 继续/休息入口）**瞬间出现**。此刻已有粒子爆散（BurstParticles）庆祝，但完成卡本身是硬切，与前后的平滑动效（钟盘 900ms 环、粒子 1.2s）节奏不匹配。完成是每日 4-8 次的"稀有高情绪时刻"（delight budget 允许），补一个 200ms 淡入缩放即可让节奏连贯。

`client/src/pages/PomodoroPage.tsx:568-574` 当前代码：

```tsx
      {step === 'completed' ? (
        /* 完成态：粒子爆散 + 继续/休息入口（钟随舞台隐藏，保持挂载不重挂） */
        <div className="pomodoro-completed">
          {/* 完成粒子：自然结束/提前完成触发一次；取消/休息结束不触发 */}
          <BurstParticles burstKey={burstKey} colorVar="--color-accent-primary" />
```

`PomodoroPage.css` 中 `.pomodoro-completed` 当前无任何过渡/动画。

## Target

完成视图挂载时从 `opacity 0 + scale(0.96)` 淡入（200ms `var(--dur-med)` 240ms 与 --ease-out；scale 0.96 是 AUDIT 推荐区间 0.9–0.97）。用 `@starting-style`，节点挂载只播一次，之后 idle/active/completed 往返不重播（节点随 step 卸载重挂——重挂会重播，属预期：每次进入完成态都该有入场）。

## Repo conventions to follow

- 入场模式：`transition` + `@starting-style`（TaskItem / ForestGlasshouse / 016 计划同款）。
- 完成时刻的既有庆祝：`BurstParticles`（rAF canvas 粒子，reduced-motion 跳过）——淡入与其并行不冲突（粒子在父容器中心、淡入作用于整卡）。

## Steps

1. **`PomodoroPage.css`** 在 `.pomodoro-completed` 规则（约 :198）处补：

   ```css
   /* 完成视图入场：挂载时 240ms 淡入 + 微缩放（@starting-style 仅播放一次） */
   .pomodoro-completed {
     transition:
       opacity var(--dur-med) var(--ease-out),
       transform var(--dur-med) var(--ease-out);
   }

   @starting-style {
     .pomodoro-completed {
       opacity: 0;
       transform: scale(0.96);
     }
   }
   ```

2. **reduced-motion**：PomodoroPage.css 的 reduced-motion 区块（末尾，含 `.pomodoro-hero__stage--ignite` 取消处）补：

   ```css
   .pomodoro-completed {
     transition: none;
   }
   ```

   （`@starting-style` 起始态在 `transition: none` 下直接落到终值，无需额外处理。）

## Boundaries

- 不要动完成视图内容结构（图标/文案/按钮）。
- 不要动 BurstParticles 触发逻辑。
- 不要动 `.pomodoro-hero__stage--hidden` 的隐藏机制（钟保持挂载）。

## Verification

- **Mechanical**: `npm run lint` 通过。
- **Feel check**（DevTools Animations 面板 10% 速度）：
  - 完成一次专注（可把专注时长调 5 分钟）：钟盘淡出隐藏 → 完成卡 240ms 淡入缩放，与粒子爆散节奏协调。
  - 提前完成 / 取消后重新开始 → 再完成：每次进入完成态都播放一次入场。
  - reduced-motion：完成卡直接出现、无缩放位移，粒子不播（回归确认）。
- **Done when**: 完成视图每次出现都有 240ms 淡入缩放，与粒子庆祝并行不违和。
