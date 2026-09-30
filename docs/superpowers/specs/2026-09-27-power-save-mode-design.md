# 节能模式（Power Save Mode）设计

- 日期：2026-09-27
- 分支：`feat/power-save-mode`
- 需求：现有前端性能开销作为「正常模式」保持不变；新增「节能模式」，相对正常模式**只降低前端运行时开销，至少 70%**，页面布局等不变。
- 验收口径（需求方确认）：CPU 30% + GPU 70% 加权；允许在必要时代价是「玻璃模糊降级为实底」。
- 执行方式：单线程一次做完，不派子代理，故**不单独落盘实施计划**（`mywf` 允许单线程省略 plan 文件）。

## 1. 结论（实测）

`e2e/measure-runtime-cost.mjs`（3 轮 × 10s 窗口 × 4 场景 × 2 模式，系统 Chrome headed，真机 GPU）：

| 场景 | CPU 降幅 | GPU 降幅 | 绘制帧数（正常 → 节能） |
|---|---|---|---|
| 首页挂机（专注进行中） | 95.3% | 97.7% | 601 → 10 |
| 番茄钟（墨面推进） | 86.8% | 91.2% | 600 → 50 |
| 统计页（学习森林） | 98.9% | 100.0% | 600 → 0 |
| 介绍页滚动（公开页） | 75.8% | 82.8% | 601 → 85 |
| **加权合计（0.3 / 0.7）** | **89.2%** | **92.9%** | **91.8% ≥ 70% 达标** |

机制：正常模式下页面从未静止（极光持续漂移 → 每个 vsync 都产帧 → 74 处玻璃面逐帧重采样）；冻结常驻动效 + 逐帧 JS 换节拍驱动后，静态页面**不再产出任何帧**（统计页 600 → 0）。

**Level A（冻结常驻动效 + 逐帧循环降频）已达标，`data-flat-glass` 玻璃降级未启用** —— 实测其增量仅 91.8% → 92.7%（+0.9pt），代价是全站观感由磨砂变纯色，不值当；实现保留为属性可开的降级档。完整数据与可信度核对见 `2026-09-27-节能模式实测报告.md`。

## 2. 开销地图（只读勘查结论）

改之前先量清楚钱花在哪（均为 `file:line` 可核）：

| 类别 | 来源 | 处置 |
|---|---|---|
| 常驻全屏合成 | 4 个极光光斑 `36s/48s` 无限漂移，`40~60vmax`（`styles/utilities.css:81,91,101,111`）；其上是全站 74 处玻璃面（glass-1×47 / glass-2×24 / glass-3×3）的 `backdrop-filter` | 冻结 |
| 逐帧 JS | 番茄钟墨面 rAF 每帧直写 3 个 SVG transform（`pages/PomodoroPage.tsx` SmoothRing） | 降频至 4Hz，且**不留挂起 rAF** |
| 常驻 CSS 无限动画 | 墨池波纹 11s/7s（`components/timer/RingCountdown.css:39-40`）、森林尘埃 ×6（`ForestGlasshouse.css:388-428`）、骨架 shimmer、3 个加载转圈 | 冻结（转圈豁免） |
| 高频/装饰 JS | 磁吸 `Magnetic`、完成粒子 `BurstParticles`、路由 140ms 过渡、主题水波 View Transition | 关闭（接入统一降级谓词） |
| framer 滚动视差 | 介绍页 4 个 section 的 `useScroll` → `useTransform` → `style`（`Feature*Section.tsx`、`ScreenshotsSection.tsx`） | 降级（`MotionConfig` + 各 section 手动分支） |
| 功能性开销（**不动**） | 两个 Worker（标题倒计时 1Hz / 准点响铃 4Hz）、`useFocusSession` 的 1Hz 计时与 10s 轮询、1Hz 倒计时读数、虚拟列表 | 保留 |

既有先例：`page-hidden` 在切后台时暂停极光（`App.tsx:185-191` + `utilities.css:131`），证明「冻结常驻动效」这一杠杆在本仓库是安全的。

## 3. 实现

### 3.1 状态管道

| 文件 | 职责 |
|---|---|
| `client/src/utils/powerSave.ts` | 纯函数（`parsePowerSave` / `resolveShouldReduceMotion`）+ DOM 读写（`initPowerSave` / `isPowerSave` / `setPowerSave` / `subscribePowerSave`）。真源 = `<html data-power-save="on">` |
| `client/src/hooks/usePowerSave.ts` | `usePowerSave()`（开关 + 跨标签页同步）、`useShouldReduceMotion()`（系统偏好 OR 节能模式） |
| `client/src/main.tsx` | 模块顶层 `initPowerSave()`：早于 `createRoot` 写入属性，首帧即按模式渲染 |

