/**
 * 本地模式复盘锁哈希：SHA-256 + 16 字节随机 salt，存储格式 `salt:hex`。
 * 不引 bcrypt 进 client bundle（ADR-0005 W3）：本地数据本就在同一浏览器内，
 * 威胁模型等价。Node 20+/现代浏览器均有 globalThis.crypto.subtle，vitest node 环境可测。
 */
const SALT_BYTES = 16;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashReviewPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ?? toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)).buffer);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return `${salt}:${toHex(digest)}`;
}

export async function verifyReviewPassword(password: string, stored: string): Promise<boolean> {
  const salt = stored.split(':')[0];
  if (!salt || salt.length !== SALT_BYTES * 2) return false;
  return (await hashReviewPassword(password, salt)) === stored;
}
