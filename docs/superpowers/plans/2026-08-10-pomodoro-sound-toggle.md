# 番茄钟提示音开关 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在番茄钟页头右上角提供提示音开关，自然结束（专注/休息）时按用户偏好响铃，后台标签页也准点响。

**Architecture:** 服务端 `user_settings` 键值表 + `GET/PUT /api/v1/settings`（requireAuth 保护）持久化偏好；客户端 `utils/sound.ts`（合成音兜底 + mp3 可替换 + 手势解锁）负责出声；`workers/end-sound.ts` 在后台标签页准点触发；`SoundToggle.tsx` 放番茄钟页 PageShell actions 槽。

**Tech Stack:** Express 4 + mysql2/promise（原生 SQL）、React 18 + Vite 6 + framer-motion、Zod 共享 schema、Vitest（首个单元测试）。

**Spec:** `docs/superpowers/specs/2026-08-10-pomodoro-sound-toggle-design.md`

## Global Constraints

- 零新 npm 依赖（Web Audio API / Web Worker 均为平台能力）
- 所有 UI 颜色/间距必须用 `var(--color-*)`、`var(--space-*)` token，禁止硬编码
- 新组件 co-located CSS；动画统一 framer-motion；业务逻辑注释用中文
- 服务端所有查询按 `user_id` 隔离；`user_id` 永不从客户端接收
- 错误形状 `{ error: { code, message, details } }`，路由错误 `throw new AppError(...)`
- 声音播放失败一律静默（console.debug），绝不抛出到 UI
- 响铃只在「自然结束」发生：提前完成、取消、跳过休息均不响
- **commit 仅当用户显式下达指令**：每个任务完成后停下汇报，等用户检查 + 提交指令，不自动 commit

---

### Task 1: DB — user_settings 表

**Files:**
- Modify: `server/src/db/schema.sql`（末尾追加建表）
- Modify: `server/src/db/migrate.ts`（`migrateUsers` 内追加幂等建表）

**Interfaces:**
- Consumes: 无
- Produces: `user_settings` 表（`(user_id, setting_key)` 联合主键），Task 3 查询/写入

- [ ] **Step 1: schema.sql 追加表定义**

在 `server/src/db/schema.sql` 末尾追加：

```sql
-- 9. user_settings（用户设置键值）
-- ============================================================
-- 按用户存储偏好：setting_key 为常量名（如 'pomodoro_sound_enabled'），
-- setting_value 为字符串化值（'1' / '0'）。联合主键保证每用户每键仅一行。
CREATE TABLE IF NOT EXISTS user_settings (
    user_id       CHAR(36)     NOT NULL,
    setting_key   VARCHAR(64)  NOT NULL,
    setting_value VARCHAR(255) NOT NULL,

    PRIMARY KEY (user_id, setting_key),
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: migrate.ts 追加幂等建表**

在 `server/src/db/migrate.ts` 的 `migrateUsers` 函数体开头（`// 1. users 表` 之前）插入：

```ts
  // 0. user_settings 表（设置键值，CREATE TABLE IF NOT EXISTS 本身幂等）
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id       CHAR(36)     NOT NULL,
        setting_key   VARCHAR(64)  NOT NULL,
        setting_value VARCHAR(255) NOT NULL,
        PRIMARY KEY (user_id, setting_key),
        CONSTRAINT fk_settings_user FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('  [user_settings] table ready');
```

- [ ] **Step 3: 运行迁移验证**

Run: `npm run db:migrate`（根目录；本地需 MySQL 运行且 `.env` 正确）
Expected: 输出包含 `[user_settings] table ready` 且 `Users migration completed successfully!`；再次运行不报错（幂等）。

- [ ] **Step 4: 汇报，等待提交指令**（不 commit，停下等用户）

---

### Task 2: 共享 Zod schema

**Files:**
- Create: `shared/src/schemas/settings.ts`
- Modify: `shared/src/types/index.ts`

