/**
 * localStorage 安全封装：浏览器走原生存储；无 localStorage 环境（如 node 单测）退化为内存 Map。
 * 两者双写，读取优先原生，保证单测与浏览器行为一致。
 */

const memory = new Map<string, string>();

/** 当前激活本地账户 id 的存储键（accounts.ts 与 mode.ts 共用，避免循环依赖） */
export const ACTIVE_ACCOUNT_KEY = 'kaoyandaily_local_activeAccount';

function raw(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const localStore = {
  getItem(key: string): string | null {
    const native = raw()?.getItem(key);
    if (native !== null && native !== undefined) return native;
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    memory.set(key, value);
    raw()?.setItem(key, value);
  },
  removeItem(key: string): void {
    memory.delete(key);
    raw()?.removeItem(key);
  },
};