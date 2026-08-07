/// <reference lib="webworker" />
/**
 * countdown-title worker — 后台标签页也保持秒级刷新的倒计时标题
 *
 * 浏览器对不可见标签页的 setInterval 会节流（约 1 次/分钟），主线程方案
 * 切走标签即失去实时性；Worker 计时不受标签页可见性节流，每秒自算剩余
 * 并回传标题串，标签栏可实时扫读。
 *
 * 协议：主线程 postMessage({ endMs, label }) → worker 每秒回传标题字符串。
 */
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let timer: ReturnType<typeof setInterval> | null = null;
let endMs = 0;
let label = '专注';

function fmt(sec: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
}

function tick(): void {
  const remain = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  ctx.postMessage(`[${fmt(remain)}] ${label} · 砚台考研打卡`);
}

ctx.onmessage = (e: MessageEvent<{ endMs: number; label: string }>) => {
  endMs = e.data.endMs;
  label = e.data.label;
  if (timer) clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
};
