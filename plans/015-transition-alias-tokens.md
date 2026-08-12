# 015 — 删除无人使用的 --transition-fast/normal 别名令牌

- **Status**: TODO
- **Commit**: c23ba7c
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file（tokens.css）

## Problem

`tokens.css` 定义了两个"旧令牌别名"——`--transition-fast` / `--transition-normal`——但**全库零引用**（`grep -rn "transition-fast\|transition-normal" client/src/` 除 tokens.css 定义处外无结果）。死令牌会误导后续实现者以为存在"标准过渡速写"，实际大家都在手写 `var(--dur-fast) var(--ease-out)`。全站其余地方无一处使用速写，保留别名只会制造两套写法。

`client/src/styles/tokens.css:215-216` 当前代码：

```css
  --transition-fast: var(--dur-fast) var(--ease-out);
  --transition-normal: var(--dur-med) var(--ease-out);
```

## Target

删除这两行，并在原位置留一行注释说明"过渡一律手写 `var(--dur-*) var(--ease-out)`，不设速写别名"（防止未来重新引入）。

## Repo conventions to follow

- 全站统一写法：`transition: transform var(--dur-fast) var(--ease-out)`（Button.css、TaskItem.css、TopNav.css 等 30+ 文件均为手写组合）。

## Steps

1. **`tokens.css:215-216`** 替换为：

   ```css
   /* 过渡速写别名已删除：全站统一手写 `var(--dur-*) var(--ease-out)`（无第二套写法） */
   ```

## Boundaries

- 不要动 `--dur-fast` / `--dur-med` / `--ease-out` 本体（它们被大量引用）。
- 执行前再次 `grep -rn "transition-fast\|transition-normal" client/src/` 确认零引用（含 .tsx 内联样式），若发现引用则停止并报告。

## Verification

- **Mechanical**: `grep -rn "transition-fast\|transition-normal" client/src/` 输出为空；`npm run lint` 通过。
- **Feel check**: 不需要——纯令牌清理，打开几个页面确认无样式异常（渐变卡 hover、按钮按压）。
- **Done when**: 两个别名不存在，全站构建与样式无变化。
