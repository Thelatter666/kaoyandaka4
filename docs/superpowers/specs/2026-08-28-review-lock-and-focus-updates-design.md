# 复盘二重密码 + 专注暂停等四项增强 — 设计文档

> 日期:2026-08-28 · 分支 `feat/review-lock-and-focus-updates` · 状态:设计已获用户批准
> 需求原文(4 项):① 复盘二重密码(每次启动输一次)② 继续专注恢复上次预设 ③ 专注期间暂停(每次≤5 分钟)④ 休息结束提示音

## 核心假设

- **A1**「每次启动系统」= 浏览器标签页会话:解锁标记存 `sessionStorage`,关闭标签页/重启浏览器后需重输;同会话内刷新页面不重输。用户已确认此口径。
- **A2** 复盘门禁是会话/UI 层防护:复盘内容本身不加密,持有有效会话的客户端仍可通过 API 直读 `GET /reviews`。威胁模型 = 防他人随手打开页面翻看,不防技术性绕过(个人站,单用户)。
- **A3** 暂停期间学习时钟停走:服务端以「顺延 `planned_end_at` + 累计 `paused_total_seconds` 扣除」保证学习时长统计准确;统计端点全部读 `study_records.actual_duration_seconds`(已核实 `statistics.ts`),因此只要 complete 写记录时扣除,统计零改动。
- **A4** 暂停超时(5 分钟)的自动恢复是**惰性**的:由读路径(`GET /active`)触发就地 resume,与现有「过期自动完成惰性触发」模式同构;不引入服务端定时器。

## 显式权衡

- **W1** 密码哈希存 `user_settings` 键值(键 `review_lock_hash`)而非 users 表加列——牺牲「密码属于账号本体」的正统性,换零表结构迁移 + 本地模式(IndexedDB settings)完全同构的对称代码。用户已确认。
- **W2** 暂停用加列(`paused_at` + `paused_total_seconds`)而非 status ENUM 加 `'paused'`——牺牲状态机语义整洁,保全库既有 `status='in_progress'` 判断/乐观锁零波及。用户已确认。
- **W3** 本地模式密码验证用 Web Crypto SHA-256+salt 而非 bcrypt——牺牲本地哈希强度,换不把 bcrypt 引入 client bundle;本地数据本就在同一浏览器内,威胁模型等价。
- **W4** 暂停中允许「取消」、禁止「提前完成」——换取 complete 乐观锁单条件(`AND paused_at IS NULL`)与一条时间公式;UX 代价:暂停中想收工需先点「继续专注」。cancel 的 SQL(`status='in_progress'`)天然涵盖暂停中会话,零改动。
- **W5** 后台标签页暂停到点不响铃、恢复可能延迟——回前台时由 `getActive` 惰性链立即校准;不做暂停恢复提示音(YAGNI)。

## 边界外声明

- 不做二重密码找回/重置流程(忘密码 = 手动清 `user_settings` 的 `review_lock_hash` 键)
- 不做输错密码次数锁定(`verifyLimiter` 限流已防爆破)
- 不做复盘内容加密存储
- 不做暂停次数限制(用户确认:不限次数,每次上限 5 分钟)
- 不做暂停恢复提示音

---

## 1. 复盘二重密码

### 服务端

新路由 `server/src/routes/reviewLock.ts`,挂载于 `index.ts`:`app.use('/api/v1/review-lock', requireAuth, router)`(挂载层鉴权,不仿 import 例外)。

| 端点 | 语义 |
|---|---|
| `GET /` | `{ hasLock: boolean }` — 查 `user_settings` 是否存在 `review_lock_hash` |
| `POST /` | 设置/修改。body `{ currentPassword?, newPassword }`;`hasLock` 为真时 `currentPassword` 必填且 bcrypt.compare 通过,否则 401(`LOCK_PASSWORD_MISMATCH`);成功 upsert 键值,200 |
| `POST /verify` | body `{ password }`;bcrypt.compare 通过 204,否则 401(同错误码);无锁时 400 |

