# Animation Plans — 番茄钟模块

分支 `feat/pomodoro-animations` 的动效改进计划。审计含代码审读 + 浏览器实拍视觉 QA（截图存于临时目录，未入库）。

## 计划一览

| # | 标题 | 严重度 | 状态 | 依赖 |
|---|------|--------|------|------|
| 001 | 钟跨步骤常驻（消除闪断重入）+ 开始点火 | HIGH | TODO | 无 |
| 002 | 首页迷你钟每秒打嗝 → 900ms 连续推进 | MEDIUM | TODO | 无 |
| 003 | Magnetic 停止永续 rAF + 去除双重缓动 | MEDIUM | TODO | 无 |
| 006 | 进行中态圆盘视口截断（视觉 QA 发现） | MEDIUM | TODO | 无 |
| 005 | 补 `--ease-in-out` 令牌 | LOW | TODO | 无 |
| 004 | 低时数字过渡同步 + 紧迫脉动 | LOW | TODO | **005**（引用其令牌） |

## 推荐执行顺序

1. **001**（HIGH，杠杆最大：钟是页面中心元素，闪断每天发生数十次）→ 002 → 003 → 006 → **005 → 004**（004 依赖 005 的 `--ease-in-out`）

## 依赖说明

- 004 的 CSS 引用 `var(--ease-in-out)`，必须先执行 005（两计划各只改 1-2 行，可合并提交）
- 001 与其余计划文件互不重叠（001 改 PomodoroPage.tsx/.css；002/004/005 改 RingCountdown.css；003 改 Magnetic.tsx；006 改 PomodoroPage.css —— 001 与 006 同文件但改不同规则块，执行时注意合并冲突即可）

## 范围外（已知，有意排除）

- `ForestGlasshouse.css` 的 9 处硬编码 `ease-in-out`（森林尘埃长周期环境动效，独立节奏）
- Landing 页对 RingCountdown 的静态视觉复刻（无动效，不受影响）
- 标签页标题倒计时 Worker、页面级 page-enter/page-exit（App 级，另属页面切换体系）
