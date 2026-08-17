/** 生成 UUID v4：浏览器原生 crypto.randomUUID（secure context / localhost 均可用） */
export function generateUUID(): string {
  return crypto.randomUUID();
}