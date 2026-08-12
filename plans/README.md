# Animation Plans — 全库动效计划

审计分支 `docs/animation-audit-plans`（commit c23ba7c）。001-006 为番茄钟模块历史计划（`feat/pomodoro-animations`）；**007-018 为全库核心应用页动效审计产出**（improve-animations 流程：recon → deep audit → vet → 计划；范围排除 landing 介绍页）。

## 计划一览

| # | 标题 | 严重度 | 模块 | 状态 | 依赖 |
|---|------|--------|------|------|------|
| 001 | 钟跨步骤常驻 + 开始点火 | HIGH | 番茄钟 | TODO | 无 |
| 002 | 首页迷你钟 900ms 连续推进 | MEDIUM | 番茄钟 | TODO | 无 |
| 003 | Magnetic 停止永续 rAF | MEDIUM | 番茄钟 | TODO | 无 |
| 004 | 低时数字过渡同步 + 紧迫脉动 | LOW | 番茄钟 | TODO | **005** |
| 005 | 补 `--ease-in-out` 令牌 | LOW | tokens | TODO | 无 |
| 006 | 进行中态圆盘视口截断 | MEDIUM | 番茄钟 | TODO | 无 |
| 007 | 任务完成庆祝动画挂载即播 → 挂载抑制 | HIGH | 计划页任务 | TODO | 无 |
| 008 | Modal 打开补入场动画（开合对称 240ms） | HIGH | ui 组件 | TODO | 无 |
| 009 | GradientCard hover 400ms 弹性 → 240ms ease-out | MEDIUM | ui 组件 | TODO | 无 |
| 010 | 预设页创建胶囊 500ms/scale(0) 修正 | MEDIUM | 预设页 | TODO | 无 |
| 011 | Dropdown 去逐项 stagger + 项目曲线对齐 | MEDIUM | ui 组件 | TODO | 无 |
| 012 | 热力图格子 hover 换令牌 | LOW | 首页 | TODO | 无 |
| 013 | SoundToggle 图标切换压缩至 200ms | LOW | 番茄钟 | TODO | 无 |
| 014 | Magnetic 补 reduced-motion 门控 | LOW | 番茄钟 | TODO | 无 |
| 015 | 删除无人使用的 transition 别名令牌 | LOW | tokens | TODO | 无 |
| 016 | 导入弹窗步骤内容切换淡入 | MEDIUM | 网课 | TODO | 无 |
| 017 | 番茄钟完成视图淡入 | LOW | 番茄钟 | TODO | 无 |
| 018 | 复盘页日期切换详情淡入 | LOW | 复盘页 | TODO | 无 |

## 推荐执行顺序

**第一批（HIGH，体验破损）**：007 → 008
**第二批（MEDIUM，明显违和）**：009 → 010 → 011 → 016
**第三批（LOW，一致性打磨）**：012 → 013 → 014 → 015 → 017 → 018

每批内可按上表顺序；批间建议分批检查效果（工作流要求用户逐批确认）。

## 依赖与冲突

- 004 依赖 005（引用 `--ease-in-out`），其余互不依赖。
- **同文件注意**：003 与 014 都改 `Magnetic.tsx`（一个停 rAF 空转、一个加 reduced-motion——可合并执行，两处改动不重叠）；017 与既有 001/006 都改 `PomodoroPage.css`（不同规则块）；018 触及 `.card` 选择器合并，执行时以 018 的"边界"节为准。
- 007 与 018 都使用 `@starting-style` 模式，互相独立。

## 范围外（已知，有意排除）

- **landing 介绍页全部动效**（framer-motion 10 个 section：Hero/Feature×/Steps/Stats/Screenshots 等）——用户明确排除，另属滚动式介绍页体系
- Card3D / GlowCard（仅 landing 使用）
- 页面级 page-enter/page-exit / reveal / sheen-hover（v2 页面动效编排设计文档 13.x，既定设计）
- aurora 背景漂移、skeleton shimmer、forest 尘埃/天空渐变（环境动效，已带 reduced-motion）
- 番茄钟每秒数字跳字、时长 +5/-5 数字跳变（高频功能数据，Gate 拒绝）