**Interfaces:**
- Consumes: 无
- Produces: `UpdateSettingsSchema`（Zod）、`UpdateSettingsInput` 类型 → Task 3 校验、Task 4 客户端入参

- [ ] **Step 1: 创建 schema 文件**

`shared/src/schemas/settings.ts`：

```ts
import { z } from 'zod';

export const UpdateSettingsSchema = z.object({
  pomodoroSoundEnabled: z.boolean(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
```

- [ ] **Step 2: types/index.ts re-export**

`shared/src/types/index.ts` 末尾追加：

```ts
export type { UpdateSettingsInput } from '../schemas/settings.js';
```

- [ ] **Step 3: 验证类型**

Run: `npx tsc --noEmit -p shared/tsconfig.json 2>/dev/null || cd server && npx tsc --noEmit`
Expected: 无类型错误（shared 目录可能无独立 tsconfig，改跑 server 全量 tsc --noEmit）

- [ ] **Step 4: 汇报，等待提交指令**

---

### Task 3: 服务端 API — /api/v1/settings

**Files:**
- Create: `server/src/routes/settings.ts`
- Modify: `server/src/index.ts`（挂载路由）

**Interfaces:**
- Consumes: Task 1 的 `user_settings` 表、Task 2 的 `UpdateSettingsSchema`
- Produces: `GET /api/v1/settings` → `{ pomodoroSoundEnabled: boolean }`（缺省 true）；`PUT /api/v1/settings` body `{ pomodoroSoundEnabled }` → 返回最新设置

- [ ] **Step 1: 创建路由文件**

`server/src/routes/settings.ts`：

```ts
import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { UpdateSettingsSchema } from '../../../shared/src/schemas/settings.js';
import pool from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string;
}

const SOUND_KEY = 'pomodoro_sound_enabled';

function transformSettings(rows: SettingRow[]): { pomodoroSoundEnabled: boolean } {
  const row = rows.find((r) => r.setting_key === SOUND_KEY);
  // 未设置过偏好 → 默认开启
  return { pomodoroSoundEnabled: row ? row.setting_value === '1' : true };
}

// GET /api/v1/settings — 当前用户全部设置（目前仅 pomodoroSoundEnabled）
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
      [req.userId]
    );
    res.json(transformSettings(rows));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/settings — 更新设置（键值 upsert，部分更新：只改传入的键）
router.put('/', validate(UpdateSettingsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pomodoroSoundEnabled } = req.body;
    await pool.query<ResultSetHeader>(
      'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [req.userId, SOUND_KEY, pomodoroSoundEnabled ? '1' : '0']
    );
    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
      [req.userId]
    );
    res.json(transformSettings(rows));
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: 挂载路由**

`server/src/index.ts`：加 import（与既有路由 import 并列）：

```ts
import settingsRouter from './routes/settings.js';
```

挂载（加在 statisticsRouter 之后）：

```ts
app.use('/api/v1/settings', requireAuth, settingsRouter);
```

启动日志的 API 列表追加一行：`console.log('  /api/v1/settings');`

- [ ] **Step 3: curl 验证**

Run（另开终端 `npm run dev:server`）：

```bash
# 注册测试账号（已有则跳过）
curl -s -c /tmp/kyc.txt -X POST http://localhost:3001/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"sound-test@example.com","password":"password123"}'
# 未登录访问 → 401
curl -s http://localhost:3001/api/v1/settings
# 已登录 GET → 默认 true
curl -s -b /tmp/kyc.txt http://localhost:3001/api/v1/settings
# PUT false → 返回 false
curl -s -b /tmp/kyc.txt -X PUT http://localhost:3001/api/v1/settings -H 'Content-Type: application/json' -d '{"pomodoroSoundEnabled":false}'
# PUT 非法 body → 400 VALIDATION_ERROR
curl -s -b /tmp/kyc.txt -X PUT http://localhost:3001/api/v1/settings -H 'Content-Type: application/json' -d '{"pomodoroSoundEnabled":"yes"}'
```

Expected: 401 → `{"error":{"code":"UNAUTHORIZED",...}}`；GET → `{"pomodoroSoundEnabled":true}`；PUT false → `{"pomodoroSoundEnabled":false}`；非法 body → `{"error":{"code":"VALIDATION_ERROR",...}}`

- [ ] **Step 4: 汇报，等待提交指令**

---

### Task 4: 客户端 API 模块

**Files:**
- Create: `client/src/api/settings.ts`

**Interfaces:**
- Consumes: `api` from `./client`、`UpdateSettingsInput` from `@shared/types`
- Produces: `settingsApi.get() / settingsApi.update()` → Task 8（SoundToggle）使用

- [ ] **Step 1: 创建模块**

`client/src/api/settings.ts`：

```ts
import { api } from './client';
import type { UpdateSettingsInput } from '@shared/types';

