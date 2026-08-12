# 016 — 网课导入弹窗步骤内容切换淡入

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: MEDIUM
- **Category**: Missed opportunity（Preventing a jarring change）
- **Estimated scope**: 2 files（ImportCourseModal.tsx / ImportCourseModal.css）

## Problem

导入弹窗的三步流程（粘贴 → 预览 → 确认）里，步骤内容块是**条件渲染瞬切**：`step === 1 && (...)`、`step === 2 && ...`、`step === 3 && ...` 之间切换时，整个内容区（表单/预览表格/确认按钮）瞬间替换，无任何过渡。步骤指示器（小圆点）有颜色过渡，但内容区是生硬的"闪现"。导入课程是偶尔操作（符合 standard animation 频率档），内容切换值得一个轻量淡入。

`client/src/components/courses/ImportCourseModal.tsx:160` 当前代码（三个步骤块的容器）：

```tsx
      <div className="import-modal__body">
        {step === 1 && (
          <>
            ...
```

（`step === 2` 在 :232、`step === 3` 在 :292，同结构。）

## Target

每次 step 变化，内容区从 `opacity 0 + translateY(4px)` 淡入到位（160ms `--dur-fast` + `--ease-out`）。通过给容器加 `key={step}` 强制重挂载 + `@starting-style` 实现（无需 JS 状态机，仓库已有该模式）。

## Repo conventions to follow

- 仓库入口过渡模式：`TaskItem.css` / `ForestGlasshouse.css` 已用 `transition` + `@starting-style`（挂载时播放一次、状态更新不重播）。本计划沿用。
- 时长/缓动：`var(--dur-fast)`（160ms）+ `var(--ease-out)`。

## Steps

1. **`ImportCourseModal.tsx:160`** 容器改为携带 key 的 pane（只改这一行）：

   ```tsx
       <div key={step} className="import-modal__body import-pane">
   ```

   （React 会在 step 变化时卸载旧容器、挂载新容器，触发 @starting-style 入场。）

2. **`ImportCourseModal.css`** 新增（文件末尾或 import-steps 区块附近）：

   ```css
   /* 步骤内容切换入场：key 变化重挂载时淡入（@starting-style，仅播放一次） */
   .import-pane {
     transition:
       opacity var(--dur-fast) var(--ease-out),
       transform var(--dur-fast) var(--ease-out);
   }

   @starting-style {
     .import-pane {
       opacity: 0;
       transform: translateY(4px);
     }
   }
   ```

3. **reduced-motion**：全局 0.01ms 规则会把 transition 压到 100ms 并保留 opacity 反馈，无需额外覆盖（与 TaskItem 一致的做法是依赖全局规则；若追求一致可加显式块，但非必需）。

## Boundaries

- 不要动 step 状态机、`setStep` 逻辑、解析/导入流程。
- 不要动 `.import-modal__body` 原有布局样式（只新增 `.import-pane` 过渡，二者选择器可共存——若 `.import-modal__body` 已有 transition 属性则合并进同一规则，实现时检查）。
- 不要动步骤指示器（`.import-steps__*`，已有颜色过渡）。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client`、`npm run lint` 通过。
- **Feel check**（DevTools Animations 面板）：
  - 打开导入弹窗 → 粘贴文本 → 点击"预览"：内容区 160ms 淡入上移，无生硬闪现。
  - 预览 → 确认 → 返回：每次切换均淡入；快速连点步骤：transition 可中断，无卡顿。
  - reduced-motion：内容直接出现（100ms 压缩，无位移）。
- **Done when**: 三步内容切换均有 ≥1 次平滑淡入，操作路径无变化。
