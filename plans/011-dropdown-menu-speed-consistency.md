# 011 — Dropdown 菜单去掉逐项 stagger 并对齐项目曲线

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion & tokens
- **Estimated scope**: 1 file（Dropdown.tsx）

## Problem

三个问题：

1. **选项逐项 50ms stagger**（`delay: index * 0.05`）：下拉是高频交互（计划页选科目/子科目、导入课程选分区、复盘/统计页各处），每次打开 6+ 个选项交错入场 50ms×N，最慢的选项要等 300ms 才停稳。高频列表不需要 stagger（AUDIT：stagger 是装饰，只用于偶尔看到的组入场，且必须不阻塞交互）。
2. **framer 内置 easing 与项目令牌不一致**：菜单用 `ease: 'easeOut'`（framer 默认 `cubic-bezier(0.16, 1, 0.3, 1)`）+ `duration: 0.2`，项目约定是 `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`、`--dur-med: 240ms`。
3. **触发按钮按压 0.99 几乎无感**：`whileTap scale 0.99` 与全站按钮按压 `scale(0.97)` 不一致，按下去几乎没有反馈。

`client/src/components/ui/Dropdown.tsx:94-95` 当前代码：

```tsx
        whileHover={reducedMotion ? undefined : { scale: 1.01 }}
        whileTap={reducedMotion ? undefined : { scale: 0.99 }}
```

`Dropdown.tsx:119` 当前代码：

```tsx
            transition={{ duration: 0.2, ease: 'easeOut' }}
```

`Dropdown.tsx:135` 当前代码：

```tsx
                  transition={{ duration: 0.2, delay: index * 0.05 }}
```

## Target

- 菜单整体一个 240ms 过渡，项目曲线 `[0.22, 1, 0.36, 1]`（framer 接受数组形式 cubic-bezier），**去掉选项逐项 delay**。
- 触发按钮：去掉 `whileHover`（表单控件 hover 位移会晃，项目 hover 惯例是背景/描边变化，已有 CSS 处理）；`whileTap` 改为 `{ scale: 0.97 }`（对齐 `.btn` 按压）。
- 选中项的弹簧打勾（`stiffness 500, damping 30`）保留——它是低频"确认反馈"，且只对当前选中项播放。

## Repo conventions to follow

- 项目按钮按压基准：`Button.css` `.btn:active { transform: scale(0.97) }` + `var(--dur-fast)`。
- 项目缓动令牌：`--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`（tokens.css:143）。
- framer 中已有使用项目曲线数组的先例：无——本计划建立该先例（`ease: [0.22, 1, 0.36, 1]`）。

## Steps

1. **`Dropdown.tsx:94-95`**：

   ```tsx
        whileTap={reducedMotion ? undefined : { scale: 0.97 }}
   ```

   （删除 `whileHover` 行。）

2. **`Dropdown.tsx:119`**：

   ```tsx
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
   ```

3. **`Dropdown.tsx:133-135`**：选项 motion.li 的 transition 改为无 stagger：

   ```tsx
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
   ```

   （删除 `delay: index * 0.05`；`index` 变量若因此未使用，检查该 map 回调其余使用处——`isSelected` 使用 `option` 而非 `index`，若 index 不再被引用需从 map 参数中移除 `, index`。）

## Boundaries

- 不要动菜单结构、`AnimatePresence` 使用方式、`useReducedMotion` 分支。
- 不要动 `motion.span` 打勾弹簧（stiffness 500 / damping 30）。
- 不要动 `Dropdown.css`（chevron 旋转 180° 等 CSS 过渡已正确）。

## Verification

- **Mechanical**: `npx tsc --noEmit -p client`、`npm run lint` 通过。
- **Feel check**（DevTools Animations 面板）：
  - 打开任意下拉：菜单整体 240ms 淡入下滑，选项同时到位，**无逐项排队**。
  - 按下触发按钮：`scale(0.97)` 按压反馈与全站按钮一致。
  - 快速开关菜单：无堆积、无残留（AnimatePresence exit 正常）。
  - 开 `prefers-reduced-motion`：无动画（reducedMotion 分支已有）。
- **Done when**: 菜单打开 ≤240ms 全部停稳、按压反馈 0.97、无逐项 stagger。
