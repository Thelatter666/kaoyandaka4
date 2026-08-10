# 番茄钟提示音开关 — 设计文档

- 日期：2026-08-10
- 分支：`feat/pomodoro-sound-toggle`
- 规模：中量（客户端 UI + 声音引擎 + 服务端设置持久化 + DB 迁移 + 共享 schema）

## 背景与目标

番茄钟专注/休息自然结束时无任何声音反馈，用户需守在屏幕前才能感知结束。目标：在番茄钟页右上角提供提示音开关，让用户自行决定是否在**自然结束**时听到提示音。

已确认需求约束：

- 按钮位于番茄钟页**页头右上角**（PageShell `actions` 槽）
- 只响**自然结束**：专注倒计时自然结束、休息倒计时自然结束
- **不响**：提前完成（手动点按钮）、手动跳过休息
- 专注结束与休息结束共用**同一个声音**
- 偏好持久化到**服务端按用户存储**（项目已公开部署、多账号，localStorage 跨设备失效）
- 新用户默认**开启**

## 核心假设

- **H1**：用户规模小，`user_settings` 表行数极少（每用户几行），无需缓存、无需索引优化，直接全表范围按 `(user_id, setting_key)` 查询即可。
- **H2**：桌面浏览器（Chrome/Firefox/Safari 桌面）允许已解锁的 `AudioContext` 在后台标签页继续发声——用户切到网课标签页学习时，番茄钟页在后台仍能准时响铃。移动浏览器可能静音后台标签，属可接受降级（本项目为桌面使用场景）。
- **H3**：`client/public/sounds/pomodoro-end.mp3` 是可选文件——用户尚未下载音效；缺失时用 Web Audio 合成音兜底，功能不依赖文件存在。
- **H4**：提示音开关的切换频率极低，PUT 采用乐观更新 + 失败回滚 + toast，无需防抖/节流。

## 显式权衡

| 取舍 | 选择 | 理由 |
|------|------|------|
| 设置存储：键值表 vs `users` 加列 | `user_settings` 键值表 `(user_id, setting_key, setting_value)` | 未来偏好（主题等）零迁移扩展；`users` 加列每新增偏好都要改表。代价：多一张表、值需序列化 |
| 音源：Web Audio 合成 vs 内置 mp3 打包 | 合成音兜底 + `public/sounds/` mp3 自动覆盖 | 零依赖、零版权、功能可立即验收；用户放入 mp3 后自动替换。代价：合成音音色简单 |
| 设置接口：独立 `/settings` vs 挂 `/auth/me` | 独立 `/api/v1/settings` | 避免设置耦合进认证语义；沿用项目"每资源一模块"模式。代价：多一个路由文件 |
| 播放触发：页面监听 vs hook 内播 | 页面监听状态转换后调用 `utils/sound.ts` | hook 不持有副作用（声音），`sound.ts` 单一职责可复用 |

## 边界外声明（本方案不覆盖）

- 不做音量调节（合成音固定音量，mp3 用浏览器默认音量）
- 不做专注/休息两种不同声音（已确认共用一个）
- 不做声音预览按钮（点击开关不试听）
- 不做番茄钟以外的任何提示音
- 每日复盘回顾（另一个需求）不在本设计内，另行设计

## 架构

### 数据层（服务端）

新表 `user_settings`：

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       CHAR(36)     NOT NULL,
  setting_key   VARCHAR(64)  NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, setting_key),
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- 迁移：追加到 `server/src/db/migrate.ts`（沿用既有迁移机制，幂等 `CREATE TABLE IF NOT EXISTS`）
- 首个 setting_key：`pomodoro_sound_enabled`，value `'1'` / `'0'`（字符串）

### API

新路由 `server/src/routes/settings.ts`（自动被 `requireAuth` 保护，挂载于 `server/src/index.ts`）：

- `GET /api/v1/settings` → `200 { pomodoroSoundEnabled: boolean }`；未设置时默认 `true`
- `PUT /api/v1/settings`，body `{ pomodoroSoundEnabled: boolean }` → `200` 返回最新设置；`validate(UpdateSettingsSchema)` 校验

共享 schema：`shared/src/schemas/settings.ts` 新增 `UpdateSettingsSchema` 与 `Settings` 类型。

数据流（按项目既有模式）：`requireAuth` → `validate` → 路由 handler 原生 SQL → `transformSettingsRow()` snake_case→camelCase → 错误走 `AppError` + `errorHandler`。

### 声音引擎（客户端）

新文件 `client/src/utils/sound.ts`（零新依赖）：

- `initSoundOnGesture()`：创建并 `resume()` 共享 `AudioContext` 单例。在「开始专注」按钮点击时调用（`PomodoroPage.handleStartFocus`），满足浏览器自动播放策略——用户手势后解锁音频，之后自然结束才允许出声。
- `playEndSound()`：
  1. 探测 `client/public/sounds/pomodoro-end.mp3`（fetch HEAD，结果缓存于模块级变量，仅探测一次）
  2. 存在 → 用 `HTMLAudioElement` 播放
  3. 不存在 → 用共享 `AudioContext` 合成双音提示音（两个短振荡音符，总长 <1s）
  4. 播放失败（AudioContext 被挂起等）静默忽略，不抛错、不打断页面

新文件 `client/src/workers/end-sound.ts`（响铃 worker，见「播放时机」）：后台标签页准点触发响铃，worker 定时器不受页面后台节流。