export interface Settings {
  pomodoroSoundEnabled: boolean;
}

export const settingsApi = {
  get: () => api.get<Settings>('/settings'),

  update: (data: UpdateSettingsInput) => api.put<Settings>('/settings', data),
};
```

- [ ] **Step 2: 类型验证**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 汇报，等待提交指令**

---

### Task 5: 声音引擎 sound.ts（TDD，首个单元测试）

**Files:**
- Create: `client/src/utils/sound.ts`
- Create: `client/src/utils/sound.test.ts`

**Interfaces:**
- Consumes: 平台能力（`globalThis.AudioContext` / `globalThis.Audio` / `fetch`）
- Produces:
  - `initSoundOnGesture(): void` — 创建并 resume 共享 AudioContext 单例（用户手势时调用）
  - `playEndSound(): Promise<void>` — mp3 可用则 `Audio` 播放，否则合成音；失败静默

- [ ] **Step 1: 写失败测试**

`client/src/utils/sound.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

class MockOscillator {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn(() => ({ connect: vi.fn() }));
  start = vi.fn();
  stop = vi.fn();
}

class MockGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn(() => ({ connect: vi.fn() }));
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = vi.fn(() => new MockOscillator());
  createGain = vi.fn(() => new MockGain());
  resume = vi.fn(() => Promise.resolve());
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('AudioContext', MockAudioContext);
});