`useShouldReduceMotion()` **刻意不用** framer 的 `useReducedMotion`：它会经 `App.tsx` 进入首屏图，静态引入 framer 会把 `motion-vendor` 拖进入口 chunk，与 `e2e/check-perf-budget.mjs` 断言 1 冲突。

### 3.2 CSS 层（`client/src/styles/power-save.css`）

1. 全部动画立即完成：`animation-duration: 0.01ms !important` + `animation-iteration-count: 1 !important`（**不动 transition**，理由见 ADR-0007 §3）。
2. 加载转圈豁免：`.btn__spinner` / `.plan-spin` / `.review-spin` 恢复 `0.8s infinite`。
3. 撤掉常驻装饰层的 `will-change`（`.aurora-blob` / `.forest__mote`）：动画静止后它只会白占显存并让四个巨层持续参与合成。
4. Level B（`data-flat-glass`，默认不启用）：`--blur-glass*` 置 0 + 各玻璃面 `backdrop-filter: none` + 不透明实底；组件级玻璃面逐个点名（`.gradient-card__badge`/`.btn--glass`/`.stats-hero .forest`/`.profile-dropdown__menu`/`.dropdown__menu`/`.file-upload-placeholder`/`.modal__scrim`/`.top-nav__powered-off`），Modal 遮罩为此加 `modal__scrim` 类名以便覆盖其 inline 样式。

### 3.3 JS 热点

- **墨面驱动**（`pages/PomodoroPage.tsx`）：节能模式下 `requestAnimationFrame` 循环换成 `setInterval`（250ms）节拍。
  关键不在单帧工作量而在**帧的产生**：只要还有挂起的 rAF，浏览器每个 vsync 都得产出一帧、合成器不进空闲，「什么都没变」也按 60fps 计费。改为定时器节拍后页面在节拍之间完全静止。
  计时精度不受影响（每拍按 `Date.now()` 重算，不累加）；后台标签页下 setInterval 被节流到 ~1Hz，墨面本来看不见，无影响。
- **统一降级谓词接线**（9 个文件）：`Magnetic` / `BurstParticles` / `ThemeToggle`（主题水波会为整屏生成新旧两张快照，是切主题最重的一笔）/ `App.tsx`（跳过 140ms 退场等待）/ `TopNav` / `Dropdown` / `ProfileDropdown` / 6 个介绍页 section。
- **介绍页**：`MotionConfig reducedMotion={shouldReduceMotion ? 'always' : 'user'}`（内层覆盖外层，故必须自己感知节能模式），加上各 section 的手动分支（`style={reducedMotion ? undefined : {...}}`）才能真停视差。

### 3.4 开关 UI

`components/ui/PowerSaveToggle.tsx`（lucide `Leaf`，44px 玻璃圆钮，与 `ThemeToggle` 同造型，`aria-pressed` 双通道），落在 `.top-nav__actions` 最左，兼作常驻状态指示（开启时主色高亮）。

**顶栏让宽**：实测 `.top-nav` 内容在 960px 胶囊内原有 **1px** 余量（`max-width: 960px`，左内边距 16px / 右 8px，7 个带文字导航项）。新按钮占 48px，会把内容顶出右内边距 5.1px，故收窄两处间距：`.top-nav` 的 `gap` 8px → 6px、`.top-nav__links` 的 `gap` 4px → 3px，共让出 10px，恢复到 1px 余量、无溢出（实测见 §6）。这是**一次性布局微调，不是模式差异**——两种模式下顶栏完全一致。

## 4. 度量方法（`e2e/measure-runtime-cost.mjs`）

