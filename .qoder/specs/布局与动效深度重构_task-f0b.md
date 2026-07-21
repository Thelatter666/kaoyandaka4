# 布局与动效深度重构计划 · Bento 网格 + 页面编排

## 问题诊断（已核实代码）

- **布局**：`PageShell` 只是朴素 max-width 容器；各页为"标题+等大卡片平铺"（如首页 8+4/7+5 均分），无主次层级、无视觉主角、无节奏变化。
- **动效**：hash SPA 直接 `renderPage()` 挂载，无页面过渡；全站仅 hover 上移 1px + 简单淡入；无入场编排、无弹性曲线。

## 设计方向（已确认）

**布局：Bento 主次网格**——每页一个视觉主角（巨卡），卡片大小错落、有主有次。
**动效：页面级编排**——页面切换过渡 + 元素 stagger 入场，Linear/Apple 式编排感。
视觉基因（极光玻璃、色彩、字体、番茄钟/森林核心视觉）全部保留，只重构骨架与动效。业务逻辑、API、数据口径一律不动；动效仅 opacity/transform；reduced-motion 全量降级；不新增依赖（纯 CSS+少量 React 状态机）。

## 阶段 0：设计文档补充（主会话执行）

在 `前端重设计文档.md` 追加「v2 · 布局栅格与动效系统」章节：
- **栅格系统**：`.bento-grid` 12 栏（gap 24/16）、跨度工具类（span 3/4/5/6/7/8/12、row-2）；卡片层级——主角卡（glass-2 + 内嵌光斑 + 28px 圆角 + 32px 内边距）/ 功能卡（glass-1 + 24px）；PageShell v2：容器 1200px、统一页头组件（宋体 30px + 副文案 + 右侧操作槽）、区块节奏 40px。
- **动效系统**：页面过渡（exit 140ms opacity→0/translateY(-6px)，enter 320ms opacity/translateY(10px)→0）；入场 stagger（`--i` 驱动，delay=i×70ms，rise-in 420ms，限前 8 个元素）；弹性曲线 `--ease-spring: cubic-bezier(0.34,1.56,0.64,1)`（刻度珠点亮、徽章、按压回弹）；卡片 hover 升级（上浮+阴影升档+光泽扫过 sheen sweep）；reduced-motion 全停。
- 各页 Bento 构图：首页=专注卡(8)主角+倒计时(4,row2)+任务(8)+预设(12 横条)；统计=森林全景(12)主角+数据卡(4×3)+时间线；番茄钟=圆盘舞台居中+预设底部 dock；计划=任务(8)+复盘侧卡(4) sticky；预设=分组网格+最近使用大卡；网课=6/6、4/4/4、6/6 错落分区。
- commit：`docs: 补充 Bento 栅格与页面动效编排设计`

## 阶段 1：基础设施（子代理）

- tokens.css 增动效令牌（`--ease-spring`、页面过渡时长）；utilities.css 增 `.bento-grid` 及跨度类、`.reveal`/`rise-in` stagger 工具、sheen sweep 工具、`page-enter/page-exit` 类。
- App.tsx 实现页面过渡状态机（保留上一页 140ms 退出后再挂载新页 320ms 进入；reduced-motion 直接切换；key=page+params 保证重挂载）。
- PageShell v2（1200px 容器+页头组件）+ Card 增 `hero` 变体。
- 验证：`npm run lint` + `npm run build` + `npm test` 通过。
- commit：`feat: 重建 Bento 栅格与页面过渡动效基础设施`

## 阶段 2：首页与统计页（子代理）

- 首页：Bento 构图（今日专注卡 span 8 为主角、倒计时卡 span 4 row2 高卡、任务摘要 span 8、预设概览 span 12 横条）；各卡 `.reveal` 依次入场；1366×768 无纵向滚动保持。
- 统计页：森林玻璃花房 span 12 全景主角卡，下接 3 张数据卡（span 4）+ 累计成果 + 时间线；入场编排。
- 验证：lint+build+test。
- commit：`feat: 首页与统计页改为 Bento 主次网格与入场编排`

## 阶段 3：番茄钟与计划页（子代理）

- 番茄钟：圆盘"舞台"化处理（背后聚灯光斑、居中大留白主角位），预设选择区改底部 dock 横排卡；进行中其余内容收进单一侧栏卡；完成/刻度珠点亮用 spring 曲线。
- 计划页：任务列表 span 8 主列 + 每日复盘 span 4 sticky 侧卡；页签/任务项入场 stagger；新建任务行聚焦辉光保留。
- 验证：lint+build+test。
- commit：`feat: 番茄钟与计划页布局重构与编排动效`

## 阶段 4：预设页与网课模块（子代理）

- 预设页：科目分组网格，最近使用预设放大为特色卡；创建入口收进页头操作槽。
- 网课页：7 分区错落构图（6/6、4/4/4、6/6）；课程详情页：信息卡 hero 化+集数列表入场 stagger。
- 验证：lint+build+test。
- commit：`feat: 预设与网课页面 Bento 布局与编排动效`

## 阶段 5：全站验收（子代理）

- 走查各页 Bento 构图一致性与间距节奏；stagger 元素数 ≤8 且无滥用；reduced-motion 下零动画、直接呈现；375/768/1024/1440 无横向滚动；首页 1366×768 无纵向滚动；对比度不因布局调整退化。
- 最终全过：`npm test`、`npm run lint`（0/0）、`npm run build`、`git diff --check`；e2e 目录为空按既有约定记录跳过。
- commit：`fix: 全站布局与动效一致性打磨`

## 实施规则

- 每阶段独立子代理，先读 `前端重设计文档.md` v2 章节再动手；验证全过后才 commit，消息严格用上述中文文案。
- 不改后端、shared/、业务逻辑与统计口径；不新增依赖。
- 验收标准（用户视角）：任意切换页面有过渡感；每页打开时元素有节奏地入场；每页一眼能指出视觉主角；卡片不再等大平铺。

## 风险与对策

- 页面过渡状态机引发闪烁：exit 时长压到 140ms 内且仅 opacity/transform，路由数据预取不变；异常时降级为直接切换。
- Bento 高卡导致首页超高：倒计时高卡内容做紧凑变体，1366×768 实测复核（阶段 2 必做）。
- stagger 延迟叠加过长：限前 8 元素、单项 delay ≤490ms。
