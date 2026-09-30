/**
 * 节能模式（Power Save）— 状态真源与降级谓词
 *
 * 与正常模式的唯一差异是**降低前端运行时开销**：常驻动效冻结、逐帧循环降频、
 * 装饰性效果关闭、（必要时）玻璃模糊降级为实底。布局、配色、内容、功能不变。
 *
 * 真源是 `<html data-power-save="on">`：CSS 与 JS 都读它，天然不会漂移，
 * 也不需要 React context（避免"两份状态"）。写入时机在 main.tsx 模块顶层
 * （早于 createRoot），首帧即带标记，不会先跑一遍重活再关掉。
 *
 * 模式是**设备级**偏好（电池 / GPU / 风扇，同一账号在不同机器上需求不同），
 * 故存 localStorage 而非服务端 user_settings —— 服务端方案启动时需先拉取，
 * 重活会先跑一遍才被关掉，且未登录的落地页拿不到。
 *
 * 纯函数（parsePowerSave / resolveShouldReduceMotion）与 DOM 操作分开，
 * 前者可在 vitest 的 node 环境下直接测（见 powerSave.test.ts）。
 */

export const POWER_SAVE_STORAGE_KEY = 'kaoyandaily-power-save';
export const POWER_SAVE_ATTR = 'data-power-save';

/** 存储/属性值：仅 'on' 视为开启 */
const ON = 'on';
const OFF = 'off';

/** 存储值 → 开关（null / 异常值一律关闭，默认即正常模式） */
export function parsePowerSave(raw: string | null): boolean {
  return raw === ON;
}

/**
 * 降级谓词：系统级「减少动效」偏好或节能模式任一成立即降级。
 * 节能模式是 prefers-reduced-motion 的**超集**——两者共用同一批组件分支，
 * 组件只需读这一个谓词，避免每个降级点各写一套判断。
 */
export function resolveShouldReduceMotion(
  prefersReducedMotion: boolean,
  powerSave: boolean,
): boolean {
  return prefersReducedMotion || powerSave;
}

/* ---- 以下为浏览器侧读写（node 环境自动退化为安全空操作）---- */

function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

function readStored(): string | null {
  if (!hasDom()) return null;
  try {
    return window.localStorage.getItem(POWER_SAVE_STORAGE_KEY);
  } catch {
    /* 隐私模式等 localStorage 不可用：静默回落正常模式 */
    return null;
  }
}

function writeStored(on: boolean): void {
  if (!hasDom()) return;
  try {
    window.localStorage.setItem(POWER_SAVE_STORAGE_KEY, on ? ON : OFF);
  } catch {
    /* 写入失败不影响本次会话内生效（属性已置） */
  }
}

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

function notify(on: boolean): void {
  for (const fn of listeners) fn(on);
}

/** 订阅模式变化（同标签页切换 + 其他标签页 storage 事件） */
export function subscribePowerSave(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 只写属性，不落存储（供首帧初始化使用） */
function applyAttr(on: boolean): void {
  if (!hasDom()) return;
  const el = document.documentElement;
  if (on) el.setAttribute(POWER_SAVE_ATTR, ON);
  else el.removeAttribute(POWER_SAVE_ATTR);
}

/** 当前是否节能模式（优先读 DOM 属性——CSS 生效的同一个真源） */
export function isPowerSave(): boolean {
  if (!hasDom()) return false;
  const attr = document.documentElement.getAttribute(POWER_SAVE_ATTR);
  if (attr !== null) return attr === ON;
  return parsePowerSave(readStored());
}

/** 切换模式：属性 + 存储 + 通知（同标签页立即生效，跨标签页由 storage 事件补齐） */
export function setPowerSave(on: boolean): void {
  applyAttr(on);
  writeStored(on);
  notify(on);
}

/**
 * 首帧初始化：main.tsx 模块顶层调用（早于 createRoot，故首帧即带标记）。
 * 同时挂上 storage 监听，使多标签页同步（模式改变运行时行为，不适合各标签页独立）。
 */
export function initPowerSave(): void {
  applyAttr(parsePowerSave(readStored()));
  if (!hasDom()) return;
  window.addEventListener('storage', (e) => {
    if (e.key !== POWER_SAVE_STORAGE_KEY) return;
    const on = parsePowerSave(e.newValue);
    applyAttr(on);
    notify(on);
  });
}

/** 系统级「减少动效」偏好（非节能模式时的既有降级来源） */
export function prefersReducedMotion(): boolean {
  if (!hasDom() || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 组件用：是否需要降级动效 */
export function shouldReduceMotion(): boolean {
  return resolveShouldReduceMotion(prefersReducedMotion(), isPowerSave());
}
