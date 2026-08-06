# 组件集成报告：Interactive Hover Button

## 📦 集成概述

基于组件库的 `interactive-hover-button` 组件，为「砚台考研打卡」项目进行适配改造，成功集成到**首页「开始专注」**与**番茄钟「开始专注」**两个主 CTA 按钮。

### 集成时间线
- ✅ 组件分析完成
- ✅ 设计系统适配完成
- ✅ 依赖处理完成（零新依赖）
- ✅ 业务逻辑集成完成（loading 防重复提交保留）
- ✅ 样式验证完成（构建 + 浏览器 hover 实测）

---

## 🔧 核心改造点

### 1. **Tailwind CSS → 极光玻璃令牌**
原组件使用 Tailwind utility classes（`bg-primary`、`bg-background`、`rounded-full`、`scale-[100.8]` 等），全部替换为项目 CSS 令牌，新建 `InteractiveHoverButton.css`：

```tsx
// ❌ 原版（Tailwind）
className="group bg-background relative w-auto cursor-pointer overflow-hidden rounded-full border p-2 px-6 font-semibold"

// ✅ 适配版（CSS Tokens）
className="ihb"  // 背景 var(--color-accent-primary-strong) + 白字 var(--color-text-inverse)
```

### 2. **`cn()` 合并函数移除**
原组件依赖 `@/lib/utils` 的 `cn()`（项目无此工具），改为模板字符串内联拼接：

```tsx
className={`ihb${className ? ` ${className}` : ''}${loading ? ' ihb--loading' : ''}`}
```

### 3. **hover 交互保留原效果**
- 圆点放大 `scale(100.8)` 盖满按钮 → 白底
- 原文字 `translateX(48px)` 滑出淡出
- 悬停层文字 + ArrowRight `translateX(-20px)` 滑入
- 纯 CSS transition，无 JS/framer-motion 依赖（原组件亦为纯 CSS）

### 4. **加载状态适配**
番茄钟原 `Button` 有 `loading={actionLoading}`（防重复提交），新组件增加 `loading?: boolean` prop：

```tsx
<InteractiveHoverButton className="pomodoro-cta" onClick={handleStartFocus} loading={actionLoading}>
```

loading 时：`disabled` + `.ihb--loading`（半透明 + not-allowed）。

### 5. **可访问性增强**
悬停层是文字视觉副本（同 `children` 渲染两次），为读屏器增加 `aria-hidden="true"`，避免重复朗读（原组件无此处理）。

### 6. **Reduced-motion 适配**
`prefers-reduced-motion` 下取消全部位移/放大动画，仅保留文字与辉光（项目全局规则之外的新组件自身处理）。

---

## 📍 集成位置

| 位置 | 文件 | 替换前 |
|---|---|---|
| 首页「今日专注」卡 idle 态主 CTA | `client/src/pages/HomePage.tsx:132-134` | `<Button variant="primary" size="lg">` |
| 番茄钟控制卡「开始专注」 | `client/src/pages/PomodoroPage.tsx:370-381` | `<Button variant="primary" size="lg">` + Play 图标 |

番茄钟按钮外层 **Magnetic 磁性交互保留**（`<Magnetic strength={0.2} radius={150}>` 包裹不变）。

---

## 📁 新增文件

```
client/src/components/ui/
├── InteractiveHoverButton.tsx   ← 组件（PascalCase，项目惯例）
└── InteractiveHoverButton.css   ← 样式（co-located，tokens 驱动）
```

## ✅ 验证结果

- `npx tsc --noEmit`：本次改动文件无类型错误（另有 3 个错误来自工作区既有未完成改动 CourseZoneCard/ImportCourseModal，非本次引入）
- `vite build`：通过
- 浏览器实测（Playwright，真实会话）：
  - 首页按钮：`.ihb` 胶囊（999px）、珊瑚红底 #B93A2C、白字 ✓
  - hover：dot `scale(100.8)`、label `translateX(48px)+opacity 0`、reveal `translateX(-20px)+opacity 1` ✓
  - 番茄钟按钮：`.ihb.pomodoro-cta` 渲染正常 ✓

## ⚠️ 附注

- `add.mjs interactive-hover-button` 存在复制范围 bug：registry `sourcePath` 指向文件时，脚本复制了整个 `ui/` 目录（16 个组件）且将依赖装到 monorepo 根 `package.json`。已清理误复制文件并 `git checkout` 恢复根 package 文件。**组件库 add.mjs 的 `resolveFolder` 逻辑建议修复**（文件级 sourcePath 应复制单文件而非整个目录）。
