/**
 * 本地账户管理：账户 CRUD + 激活账户读写。
 * 激活账户 id 存 localStorage；激活即进入本地模式（同步 setLocalMode）。
 * 删除账户 = 删除该账户全部业务记录（遍历 8 个 store 按 accountId 过滤）。
 */

import { ACTIVE_ACCOUNT_KEY, localStore } from './storage';
import { setLocalMode } from './mode';
import {
  BUSINESS_STORES,
  idbDelete,
  idbGetAll,
  idbGetByIndex,
  idbPut,
  tx,
  type StoreName,
} from './db';
import { generateUUID } from '../utils/uuid';
import { formatDateTime } from '../utils/date';
import type { LocalAccount } from './types';

/* ---- 激活账户 ---- */

export function getActiveLocalAccount(): LocalAccount | null {
  const raw = localStore.getItem(ACTIVE_ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalAccount;
  } catch {
    return null;
  }
}

export function setActiveLocalAccount(account: LocalAccount | null): void {
  if (account) {
    localStore.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(account));
    setLocalMode(true);
  } else {
    localStore.removeItem(ACTIVE_ACCOUNT_KEY);
    setLocalMode(false);
  }
}

/* ---- 账户 CRUD ---- */

export async function listLocalAccounts(): Promise<LocalAccount[]> {
  return tx('accounts', 'readonly', (t) => idbGetAll(t, 'accounts')) as Promise<LocalAccount[]>;
}

export async function findLocalAccountByEmail(email: string): Promise<LocalAccount | null> {
  const key = email.trim().toLowerCase();
  return tx('accounts', 'readonly', (t) => idbGetByIndex(t, 'accounts', 'email', key)) as Promise<LocalAccount | null>;
}

/** 新建本地账户（email 本地唯一；创建后不自动激活，由调用方决定） */
export async function createLocalAccount(email: string): Promise<LocalAccount> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) throw new Error('邮箱不能为空');
  const existing = await findLocalAccountByEmail(trimmed);
  if (existing) throw new Error('该邮箱已存在本地账户');
  const account: LocalAccount = {
    accountId: generateUUID(),
    email: trimmed,
    createdAt: formatDateTime(),
  };
  await tx('accounts', 'readwrite', (t) => idbPut(t, 'accounts', account));
  return account;
}

/** 删除本地账户及其全部业务数据（settings 主键为复合键，单独处理）；若删除的是激活账户则退出本地模式 */
export async function deleteLocalAccount(accountId: string): Promise<void> {
  await tx(['accounts', ...BUSINESS_STORES], 'readwrite', async (t) => {
    await idbDelete(t, 'accounts', accountId);
    for (const name of BUSINESS_STORES) {
      const rows = await idbGetAll(t, name);
      for (const row of rows as Array<{ accountId?: string }>) {
        if (row.accountId !== accountId) continue;
        if (name === 'settings') {
          const r = row as { accountId: string; key: string };
          await idbDelete(t, name, [r.accountId, r.key]);
        } else {
          await idbDelete(t, name, (row as { id: string }).id);
        }
      }
    }
  });
  const active = getActiveLocalAccount();
  if (active?.accountId === accountId) setActiveLocalAccount(null);
}

export type { LocalAccount };
export type { StoreName };