- `verifyLimiter` 就地声明(参照 `auth.ts` 的 `loginLimiter`:窗口内限次数,防爆破)
- 哈希:bcrypt,代价因子复用 `auth.ts` 的 `BCRYPT_COST`
- Zod(`shared/src/schemas/review.ts`):`SetReviewLockSchema`(`currentPassword?`、`newPassword` 4–64 字符)、`VerifyReviewLockSchema`(`password` 4–64)
- 错误走既有 `AppError` → `errorHandler`

### 前端

- `App.tsx` `case '/review'` → 渲染 `ReviewGate`(新组件,`client/src/components/review/ReviewGate.tsx`),内部三态:
  1. `hasLock === false` → 引导设置页(新密码 + 确认,两次一致才可提交;成功即解锁本会话)
  2. `hasLock && !unlocked` → 验证页(密码输入,`POST /verify`;401 显示错误)
  3. `unlocked` → `<ReviewPage />`
- 解锁标记:`sessionStorage` key `kaoyandaily_review_unlocked`,值为当前身份 id(server 模式 = user_id,本地模式 = accountId);读取时校验与当前身份匹配,否则视为未解锁(换账号自动失效)
- 修改入口:`ProfileDropdown` 加「复盘密码…」菜单项 → Modal(`POST /`,带 currentPassword)
- API 封装:`client/src/api/reviews.ts` 增加 `reviewLockApi`(get/set/verify,内含 `isLocalMode()` 分支)

### 本地模式

- `localStore.settings` 存 hash,键同 `review_lock_hash`;本地验证 `sha256Hex(salt + password)` 与存储值比对(salt 随机生成,与 hash 同键拼接存储,格式 `salt:hash`)
- 三态逻辑在 `ReviewGate` 内按模式调不同 API,组件零分支感知

## 2. 专注暂停

### 数据模型迁移

`focus_sessions` 加两列(新库 `schema.sql` 同步 + `migrate.ts` 幂等 ALTER):

```sql
paused_at              DATETIME NULL,          -- 非空 = 暂停中
paused_total_seconds   INT NOT NULL DEFAULT 0  -- 累计暂停秒数(complete 时扣除)
```

### 服务端端点语义(`routes/focus.ts`)

| 端点 | 行为 |
|---|---|
| `POST /:id/pause` | `WHERE status='in_progress' AND paused_at IS NULL`,写 `paused_at = NOW()`;命中 0 行 → 409「当前不可暂停」;204 |
| `POST /:id/resume` | `WHERE status='in_progress' AND paused_at IS NOT NULL`;`planned_end_at = planned_end_at + (NOW - paused_at)`、`paused_total_seconds += 该秒数`、`paused_at = NULL`;命中 0 行 → 409;204 |
| `POST /:id/complete` | 乐观锁条件追加 `AND paused_at IS NULL`(暂停中 → 409「请先继续专注」);`actual = (completed_at - started_at) - paused_total_seconds` |
| `POST /:id/cancel` | **零改动**(暂停中 status 仍为 in_progress,天然可取消) |
| `GET /active` | 惰性恢复链:① `paused_at` 非空且 `NOW - paused_at ≥ FOCUS_PAUSE_MAX_SECONDS` → 就地执行 resume 顺延;② resume 后或本就未暂停 → 走既有过期自动完成/返回逻辑;③ `paused_at` 仍非空(未到 5 分钟)→ 返回会话,附 `pausedAt`、`pausedTotalSeconds`,**不做过期自动完成** |

- `transformSession` 增加 `pausedAt`(`string | null`)与 `pausedTotalSeconds`(`number`)
- `shared/src/constants.ts`:`FOCUS_PAUSE_MAX_SECONDS = 300`
- 暂停剩余秒数由前端按 `pausedAt + 300s` 计算,服务端不重复下发

### 前端(`useFocusSession` + `PomodoroPage`)

