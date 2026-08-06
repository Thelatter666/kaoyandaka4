# 设计:网课页分区卡改为纵向单列

日期:2026-08-06
状态:已批准(方案 A)

## 意图

网课页(`#/courses`)7 个分区卡(数学/英语/408·未分类/408·数据结构/408·计算机组成/408·操作系统/408·计算机网络)在桌面端(≥1024px)目前为 Bento 错落网格:数学+英语并排一行、三个 408 卡并排一行、操作系统+网络并排一行。用户偏好改为**全部纵向单列堆叠**——每张卡占满整行,从上到下依次排列。

## 方案(已选 A:纯 CSS 覆盖)

仅修改 `client/src/pages/CoursesPage.css`,不触碰共享工具类与组件代码。

```css
/* 2026-08 用户偏好:7 分区由 bento 错落网格改为纵向单列(原 v2 12.4 Bento 构图保留在 utilities.css 工具类中) */
.courses-grid {
  grid-template-columns: 1fr;
  align-items: stretch;
}
.courses-grid .bento-span-4,
.courses-grid .bento-span-6 {
  grid-column: span 1;
}
```

要点:
- `grid-template-columns: 1fr` + 显式覆盖 span → 单列下每张卡占满整行(不能只改列数:span 4/6 会在单列网格中创建隐式列,必须同时覆盖 span)
- 原有 `.courses-grid { align-items: start }` 改为 `stretch`(单列下卡片等高更整齐;或保留 start,卡片自然高度)
- 不动的部分:reveal 入场动画、`--i` 编排变量、导入/删除流程、空分区虚线卡、双进度条、`utilities.css` 的 `.bento-grid` 工具类

## 边界

- 只影响网课页;统计页/计划页/首页共用的 `.bento-grid` 原样保留
- 移动端(<1024px)本已单列,无变化
- 不改 `CoursesPage.tsx`、`CourseZoneCard.tsx`、共享工具类

## 验收标准

1. 桌面端 7 张分区卡从上到下各占整行,无任何并排
2. 卡片入场动画、导入弹窗、删除确认均正常
3. `npm run lint` 通过
4. `npm run build`(vite build)通过