describe('sound utils', () => {
  it('mp3 存在时用 Audio 播放，且探测只请求一次', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const audioMock = { play: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', vi.fn(() => audioMock));

    const { playEndSound } = await import('./sound');
    await playEndSound();
    await playEndSound();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(audioMock.play).toHaveBeenCalledTimes(2);
  });

  it('mp3 404 时走合成音（创建 AudioContext，不创建 Audio）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    const AudioCtor = vi.fn();
    vi.stubGlobal('Audio', AudioCtor);

    const { playEndSound } = await import('./sound');
    await playEndSound();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(AudioCtor).not.toHaveBeenCalled();
  });

  it('Audio.play 失败时静默不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal('Audio', vi.fn(() => ({ play: vi.fn().mockRejectedValue(new Error('blocked')) })));

    const { playEndSound } = await import('./sound');
    await expect(playEndSound()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run client/src/utils/sound.test.ts`
Expected: FAIL（`./sound` 模块不存在 / 无导出）

- [ ] **Step 3: 实现 sound.ts**

`client/src/utils/sound.ts`：

```ts
/**
 * 提示音引擎：合成音兜底 + 可替换 mp3 + 用户手势解锁
 *
 * - 浏览器自动播放策略：AudioContext 必须经用户手势（如点击「开始专注」）
 *   后创建/resume，否则后续自然结束时的播放会被拦截。
 * - mp3 文件（client/public/sounds/pomodoro-end.mp3）可选：存在则优先用
 *   Audio 播放（fetch HEAD 探测一次并缓存结果），缺失则用 Web Audio 合成
 *   双音提示音兜底，功能不依赖文件存在。
 * - 全部失败路径静默（console.debug），绝不抛出到 UI 层。
 */
let audioCtx: AudioContext | null = null;
let mp3Available: boolean | null = null;

const MP3_URL = '/sounds/pomodoro-end.mp3';

function getAudioContext(): AudioContext | null {
  const Ctor =
    (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function initSoundOnGesture(): void {
  try {
    if (!audioCtx) {
      audioCtx = getAudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  } catch (err) {
    console.debug('initSoundOnGesture failed', err);
  }
}

async function detectMp3(): Promise<boolean> {
  if (mp3Available !== null) return mp3Available;
  try {
    const res = await fetch(MP3_URL, { method: 'HEAD' });
    mp3Available = res.ok;
  } catch {
    mp3Available = false;
  }
  return mp3Available;
}

/** 合成双音提示音（A5 → D6，总长 <0.6s）：mp3 缺失时的兜底音源 */
function playSynthesized(): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = [880, 1174.66];
  for (const [i, freq] of notes.entries()) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.18;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

export async function playEndSound(): Promise<void> {
  try {
    initSoundOnGesture();
    const useMp3 = await detectMp3();
    if (useMp3) {
      const AudioCtor = (globalThis as unknown as { Audio?: typeof Audio }).Audio;
      if (AudioCtor) {
        await new AudioCtor(MP3_URL).play();
        return;
      }
    }
    playSynthesized();
  } catch (err) {
    // 播放被拦截/失败：静默降级，不打扰用户
    console.debug('playEndSound failed', err);
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run client/src/utils/sound.test.ts`
Expected: PASS（3 个测试）

- [ ] **Step 5: 汇报，等待提交指令**

---

### Task 6: 响铃 worker

**Files:**
- Create: `client/src/workers/end-sound.ts`

**Interfaces:**
- Consumes: 主线程消息 `{ type: 'arm', endMs: number, tag: string }` / `{ type: 'disarm' }`
- Produces: 到点回传 `{ type: 'end', tag: string }`（tag 原样带回，主线程据此校验）

- [ ] **Step 1: 创建 worker**

`client/src/workers/end-sound.ts`：

```ts
/// <reference lib="webworker" />
/**
 * end-sound worker — 后台标签页准点触发响铃
 *
 * 页面主线程在后台标签页会被节流（rAF 暂停、setInterval 降频、轮询停止），
 * 无法依赖其定时器准点响铃；Worker 定时器不受可见性节流。
 *
 * 协议：
 *   主线程 → { type: 'arm', endMs, tag }  武装（tag 为专注 sessionId 或 `break:${endMs}`）
 *   主线程 → { type: 'disarm' }           解除（手动结束/路由离开时）
 *   worker → { type: 'end', tag }         到点触发（tag 原样带回，主线程校验后播放）
 */
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let timer: ReturnType<typeof setInterval> | null = null;
let endMs = 0;
let armedTag: string | null = null;

ctx.onmessage = (e: MessageEvent<{ type: 'arm'; endMs: number; tag: string } | { type: 'disarm' }>) => {
  const msg = e.data;
  if (msg.type === 'disarm') {
    if (timer) clearInterval(timer);
    timer = null;
    armedTag = null;
    return;
  }
  if (timer) clearInterval(timer);
  endMs = msg.endMs;
  armedTag = msg.tag;
  timer = setInterval(() => {
    if (Date.now() < endMs) return;
    if (timer) clearInterval(timer);
    timer = null;
    const tag = armedTag;
    armedTag = null;
    ctx.postMessage({ type: 'end', tag });
  }, 250);
};
```

- [ ] **Step 2: 类型验证**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 汇报，等待提交指令**

---

### Task 7: useFocusSession 增加 breakEndMode

**Files:**
- Modify: `client/src/hooks/useFocusSession.ts`

**Interfaces:**
- Consumes: 无
- Produces: `breakEndMode: 'natural' | null`（timer 归零 → 'natural'；startBreak/completeBreak → null）→ Task 9 兜底播放判定

- [ ] **Step 1: 增加状态与返回**

`useFocusSession.ts` 改动（4 处）：

状态声明（`breakEndsAt` state 之后）：

```ts
  /** 休息是否自然结束（timer 归零）；手动开始/跳过时清空，供页面兜底响铃判定 */
  const [breakEndMode, setBreakEndMode] = useState<'natural' | null>(null);
```

`startBreak` 内 `setBreakEndsAt(...)` 之前：

```ts
    setBreakEndMode(null);
```

`completeBreak` 内（`clearBreakTimer();` 之后）：

```ts
    setBreakEndMode(null);
```

breakTimer 归零分支（现有 `setBreakMode(null); setBreakEndsAt(null);` 处，return 0 之前）：

```ts
          setBreakEndMode('natural');
```

返回对象追加（`breakEndsAt` 之后）：

```ts
    breakEndMode,
```

并在 `UseFocusSessionReturn` 接口中声明：

```ts
  /** 休息是否自然结束（timer 归零）；null 表示未结束或手动结束 */
  breakEndMode: 'natural' | null;
```

- [ ] **Step 2: 类型验证**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 汇报，等待提交指令**

---

### Task 8: SoundToggle 组件

**Files:**
- Create: `client/src/components/ui/SoundToggle.tsx`
- Create: `client/src/components/ui/SoundToggle.css`

**Interfaces:**
- Consumes: `settingsApi`（Task 4）、`showToast`、framer-motion、lucide `Volume2`/`VolumeX`
- Produces: `<SoundToggle />` 自管理组件 → Task 9 放入 PageShell actions

- [ ] **Step 1: 创建组件**

`client/src/components/ui/SoundToggle.tsx`：

```tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsApi } from '../../api/settings';
import { showToast } from './Toast';
import './SoundToggle.css';

/**
 * 提示音开关（番茄钟页头右上角）：
 * 控制专注/休息自然结束时是否响铃；偏好存服务端（跨设备生效）。
 * 进入页面拉取一次；点击乐观更新，失败回滚 + toast。
 */
export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .get()
      .then((s) => {
        if (!cancelled) setEnabled(s.pomodoroSoundEnabled);
      })
      .catch(() => {
        /* 拉取失败：静默回退默认开启，按钮仍可交互 */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next); // 乐观更新
    try {
      const s = await settingsApi.update({ pomodoroSoundEnabled: next });
      setEnabled(s.pomodoroSoundEnabled);
    } catch {
      setEnabled(!next); // 回滚
      showToast('error', '提示音设置保存失败');
    }
  }, [enabled]);

  return (
    <button
      type="button"
      className="sound-toggle glass-1"
      onClick={handleToggle}
      disabled={loading}
      aria-pressed={enabled}
      aria-label={enabled ? '提示音已开启' : '提示音已关闭'}
      title={enabled ? '提示音已开启' : '提示音已关闭'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={enabled ? 'on' : 'off'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15 }}
          className="sound-toggle__icon"
        >
          {enabled ? (
            <Volume2 size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <VolumeX size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
```

- [ ] **Step 2: 创建样式**

`client/src/components/ui/SoundToggle.css`（复用 ThemeToggle 的 44px 玻璃圆钮模式）：

```css
/* ============================================================
   提示音开关（番茄钟页头右上角）：44px 玻璃圆形图标按钮
   ============================================================ */

.sound-toggle {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.sound-toggle:hover:not(:disabled) {
  color: var(--color-text-primary);
  box-shadow: var(--shadow-glass-md);
}

/* 位移仅鼠标设备生效（触摸 tap 后粘性 hover 会卡住上浮状态） */
@media (hover: hover) and (pointer: fine) {
  .sound-toggle:hover:not(:disabled) {
    transform: translateY(-1px);
  }
}

.sound-toggle:active:not(:disabled) {
  transform: scale(0.97);
}

.sound-toggle:disabled {
  opacity: 0.6;
  cursor: default;
}

.sound-toggle__icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Reduced motion: 取消形变 */
@media (prefers-reduced-motion: reduce) {
  .sound-toggle:hover:not(:disabled),
  .sound-toggle:active:not(:disabled) {
    transform: none;
  }
}
```

- [ ] **Step 3: 类型验证**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 汇报，等待提交指令**

---

### Task 9: PomodoroPage 集成

**Files:**
- Modify: `client/src/pages/PomodoroPage.tsx`

**Interfaces:**
- Consumes: `SoundToggle`（Task 8）、`initSoundOnGesture`/`playEndSound`（Task 5）、`breakEndMode`（Task 7）、`end-sound` worker（Task 6）
- Produces: 完整的响铃行为（武装/解除 worker、播放校验、兜底）

- [ ] **Step 1: 增加 import**

`PomodoroPage.tsx` import 区追加（`./PomodoroPage.css` import 之前）：

```ts
import { SoundToggle } from '../components/ui/SoundToggle';
import { initSoundOnGesture, playEndSound } from '../utils/sound';
import type { FocusMode } from '../hooks/useFocusSession';
```

（`useFocusSession` 已存在，追加 type import；`useRef` 已在 React import 中）

- [ ] **Step 2: 解构 breakEndMode**

`useFocusSession()` 解构追加 `breakEndMode`：

```ts
    activeSession,
    breakMode, breakRemainingSeconds, breakEndsAt, breakEndMode, roundCount,
```

- [ ] **Step 3: 增加 worker ref 与武装 effect**

`const selfEndedRef = useRef(false);` 之后追加：

```ts
  /** 响铃 worker：后台标签页准点触发（worker 定时器不受页面后台节流） */
  const soundWorkerRef = useRef<Worker | null>(null);
  /** 当前武装的响铃 tag：worker 到点消息只有 tag 匹配才播放，防竞态误响 */
  const armedTagRef = useRef<string | null>(null);
```

「会话自然结束检测」effect 之后追加武装 effect：

```ts
  // 武装/解除响铃 worker：有进行中专注或休息时按结束时间武装；手动结束或
  // 离开页面时解除（armedTagRef 同步清空，避免迟到的 'end' 消息误触发播放）
  useEffect(() => {
    let endMs: number | null = null;
    let tag: string | null = null;
    if (activeSession) {
      endMs = new Date(activeSession.plannedEndAt).getTime();
      tag = activeSession.id;
    } else if (breakMode && breakEndsAt) {
      endMs = breakEndsAt;
      tag = `break:${breakEndsAt}`;
    }

    if (endMs === null || tag === null) {
      if (soundWorkerRef.current) {
        soundWorkerRef.current.postMessage({ type: 'disarm' });
        soundWorkerRef.current.terminate();
        soundWorkerRef.current = null;
      }
      armedTagRef.current = null;
      return;
    }

    if (!soundWorkerRef.current) {
      soundWorkerRef.current = new Worker(new URL('../workers/end-sound.ts', import.meta.url), {
        type: 'module',
      });
      soundWorkerRef.current.onmessage = (e: MessageEvent<{ type: 'end'; tag: string }>) => {
        const { type, tag: firedTag } = e.data;
        // 仅当 tag 与当前武装一致且非手动结束（提前完成/取消）才播放
        if (type === 'end' && firedTag === armedTagRef.current && !selfEndedRef.current) {
          armedTagRef.current = null;
          void playEndSound();
        }
      };
    }
    armedTagRef.current = tag;
    soundWorkerRef.current.postMessage({ type: 'arm', endMs, tag });
  }, [activeSession, breakMode, breakEndsAt]);
```

- [ ] **Step 4: 手动结束先解除武装**

`handleStartFocus` 内 `initSoundOnGesture()`（`startFocus` 调用之前）：

```ts
      // 用户手势即解锁音频（浏览器自动播放策略），后续自然结束才能响铃
      initSoundOnGesture();
      await startFocus(selectedPreset?.id ?? null, durationMinutes, 'pomodoro');
```

- [ ] **Step 5: 专注自然结束兜底播放**

现有「会话自然结束检测」effect 的 natural 分支（`setStep('completed');` 之前）追加：

```ts
      // 兜底：worker 未武装成功或消息丢失时，页面检测到自然结束补响一次
      if (armedTagRef.current === prevId) {
        armedTagRef.current = null;
        void playEndSound();
      }
```

（`prevId` 即 `prevSessionIdRef.current` 的旧值，与该 effect 既有逻辑一致）

- [ ] **Step 6: 休息自然结束兜底播放**

「会话自然结束检测」effect 之后追加（独立 effect）：

```ts
  // 休息自然结束兜底：worker 未响时，页面检测 breakMode 消失 + natural 标记补响
  const prevBreakModeRef = useRef<FocusMode | null>(null);
  useEffect(() => {
    const prev = prevBreakModeRef.current;
    prevBreakModeRef.current = breakMode;
    if (prev && !breakMode && breakEndMode === 'natural' && armedTagRef.current !== null) {
      armedTagRef.current = null;
      void playEndSound();
    }
  }, [breakMode, breakEndMode]);
```

- [ ] **Step 7: PageShell actions 加开关**

`<PageShell title="番茄钟"` 处追加 actions：

```tsx
      title="番茄钟"
      subtitle={breakMode ? '休息一下，恢复精力' : '设定时长，即刻开始一段专注'}
      actions={<SoundToggle />}
```

- [ ] **Step 8: 类型验证 + 构建**

Run: `cd client && npx tsc --noEmit && npx vite build`
Expected: 无类型错误，构建成功

- [ ] **Step 9: 汇报，等待提交指令**

---

### Task 10: 全量验证

**Files:** 无（验证清单）

- [ ] **Step 1: 单测 + lint**

Run: `npm test && npm run lint`
Expected: vitest 通过（sound.test.ts 3 个）；ESLint 无错误

- [ ] **Step 2: 全量构建**

Run: `npm run build`
Expected: client vite build + server tsc 均成功

- [ ] **Step 3: E2E 冒烟**

Run: `npm run dev`（另开终端）→ `npm run test:e2e`
Expected: smoke 通过（介绍页冒烟）

- [ ] **Step 4: 手动验证清单**（在浏览器完成，交给用户）

1. 番茄钟页右上角出现音量按钮（默认开启态，喇叭图标）
2. 未设置过偏好时默认开；刷新后状态保持
3. 开始专注（如 5 分钟）→ 自然结束 → 响铃
4. 提前完成 → 不响铃
5. 休息自然结束 → 响铃；跳过休息 → 不响
6. 点开关关闭 → 再自然结束一次 → 不响；刷新仍关闭
7. 切到网课标签页（页面在后台）专注自然结束 → 准时响铃
8. 无 `public/sounds/pomodoro-end.mp3` 时用合成音；放入 mp3 后自动切换
9. 移动端窄屏：按钮折行到标题下方，布局不破
10. 页面无 console error

- [ ] **Step 5: 汇报验证结果，等待用户验收 + 提交/合并指令**

---

## Self-Review 记录

- **Spec 覆盖**：user_settings 表（T1）✓ / shared schema（T2）✓ / GET+PUT 接口（T3）✓ / 客户端 api（T4）✓ / 合成音+mp3 探测+手势解锁（T5）✓ / 后台准点响铃 worker（T6）✓ / breakEndMode（T7）✓ / 开关 UI 右上角+乐观更新（T8+T9）✓ / 只响自然结束（T5 播放校验 + T9 Step 5/6）✓ / 手动结束不响（T9 Step 4/5/6 + worker disarm）✓ / 验证标准（T10）✓
- **占位符扫描**：无 TBD/TODO；每步含完整代码或确切命令
- **类型一致性**：`settingsApi.get/update`、`UpdateSettingsInput`、`playEndSound`、`initSoundOnGesture`、`breakEndMode: 'natural' | null`、`armedTagRef`、worker 协议 `{type:'arm'|'disarm'|'end', endMs, tag}` 全计划一致
- **约束**：全计划无 git commit 步骤（用户显式指令才提交）；零新依赖