- `useFocusSession`:新增 `pauseFocus()` / `resumeFocus()`;`ActiveSession` 类型扩展 `pausedAt`/`pausedTotalSeconds`;轮询恢复会话时自然带回暂停态
- PomodoroPage:
  - active ops 加「暂停」按钮(进行中、未暂停时显示)
  - 暂停态 UI:砚池冻结(`endsAtMs → null` + 会话剩余快照作 `fallbackRemainingSeconds`,`SmoothRing` 零改动);暂停倒计时 5:00 递减(interval 秒级,到点自动 `resumeFocus`);主按钮「继续专注」,副按钮「取消专注」;「提前完成」隐藏
  - 恢复后 `endsAtMs` 回到顺延后的 `plannedEndAt`,rAF 平滑继续;响铃 worker 按新结束时间重新武装
- 本地模式:`localStore.focus` 同构 pause/resume/getActive 惰性链(纯 IndexedDB 时间计算,`localStore.test.ts` 扩展覆盖)

### 统计口径

complete 写 `study_records` 时 `actual_duration_seconds` 已扣除累计暂停;`statistics.ts` 全部读 `study_records.actual_duration_seconds`(已核实),零改动。

## 3. 继续专注恢复上次预设

- `PomodoroPage.handleContinue` 不再 `setSelectedPreset(null)`:预设与 `durationMinutes` 本就存活至完成态,直接保留 → 砚池空池预览与控制卡显示上次预设
- 刷新恢复路径(会话恢复):`useEffect([activeSession, presets])` 按 `presetNameSnapshot` 匹配 presets 列表设置 `selectedPreset`;匹配不到(预设已删/漫游)→ `null`,维持现状漫游
- 行为不变项:「取消」「不休息」「短/长休息」入口仍清空选中

## 4. 休息结束提示音 + 响铃开关修复

- `client/src/utils/sound.ts`:
  - `playEndSound(kind: 'focus' | 'break' = 'focus')`;休息结束播放轻快合成变体(上行双音 D6→A6,区别于专注钟声 A5→D6);可选 `client/public/sounds/break-end.mp3`,同 HEAD + Content-Type 探测模式
  - 模块级门控:`setSoundEnabled(enabled: boolean)`;关闭时所有播放直接返回
- `SoundToggle`:拉取成功与点击切换后调 `setSoundEnabled`(修复现状「设置存取齐全但从未被消费」的 bug;拉取失败默认开启,与后端默认一致)
- `PomodoroPage` 三处响铃调用:worker `onmessage` 与两处兜底按 tag 前缀 `break:` 选 kind;`end-sound.ts` worker 协议零改动

## 错误处理

- 服务端全部走 `AppError(status, code, message)` → `errorHandler`,错误码新增:`LOCK_PASSWORD_MISMATCH`(401,设置时旧密码不符与验证失败共用)、暂停相关复用 `CONFLICT`(409)
- 前端:验证失败行内错误提示;暂停/恢复失败 toast + 状态回滚(乐观更新模式,参照 SoundToggle)

## 测试

| 层 | 内容 |
|---|---|
| 纯函数单测 | 暂停剩余/顺延秒数计算抽纯函数(如 `focusTime.ts`);本地模式 hash 工具 |
| localStore 单测 | pause/resume/getActive 惰性链、complete 扣除暂停(fake-indexeddb,扩展 `localStore.test.ts`) |
| Zod schema 测试 | 新增 `SetReviewLockSchema`/`VerifyReviewLockSchema` 边界(长度/可选性) |
| 路由层 | focus/reviewLock 无 DB 测试基建(与全库现状一致),以手动验收 + `e2e` 冒烟回归 |
| 手动验收 | 四项需求逐条 + 双模式(服务器/本地)+ reduced-motion 回归 |

## 候选术语表(阶段二 domain-modeling 定稿)

| 术语 | 暂定含义 |
|---|---|
| 复盘锁 Review Lock | 进入复盘页的二重密码机制,含设置与验证 |
| 解锁会话 Unlock Session | 一次「启动系统」内验证通过后的免输状态(sessionStorage) |
| 暂停 Pause | 专注会话的临时挂起,学习时钟停走,每次上限 5 分钟 |
| 暂停总量 Paused Total | 会话累计暂停秒数,完成时从实际时长中扣除 |
| 休息提示音 Break Chime | 休息结束的独立提示音,与专注结束钟声区分 |
