# 005 — 补 `--ease-in-out` 令牌并替换钟内硬编码缓动

- **Status**: TODO
- **Commit**: 64fc253
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: `client/src/styles/tokens.css` + `client/src/components/timer/RingCountdown.css`，共 2 行改动

## Problem

`tokens.css` 的动效区只有 `--ease-out` 与 `--ease-spring`（tokens.css:142-145），没有 `--ease-in-out` 令牌，而番茄钟的呼吸脉动硬编码了内建缓动：

```css
/* RingCountdown.css:91 — 当前 */
.ring-countdown--lowtime .ring-countdown__progress {
  animation: ring-breathe 2s ease-in-out infinite;
}
```

这是番茄钟模块内唯一硬编码的内建缓动，破坏了"缓动只活在令牌里"的项目惯例。往返/呼吸类动画需要一个可复用的强 ease-in-out。

## Target

在 tokens.css 动效区新增令牌，并替换 RingCountdown.css 中的硬编码：

```css
/* tokens.css — 追加（放在 --ease-spring 之后，145 行） */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* 强 ease-in-out：往返/呼吸脉动 */
```

```css
/* RingCountdown.css:91 — 改为 */
.ring-countdown--lowtime .ring-countdown__progress {
  animation: ring-breathe 2s var(--ease-in-out) infinite;
}
```

## Repo conventions to follow

- 曲线定义集中在 tokens.css 动效区（tokens.css:138-149），组件只引用 `var(--...)`
- 曲线值来源为项目动效规范（与 `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` 同族，不自造近似值）

## Steps

1. `tokens.css` 第 145 行（`--ease-spring` 之后）插入 `--ease-in-out` 令牌（值如上）
2. `RingCountdown.css` 第 91 行 `ease-in-out` → `var(--ease-in-out)`

## Boundaries

- 不触碰 `ForestGlasshouse.css:388-428` 的 9 处硬编码 `ease-in-out`（12-20s 的森林尘埃粒子是长周期环境动效，独立节奏，不在番茄钟模块职责内——如需统一可另立计划）
- 不修改 `--ease-out` / `--ease-spring` 既有值
- 仅以上两个文件各一行

## Verification

- **Mechanical**: `npm run lint` 通过
- **Feel check**: 低时态呼吸脉动与改动前节奏一致（曲线替换不改变 2s 周期与 0.7↔1 幅度，仅相位曲线更利落）
- **Done when**: 文件内 grep 无裸 `ease-in-out`；后续计划 004 可直接引用该令牌
