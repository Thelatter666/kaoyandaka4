# 网课页分区卡纵向单列 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 网课页(`#/courses`)7 个分区卡在桌面端由 bento 错落网格改为纵向单列,每张卡占满整行。

**Architecture:** 纯 CSS 覆盖,仅改 `client/src/pages/CoursesPage.css`。双类选择器 `.courses-grid.bento-grid`(特异性 2 类)覆盖共享工具类 `.bento-grid` 的 12 列布局,不依赖 CSS 加载顺序;`grid-column: span 1` 覆盖 `bento-span-4/6`,防止单列网格中撑出隐式列。组件代码、共享工具类、其他页面均不动。

**Tech Stack:** CSS(CSS Grid 单列覆盖)。

## Global Constraints

- 只改 `client/src/pages/CoursesPage.css` 一个文件,不改 TSX、不动 `utilities.css`、不影响统计/计划/首页
- 保留:reveal 入场动画、`--i` 编排变量、导入/删除流程、空分区虚线卡、双进度条
- 注释风格:中文,注明"2026-08 用户偏好"及原 v2 12.4 Bento 构图去向
- 不硬编码颜色/尺寸值,不引入新依赖

---

### Task 1: CoursesPage.css 单列网格覆盖

**Files:**
- Modify: `client/src/pages/CoursesPage.css`(文件头注释 + `.courses-grid` 块,共 8-9 行改动)

**Interfaces:**
- Consumes: 无(纯 CSS,`CoursesPage.tsx` 第 92 行已有 `className="bento-grid courses-grid"`、第 102 行传 `bento-span-{zone.span}` 类,span 取值只有 4 和 6)
- Produces: 无下游依赖

- [ ] **Step 1: 修改 CoursesPage.css**

将 `client/src/pages/CoursesPage.css` 全文替换为:

```css
/* ============================================================
   网课管理页（设计文档 8.5 / v2 12.4）
   页头由 PageShell 提供（导入入口在操作槽）；
   7 分区纵向单列（2026-08 用户偏好，替代 bento 错落构图；
   .bento-grid 工具类与跨度类仍保留在 utilities.css 中）
   ============================================================ */

/* 2026-08 用户偏好：7 分区由 bento 错落网格改为纵向单列。
   双类选择器（2 类特异性 > .bento-grid 的 1 类）不依赖 CSS 加载顺序；
   span 1 覆盖防止 1fr 单列下 span 4/6 撑出隐式列 */
.courses-grid.bento-grid {
  grid-template-columns: 1fr;
}
.courses-grid .bento-span-4,
.courses-grid .bento-span-6 {
  grid-column: span 1;
}

/* 分区卡高度不一，顶部对齐（单列下每行一张卡，无视觉差异） */
.courses-grid {
  align-items: start;
}

/* CTA 按压回弹（设计文档 13.4）：scale(0.96) + --ease-spring */
.courses-import-cta {
  transition-timing-function: var(--ease-spring);
}

.courses-import-cta:active:not(:disabled):not(.btn--loading) {
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .courses-import-cta:active:not(:disabled) {
    transform: none;
  }
}
```

(原文件头注释中"7 分区错落 bento 网格"更新为单列说明;CTA 部分原样保留。)

- [ ] **Step 2: 构建验证**

Run: `cd /Users/happy/Desktop/kaoyandaily && npm run build:client`
Expected: `vite build` 成功,无 CSS 语法错误,输出 dist 产物。

- [ ] **Step 3: 浏览器视觉验证(登录态)**

网课页需要登录会话,项目 e2e 走真实认证(非 mock)。两种方式任选其一:

方式 A(自动化,若可用):用 Playwright 打开 `http://localhost:5173/#/courses`,登录后断言:

```js
const cards = page.locator('.zone-card');
const first = await cards.nth(0).boundingBox();
const second = await cards.nth(1).boundingBox();
// 纵向单列:两张卡 x 对齐、y 依次递增
expect(second.x).toBeCloseTo(first.x, 0);
expect(second.y).toBeGreaterThan(first.y + first.height - 5);
```

方式 B(人工):浏览器打开 `http://localhost:5173/#/courses`,确认 7 张分区卡从上到下各占整行、无并排;入场动画、导入弹窗、删除确认正常。

Expected: 7 卡纵向单列,无任何并排;动画/弹窗功能正常。

- [ ] **Step 4: 提交**

```bash
git add client/src/pages/CoursesPage.css
git commit -m "style(网课页): 分区卡改为纵向单列（2026-08 用户偏好，替代 bento 错落）"
```
