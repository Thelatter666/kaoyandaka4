/**
 * 数据模式开关：服务器模式（默认）↔ 本地模式（IndexedDB）。
 * - localMode：模块级变量，null = 尚未初始化（首次调用时按「是否存在激活本地账户」推断）。
 * - localContext：本地账户页上下文（未激活账户时也走本地数据层，如导入预览/账户列表）。
 */

import { ACTIVE_ACCOUNT_KEY, localStore } from './storage';

let localMode: boolean | null = null;
let localContext = false;

export function isLocalMode(): boolean {
  if (localMode === null) {
    localMode = localStore.getItem(ACTIVE_ACCOUNT_KEY) !== null;
  }
  return localMode;
}

export function setLocalMode(on: boolean): void {
  localMode = on;
}

/** 是否处于本地账户上下文（本地模式已激活，或正在本地账户页操作） */
export function isLocalApp(): boolean {
  return isLocalMode() || localContext;
}

export function setLocalContext(on: boolean): void {
  localContext = on;
}