/**
 * 复盘锁解锁标记（ADR-0005）：会话 cookie——跨标签页共享、浏览器关闭即失效，
 * 精确对应「每次启动系统只需输入一次」。值 = 当前身份 id，读取时校验匹配，
 * 换账号自动失效。标记非机密，可被 JS 读写（防护本体在服务端验证与哈希）。
 */
const COOKIE_NAME = 'kaoyandaily_review_unlocked';

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
