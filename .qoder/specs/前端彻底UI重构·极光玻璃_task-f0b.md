# 前端彻底UI重构计划 · 极光玻璃主题

## 设计方向（已确认）

**变体A · 极光玻璃**：浅色主场，晨雾白底+大团柔和极光渐变光斑（粉紫→雾蓝→蜜金）漂浮于背景，半透磨砂玻璃卡片（backdrop-filter）浮于其上。

- **番茄钟「光晕核心」**：悬浮玻璃圆盘+多层同心环——外环进度带同色辉光（朱砂红光晕），中环刻度珠记录今日轮次，中心超大渐变等宽数字；完成瞬间光环粒子爆散；休息模式切青绿冷光。
- **森林「玻璃花房」**：微缩温室场景——2.5D 低多边形 SVG 树（松=数学/阔叶=英语/果树=408，形状+标签双重区分）按种植时间排布于苔藓地面，玻璃罩斜向反光、悬浮尘埃光斑、天空随真实时间昼夜渐变；hover 树木显示露珠 tooltip（出生日期/科目/时长）。彻底替换现有 emoji 树。
- **色彩**：浅色=晨雾白 #F7F8FA + 珊瑚红 #E05545 主CTA + 松绿 #2FA36B；深色=午夜靛蓝 #101828 + 北极光绿紫渐变光晕。科目色保留蓝/橙/紫并提亮。
- **字体**：标题 Noto Serif SC（保留中文气质），正文 Noto Sans SC，计时数字 JetBrains Mono（等宽防跳动）。
- **硬约束**：基本功能与数据口径不变；双主题均过 WCAG AA；全站 SVG 图标（新增 lucide-react，树摇友好，替换 emoji）；prefers-reduced-motion 全部降级为静态；动效只用 opacity/transform/模糊/进度填充；不引入重型动画库（纯 CSS/SVG 实现，粒子用轻量 canvas）。

## 阶段 0：重设计文档产出（主会话执行）

- 产出 `/Users/happy/Desktop/kaoyandaily/前端重设计文档.md`，内容：设计原则与主题概念、完整设计令牌表（色板/阴影/模糊/圆角/动效/双主题对照）、字体与图标体系、动效语言规范、7 个页面逐一的重设计方案（布局/组件/交互/空错载状态）、番茄钟与森林两大核心视觉的详细规格（结构、层级、动效、降级方案）、可访问性与响应式规范、验收清单。
- commit：`docs: 新增前端重设计文档（极光玻璃主题）`

## 阶段 1：设计令牌与基础组件（子代理）

- 重写 `client/src/styles/tokens.css`、`global.css`、`utilities.css`：极光玻璃全套 token（含深色）、极光背景光斑层、字体引入。
- 重构 `client/src/components/ui/` 全部基础组件（Button/Card/Modal/Toast/ConfirmDialog/EmptyState/ErrorState/LoadingState/ProgressBar/SubjectBadge/SkipLink）为玻璃拟态，引入 lucide-react 替换 emoji。
- 验证：`npm run lint` + `npm run build` 通过。
- commit：`feat: 重建极光玻璃设计令牌与基础组件`

## 阶段 2：全局布局与导航（子代理）

- 重构 `TopNav.tsx`、`PageShell.tsx`、`ThemeToggle.tsx`：悬浮玻璃导航（毛玻璃+当前页高亮）、主题切换保留水波扩散、移动端适配、页面级极光背景接入。
- 验证：lint + build + `npm test`。
- commit：`feat: 重构全局布局导航与极光背景`

## 阶段 3：番茄钟页·光晕核心（子代理）

- 重写 `RingCountdown.tsx` 为多层辉光同心环（进度环+轮次刻度珠+渐变数字+完成粒子爆散），重构 `PomodoroPage.tsx` 布局与 `useCountdown`/`useFocusSession` 相关视觉接入，休息模式青绿冷光，reduced-motion 静态降级，保留 role="timer" 语义。
- 验证：lint + build + `npm test`。
- commit：`feat: 重构番茄钟页为光晕核心视觉`

## 阶段 4：统计页·玻璃花房（子代理）

- 重写 `StatisticsPage.tsx` 森林区：2.5D SVG 树种组件（三科异形树，幼苗/成树生长态）、苔藓地面+玻璃罩反光+尘埃光斑+昼夜渐变天空、树木 hover 露珠 tooltip、emoji 全部移除；本期成果/累计成果/记录时间线玻璃化。
- 验证：lint + build + `npm test`。
- commit：`feat: 重构统计页学习森林为玻璃花房场景`

## 阶段 5：首页与计划页（子代理）

- 重构 `HomePage.tsx`（倒计时卡/今日专注卡/任务摘要/预设概览的玻璃化与视觉层级）、`PlanPage.tsx`（任务列表/复盘区/拖拽与键盘排序视觉），含 `tasks/`、`presets/` 共享组件。
- 验证：lint + build + `npm test` + 首页 1366×768 无纵向滚动复核。
- commit：`feat: 重构首页与计划页视觉`

## 阶段 6：预设页与网课模块（子代理）

- 重构 `PresetsPage.tsx`、`CoursesPage.tsx`（7 分区玻璃卡布局）、`CourseDetailPage.tsx`（双进度条玻璃化）、`courses/`、`DurationSelector.tsx`、`PresetCard.tsx`。
- 验证：lint + build + `npm test`。
- commit：`feat: 重构预设与网课页面视觉`

## 阶段 7：全站验收与打磨（子代理）

- 双主题对比度逐项核验、reduced-motion 复核、375/768/1024/1440 响应式复核、视觉一致性走查、修复遗留问题。
- 最终必须全部通过：`npm test`、`npm run test:e2e`、`npm run lint`、`npm run build`、`git diff --check`。
- commit：`fix: 全站视觉验收与一致性打磨`

## 实施规则

- 每个阶段由独立子代理执行，子代理须先读 `前端重设计文档.md` 对应章节再动手；阶段内验证全部通过后才允许 commit，提交消息严格使用上述中文文案。
- 后端 API、数据模型、统计口径、业务逻辑一律不改；仅视觉与呈现层交互可重构。
- 过程中产生的临时可视化验证可通过本地 dev server 截图确认。

## 风险与对策

- backdrop-filter 性能：光斑层用静态渐变+伪元素，限制同屏模糊层数量。
- 深色对比度：朱砂红/松绿在深色底上使用提亮变体并逐一核验。
- e2e 脆弱：视觉类断言改为结构/语义断言，阶段 7 统一修复。
