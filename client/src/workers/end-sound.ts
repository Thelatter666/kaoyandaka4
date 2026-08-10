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
 *
 * 注意：顶层变量须包在 IIFE 内——与 countdown-title.ts 同属一个 TS 程序，
 * 顶层重复声明 ctx/timer/endMs 会触发 TS2451 重声明错误。
 */
(() => {
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
})();
