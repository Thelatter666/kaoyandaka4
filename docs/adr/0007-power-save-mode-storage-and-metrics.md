# 节能模式：状态存 localStorage 并以 DOM 属性为真源

需要一个全局「节能模式」开关，使前端运行时开销（CPU + GPU）较正常模式下降 ≥70%，而布局、配色、内容、功能不变。有三处需要定调：

## 1. 开关状态存在哪

| 路线 | 代价 |
|---|---|
| 服务端 `user_settings`（同 `pomodoroSoundEnabled`） | 启动时需先 `GET /settings` 才知道要不要跑重活 —— **重活已经先跑了一遍**；未登录的落地页拿不到；而模式本身是**设备级**属性（电池 / GPU / 风扇，同一账号在台式机与笔记本上需求相反），跨设备同步反而是错的 |
| **localStorage + `<html data-power-save="on">`** | 无网络往返、首帧即生效（`main.tsx` 模块顶层写入，早于 `createRoot`）；代价是换浏览器/清缓存后需重设 |

决定：**localStorage 持久化，DOM 属性作为唯一真源。** CSS 与 JS 都读同一个属性，因此不可能漂移；不在 React context 里再存一份，避免「两份状态」。跨标签页用 `storage` 事件同步（模式改变运行时行为，不适合各标签页独立）。

## 2. 「降 70%」怎么算

前端开销没有直接的焦耳级读数，必须先定义口径，否则无法验收。

| 候选口径 | 问题 |
|---|---|
| 主线程忙时（CDP `TaskDuration`） | **漏掉最大的一笔**：全屏极光 + 全站玻璃模糊的开销主要在 GPU 进程与合成线程上，主线程几乎是空的 |
| 整机 GPU 占用（`ioreg IOAccelerator`） | 实测有 ~45% 的常量底（显示扫描 + 窗口服务），前端全部静止也降不到 0，用它当门槛会让 70% 在数学上不可达 |
| **CPU：Chromium 进程树 CPU 时间**（`ps`，renderer / gpu-process 分别记账）<br>**GPU：CDP Tracing 的 viz\|cc\|gpu 范畴忙碌时长**（真实合成 / 光栅 / GPU 提交工作） | 两者都可归因到浏览器自身、可重复、可回归；`ioreg` 读数留作「真机 GPU 确实更闲」的旁证，不入公式 |

决定：**门禁分 = 0.3 × CPU 降幅 + 0.7 × GPU 降幅 ≥ 70%**（CPU/GPU 权重由需求方指定），由 `e2e/measure-runtime-cost.mjs` 自动断言，未达标非零退出。

## 3. 动画怎么「关」

| 路线 | 问题 |
|---|---|
| `animation: none` / 全局 `animation-play-state: paused` | 入场动画（`.reveal` 的 `backwards` 填充 + 交错延迟、`page-enter` 从 `opacity: 0` 起）会被冻在起始帧 → **内容永久不可见**；`paused` 与 duration 改动叠加还会重算进度产生跳帧 |
| **`animation-duration: 0.01ms` + `animation-iteration-count: 1`** | 入场动画瞬时落到**终帧**（可见、正确、零残留），常驻无限动画同理结束；代价是切换瞬间环境动效归位到终帧位置（软边渐变位移，一次性） |
| 同时覆写 `transition-duration: 100ms`（照抄 `prefers-reduced-motion` 的写法） | **`transition-property` 初始值是 `all`，只改 duration 等于给所有元素凭空装上过渡**：墨面每 250ms 直写一次 SVG transform 就重启一段 100ms 过渡，于是「全静止」的页面照样每帧产帧、每帧重算样式（实测番茄钟场景因此只剩 41% 降幅） |

决定：**只做 animation 手术，不碰 transition。** 过渡只在交互瞬间发生、不构成常驻开销，保留它反而使交互手感与正常模式完全一致。

## Consequences

- **真源只有一个**：判断当前模式一律读 `<html data-power-save>`（`isPowerSave()`），不要读 localStorage、不要读 React state——CSS 生效的依据就是那个属性。
- **新增常驻动效必须确认在节能模式下静止**（同 `prefers-reduced-motion` 的既成约定）；`e2e/tests/power-save.spec.ts` 会全页扫描「仍在无限循环的 CSS 动画」，转圈白名单（`.btn__spinner` / `.plan-spin` / `.review-spin`）之外出现即测试失败。
- **不得给 `[data-power-save="on"] *` 加 `transition-*` 覆写**，理由见上（这是踩过的坑，不是风格偏好）。
- 加载转圈是豁免项：它是「正在加载」的唯一反馈，且只有单个小元素、成本可忽略——节能模式不该把它冻住。
- 屏保（Screen Wake Lock）**不在本决策范围**：它是能耗策略而非前端渲染开销，节能模式不改变它；若要一起管，另开决策。