- **口径**：CPU = Chromium 进程树 CPU 时间增量（`ps`，renderer / gpu-process 分别记账）；GPU = CDP Tracing 的 `viz|cc|gpu` 范畴事件忙碌时长合计（含 `Display::DrawAndSwap` / `DirectRenderer::DrawFrame` / `SkiaOutputSurfaceImplOnGpu::*`）。
- **门禁**：`0.3 × CPU 降幅 + 0.7 × GPU 降幅 ≥ 70%`，未达标非零退出（同 `check-perf-budget.mjs` 的闸门范式）。
- **旁证（不入公式）**：`ioreg IOAccelerator` 的 Device Utilization %、CDP `Performance.getMetrics`（TaskDuration / ScriptDuration / LayoutDuration / RecalcStyleDuration / LayoutCount / RecalcStyleCount）、绘制帧数。
- **协议**：系统 Chrome **headed（真机 GPU）**；每场景每模式 3 轮取中位数；状态稳定后再测，窗口前 1s 预热丢弃；进入应用走本地模式（离线、无需数据库与会话）；窗口内只保留当前场景的页面（后台标签仍会驱动合成，混测会污染读数）。
- **场景**：首页挂机（专注进行中）/ 番茄钟（墨面推进）/ 统计页（96 棵树 + 尘埃 + 大幅玻璃）/ 介绍页滚动（framer 视差）。

**已知边界（写进报告，不粉饰）**：
- 不是焦耳级能耗测量，是 CPU/GPU 忙碌时间的代理指标；
- 真机 GPU 占用（ioreg）含与前端无关的常量底（显示扫描 ~45%），故只作旁证；
- `--headless` 走软件合成，绝对值与真机不同，仅用于无显示环境对比。

## 5. 未采纳方案

| 方案 | 否决理由 |
|---|---|
| 服务端 `user_settings` 存模式 | 启动需先拉取，重活会先跑一遍才关掉；未登录落地页拿不到；设备级属性不该跨设备同步（ADR-0007 §1） |
| 主线程忙时（`TaskDuration`）当 CPU/GPU 口径 | 漏掉最大一笔：极光 + 玻璃模糊的开销在 GPU 进程与合成线程，主线程几乎空闲 |
| ioreg 整机 GPU 占用入门禁公式 | ~45% 常量底，前端全静止也降不到 0，70% 在数学上不可达 |
| `animation: none` 或全局 `animation-play-state: paused` | 入场动画被冻在起始帧 → 内容永久不可见（`.reveal` 是 `backwards` 填充 + 交错延迟；`page-enter` 从 `opacity:0` 起） |
| 同时覆写 `transition-duration: 100ms`（照抄 reduced-motion 写法） | `transition-property` 初始值 `all` → 凭空给所有元素装过渡：墨面每次直写 transform 都重启 100ms 过渡，页面照旧每帧产帧（实测番茄钟场景因此从 89% 掉到 41%） |
| 在 App 根部包 `MotionConfig` | `MotionConfig` 来自 framer-motion，静态引入会把 `motion-vendor` 拖进首屏图，破坏首屏预算红线 |
| `MotionGlobalConfig.skipAnimations` 全局开关 | 需为一处开关动态引入整个 motion-vendor（为一个省电功能先下载 30KB 并解析，得不偿失）；且实测应用内 framer 动画均为交互触发、无稳态开销 |
| `data-flat-glass` 默认启用（Level B） | 实测其增量收益极小（静态页 45.8% → 44.0%，滚动页更少），不值当让全站玻璃观感变化；实现保留为可复测的诊断开关 |
| 节能模式一并关掉屏幕常亮（Wake Lock） | 那是能耗策略而非前端渲染开销；需求原话是「仅降低前端性能开销」，故不动（ADR-0007 Consequences） |

## 6. 实测数据

见 `2026-09-27-节能模式实测报告.md`（同目录外的仓库根，含逐场景逐指标表、顶栏宽度实测、噪声核对与复现命令）。

## 7. 回归与守门

| 手段 | 覆盖 |
|---|---|
| `client/src/utils/powerSave.test.ts` | 纯函数真值表（存储值解析、降级谓词并集） |
| `e2e/tests/power-save.spec.ts` | 首帧即带属性；**全页扫描「仍在无限循环的 CSS 动画」**（转圈白名单除外，能自动抓住将来新增的常驻动效）；**布局逐元素比对**（关键选择器盒模型容差 0.5px）；顶栏按钮双向可用；节能模式下倒计时照走、墨面照推进；无 console error |
| `e2e/measure-runtime-cost.mjs` | 运行时开销门禁（≥70% 才通过） |
| `e2e/check-perf-budget.mjs` | 首屏 JS ≤200KB 不受影响（本改动不加依赖、不进入口图） |

`AGENT.md` 增补红线：**新增常驻动效必须确认在节能模式下静止**（同 `prefers-reduced-motion` 的既成约定）；**不得给 `[data-power-save="on"] *` 加 `transition-*` 覆写**。