### 开关 UI（客户端）

新组件 `client/src/components/ui/SoundToggle.tsx`：

- 图标：开启 `Volume2` / 关闭 `VolumeX`（lucide-react，项目已用）
- framer-motion 图标切换动画；样式 token 化（`var(--color-*)`），co-located `SoundToggle.css`
- `aria-pressed` + `aria-label`（如「提示音已开启/已关闭」），聚焦态符合现有 a11y 模式
- 页面挂载时 `GET /settings` 拉取初始值；点击即时 `PUT /settings` 乐观更新，失败回滚 + `showToast('error', ...)`
- 放置：`PomodoroPage` 的 `<PageShell title="番茄钟" ... actions={<SoundToggle />}>`

### 播放时机（客户端）

### 响铃 worker（解决后台准时响铃，审查发现 H2 缺陷后的修正）

页面 JS 在后台标签页会被节流（rAF 暂停、setInterval 降频、轮询停止），不能依赖页面定时器准点响铃。新增 `client/src/workers/end-sound.ts`（沿用 `countdown-title.ts` worker 模式——worker 定时器不受页面后台节流）：

- 页面启动专注 / 休息时：`worker.postMessage({ type: 'arm', endMs, tag })`
  - tag 专注 = `activeSession.id`；休息 = `'break'`（休息无服务端 id，用 `breakEndsAt` 时间戳辅助校验）
- worker 内部 `setInterval`（250ms 粒度）检查到点 → `postMessage({ type: 'end' })`；收到 `{ type: 'disarm' }` 停止
- 页面收到 `'end'`：校验当前状态匹配（tag 与当前 activeSession.id / breakEndsAt 一致，且无手动结束标记）后才 `playEndSound()`——消除 worker 消息迟到与手动结束的竞态误响
- 手动路径（提前完成 / 取消 / 跳过休息）先 `disarm` 再执行，双保险
- 页面切换路由卸载时 `disarm` + `terminate`

### 专注自然结束

- 响铃主通道：响铃 worker 基于 `plannedEndAt` 准点触发
- 兜底路径：现有 `prevSessionIdRef` + `selfEndedRef` 自然结束检测（页面可见或 worker 未武装时）——检测到自然结束且响铃尚未发生时补响
- 手动结束（提前完成 / 取消）不响铃（已确认），且先 disarm worker

### 休息自然结束（`useFocusSession.ts` + `PomodoroPage.tsx`）

- hook 新增状态 `breakEndMode: 'natural' | null`：
  - breakTimer 归零路径（现有 181-191 行）→ `'natural'`
  - `startBreak` / `completeBreak` → 重置为 `null`（跳过休息不算结束）
- 页面监听 `breakMode` 有→无 转换：`breakEndMode === 'natural'` 时触发响铃校验并重置标记
- 响铃时刻由 worker 基于 `breakEndsAt` 准点触发，页面检测仅作兜底（后台时 worker 先到，页面 setState 不阻塞播放）

## 错误处理

- 设置拉取失败：静默回退默认开启（`pomodoroSoundEnabled = true`），按钮仍可交互
- 设置保存失败：toast 报错 + 状态回滚到服务端确认值
- 声音播放失败：全部静默吞掉（console.debug），绝不抛出到 UI 层

## 测试

- 单元测试（vitest）：`sound.ts` 探测缓存逻辑、`playEndSound` 分支选择可用 mock 测试
- E2E（playwright）：现有 smoke 冒烟保持通过；开关切换后 `PUT /settings` 请求发出（可选，列入 plan 视成本定）

## 术语表

| 术语 | 含义 |
|------|------|
| 提示音开关 | 番茄钟页右上角控制自然结束是否响铃的按钮 |
| 自然结束 | 倒计时走完自动结束（专注/休息），区别于用户手动操作结束 |
| 手动结束 | 用户主动操作（提前完成、跳过休息、取消） |
| 合成音 | Web Audio API 生成的提示音（mp3 缺失时兜底） |
| 用户设置 | `user_settings` 表中按用户存储的偏好键值对 |
| 响铃 worker | `workers/end-sound.ts`，后台标签页准点触发响铃的 Web Worker |

## ADR（对抗性审查结论）

- **ADR-1**：后台响铃依赖响铃 worker 而非页面定时器。审查发现页面 JS 在后台标签页被节流（rAF 暂停 / setInterval 降频 / 轮询停止），依赖页面定时器会迟到数分钟；worker 定时器不受节流。不选 Service Worker + 系统通知：本项目为桌面使用场景，Notification 需额外授权流程，成本大于收益。
- **ADR-2**：播放前用 tag（sessionId / breakEndsAt）二次校验，消除 worker 消息迟到与手动结束的竞态误响。
- **ADR-3**：多标签页并发修改设置采用最后写赢，不做冲突检测——单人使用场景可接受。

## 验证标准

1. 未登录无 `user_settings` 相关 API 访问权限（requireAuth 生效）
2. 新用户默认开启；开启状态下专注/休息自然结束各响一次
3. 提前完成、跳过休息不响
4. 开关关闭后不响；刷新页面后状态保持；换设备登录状态同步
5. 无 mp3 文件时合成音可播放；放入 `public/sounds/pomodoro-end.mp3` 后自动切换
6. 后台标签页（切到网课等其他页面）时自然结束仍准点响铃（桌面 Chrome）
7. 页面无 console error；e2e 冒烟通过
