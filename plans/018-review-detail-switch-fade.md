# 018 — 复盘页切换日期时详情区淡入

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: LOW
- **Category**: Missed opportunity（Preventing a jarring change）
- **Estimated scope**: 2 files（ReviewPage.tsx / ReviewPage.css）

## Problem

复盘页左侧日期列表点击切换时，右栏详情（日期标题 + textarea 内容）**整块瞬切**：textarea 的值、日期文字同时跳变。复盘是每天一次的"回顾+记录"场景，内容替换带一个轻量淡入能避免生硬感。频率属 occasional（每天几次点选），符合 standard animation 档。

`client/src/pages/ReviewPage.tsx:171-191` 当前代码（详情区）：

```tsx
          <section className="review-detail-wrap reveal" style={{ '--i': 1 } as React.CSSProperties} aria-label="复盘详情">
            <Card>
              <h2 className="review-detail__title">
                <NotebookPen size={18} strokeWidth={1.75} aria-hidden="true" />
                每日复盘
              </h2>
              <p className="review-detail__date">{formatDateDisplay(selectedDate)}</p>
              <textarea
                className="review-detail__textarea"
                value={content}
                ...
```

（`content` 由 `selectedDate` 驱动，切换时瞬变。）

## Target

给 `<Card>` 加 `key={selectedDate}`：日期切换时整卡重挂载，经 `@starting-style` 从 `opacity 0 + translateY(4px)` 淡入（160ms `--dur-fast` + `--ease-out`）。**注意 textarea 焦点**：切换日期时重挂载会丢焦点/光标——这是"换了一篇内容"的合理语义（用户正在点选另一天），且编辑中的未保存内容已有"未保存"提示兜底，行为不变，仅视觉过渡。

## Repo conventions to follow

- `transition` + `@starting-style` 模式（TaskItem / ForestGlasshouse / 016 / 017 计划同款）。
- `review-detail__textarea` 已有 `transition: border-color/box-shadow`（聚焦辉光），不受影响。

## Steps

1. **`ReviewPage.tsx:172`**：

   ```tsx
            <Card key={selectedDate}>
   ```

2. **`ReviewPage.css`** 新增（文件末尾）：

   ```css
   /* 日期切换：详情卡重挂载淡入（key 变化触发 @starting-style，160ms） */
   .review-detail-wrap .card {
     transition:
       opacity var(--dur-fast) var(--ease-out),
       transform var(--dur-fast) var(--ease-out);
   }

   @starting-style {
     .review-detail-wrap .card {
       opacity: 0;
       transform: translateY(4px);
     }
   }
   ```

   （用 `.review-detail-wrap .card` 限定，避免影响全局 `.card` 的 hover 过渡——`Card.css` 的 `.card` 已有 `transform var(--dur-med)` 过渡用于 hover，合并选择器后需确认 hover 上浮仍生效：`@starting-style` 只影响挂载瞬间，常态过渡规则两者共存时以具体性为准；实现时若 hover 过渡被覆盖，把两条 transition 合并进 `.card` 的既有规则中。）

3. **reduced-motion**：全局 0.01ms 规则压缩至 100ms 保留淡入，无需额外处理（与 016 计划一致）。

## Boundaries

- 不要动日期列表、`handleSelect`、保存/加载逻辑。
- 不要动 `.reveal` 入场（页面级，`--i: 1` 保留）。
- 若 `.card` 的 hover 过渡被新规则干扰，只调整本计划的 CSS 合并方式，不改 Card.css。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client`、`npm run lint` 通过。
- **Feel check**：
  - 复盘页点选不同日期：详情卡 160ms 淡入，无生硬跳变。
  - 详情卡 hover 上浮（Card hover 语义，若该卡可 hover）不受影响。
  - 快速连点日期：无堆积、无闪烁。
  - reduced-motion：内容直接呈现。
- **Done when**: 日期切换详情 160ms 淡入，编辑/保存行为不变。
