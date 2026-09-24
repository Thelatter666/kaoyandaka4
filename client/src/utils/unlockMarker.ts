/**
 * 复盘锁解锁标记（ADR-0005）：会话 cookie——跨标签页共享、浏览器关闭即失效，
 * 精确对应「每次启动系统只需输入一次」。值 = 当前身份 id，读取时校验匹配，
 * 换账号自动失效。标记非机密，可被 JS 读写（防护本体在服务端验证与哈希）。
 *
 * 手动上锁 = 删掉这个 cookie + 广播一次：解锁标记是标签页共享的，上锁若不
 * 广播，另一个标签页会继续摊开复盘内容，锁就名不副实。
 */
const COOKIE_NAME = 'kaoyandaily_review_unlocked';
/** 跨标签页上锁通知频道（BroadcastChannel 不回投给发送方，无需自行过滤） */
const LOCK_CHANNEL = 'kaoyandaily_review_lock';

let lockChannel: BroadcastChannel | null = null;

/** 惰性创建频道；环境不支持时返回 null（上锁本标签页仍生效，只是不向外传播） */
function getLockChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  lockChannel ??= new BroadcastChannel(LOCK_CHANNEL);
  return lockChannel;
}

export function isReviewUnlocked(identityId: string): boolean {
  if (!identityId) return false;
  const entry = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return false;
  try {
    return decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) === identityId;
  } catch {
    return false;
  }
}

export function markReviewUnlocked(identityId: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(identityId)}; path=/; SameSite=Lax`;
}

/** 上锁：清掉解锁标记并通知其他标签页；下次进复盘页需重新验证密码 */
export function clearReviewUnlocked(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
  getLockChannel()?.postMessage('locked');
}

/** 订阅其他标签页的上锁通知，返回取消订阅函数 */
export function onReviewLocked(handler: () => void): () => void {
  const channel = getLockChannel();
  if (!channel) return () => {};
  const listener = (e: MessageEvent) => {
    if (e.data === 'locked') handler();
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
