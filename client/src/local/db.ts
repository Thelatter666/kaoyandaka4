/**
 * IndexedDB 数据层：单库 kaoyandaily_local（version 1）。
 * stores：accounts（本地账户）+ 8 个业务 store（presets/tasks/reviews/courses/episodes/
 * focusSessions/studyRecords/settings）+ meta（库元信息，预留）。
 * 每条业务记录携带 accountId 字段并建索引；查询一律先按 accountId 过滤。
 * settings 无业务 id，主键为复合键 [accountId, key]。
 */

export const DB_NAME = 'kaoyandaily_local';
export const DB_VERSION = 1;

export const BUSINESS_STORES = [
  'presets',
  'tasks',
  'reviews',
  'courses',
  'episodes',
  'focusSessions',
  'studyRecords',
  'settings',
] as const;

export const STORES = ['accounts', ...BUSINESS_STORES, 'meta'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('accounts')) {
          const s = db.createObjectStore('accounts', { keyPath: 'accountId' });
          s.createIndex('email', 'email', { unique: true });
        }
        for (const name of BUSINESS_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            if (name === 'settings') {
              // 设置无业务 id：复合主键 [accountId, key]
              const s = db.createObjectStore('settings', { keyPath: ['accountId', 'key'] });
              s.createIndex('accountId', 'accountId', { unique: false });
            } else {
              const s = db.createObjectStore(name, { keyPath: 'id' });
              s.createIndex('accountId', 'accountId', { unique: false });
              if (name === 'reviews') {
                // 模拟服务器唯一键 (user_id, review_date)
                s.createIndex('accountId_reviewDate', ['accountId', 'reviewDate'], { unique: true });
              }
            }
          }
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

/** 单测用：关闭并删除整个本地库（每个用例前重置状态） */
export async function resetDb(): Promise<void> {
  const current = dbPromise;
  dbPromise = null;
  if (current) {
    try {
      const db = await current;
      db.close();
    } catch {
      /* 连接失败无需处理 */
    }
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/* ---- 请求封装 ---- */

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * 事务封装：fn 内同步链式发起请求（await 的必须是本事务内请求的 Promise，
 * 不能 await 外部异步），事务完成/失败统一结算。
 */
export function tx<T>(
  storeNames: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (txn: IDBTransaction) => Promise<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const txn = db.transaction(storeNames, mode);
        // work 先行结算：fn 的 rejection 立即落地（避免事务事件回调晚于调用方
        // 结算造成 unhandled rejection）；成功后等待事务事件确认落库
        const work = fn(txn);
        work.then(
          (value) => {
            txn.oncomplete = () => resolve(value);
            txn.onerror = () => reject(txn.error);
            txn.onabort = () => reject(txn.error ?? new Error('IndexedDB 事务已中止'));
          },
          (err) => {
            // 业务失败：以原始错误结算；事务后续事件不再影响结果
            txn.onerror = () => {};
            txn.onabort = () => {};
            reject(err);
          }
        );
      })
  );
}

/* ---- 基础读写 helper ---- */

export function idbGetByKey(txn: IDBTransaction, store: StoreName, key: IDBValidKey): Promise<unknown> {
  return req(txn.objectStore(store).get(key));
}

export function idbGetAll(txn: IDBTransaction, store: StoreName): Promise<unknown[]> {
  return req(txn.objectStore(store).getAll());
}

export function idbGetAllByIndex(
  txn: IDBTransaction,
  store: StoreName,
  index: string,
  key: IDBValidKey
): Promise<unknown[]> {
  return req(txn.objectStore(store).index(index).getAll(key));
}

export function idbGetByIndex(
  txn: IDBTransaction,
  store: StoreName,
  index: string,
  key: IDBValidKey
): Promise<unknown> {
  return req(txn.objectStore(store).index(index).get(key));
}

export function idbPut(txn: IDBTransaction, store: StoreName, value: unknown): Promise<IDBValidKey> {
  return req(txn.objectStore(store).put(value));
}

export function idbDelete(txn: IDBTransaction, store: StoreName, key: IDBValidKey): Promise<void> {
  return req(txn.objectStore(store).delete(key));
}

export function idbClear(txn: IDBTransaction, store: StoreName): Promise<void> {
  return req(txn.objectStore(store).clear());
}