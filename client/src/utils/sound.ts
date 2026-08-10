/**
 * 提示音引擎：合成音兜底 + 可替换 mp3 + 用户手势解锁
 *
 * - 浏览器自动播放策略：AudioContext 必须经用户手势（如点击「开始专注」）
 *   后创建/resume，否则后续自然结束时的播放会被拦截。
 * - mp3 文件（client/public/sounds/pomodoro-end.mp3）可选：存在则优先用
 *   Audio 播放（fetch HEAD 探测一次并缓存结果），缺失则用 Web Audio 合成
 *   双音提示音兜底，功能不依赖文件存在。
 * - 全部失败路径静默（console.debug），绝不抛出到 UI 层。
 */
let audioCtx: AudioContext | null = null;
let mp3Available: boolean | null = null;

const MP3_URL = '/sounds/pomodoro-end.mp3';

function getAudioContext(): AudioContext | null {
  const Ctor =
    (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function initSoundOnGesture(): void {
  try {
    if (!audioCtx) {
      audioCtx = getAudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  } catch (err) {
    console.debug('initSoundOnGesture failed', err);
  }
}

async function detectMp3(): Promise<boolean> {
  if (mp3Available !== null) return mp3Available;
  try {
    const res = await fetch(MP3_URL, { method: 'HEAD' });
    // 仅状态码 200 不够：dev vite / 生产 nginx 的 SPA fallback 会把不存在的
    // 路径回退为 index.html（200 + text/html），须校验 Content-Type 为 audio/*
    const contentType = res.headers.get('content-type') ?? '';
    mp3Available = res.ok && contentType.startsWith('audio/');
  } catch {
    mp3Available = false;
  }
  return mp3Available;
}

/** 合成双音提示音（A5 → D6，总长 <0.6s）：mp3 缺失时的兜底音源 */
function playSynthesized(): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = [880, 1174.66];
  for (const [i, freq] of notes.entries()) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.18;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

export async function playEndSound(): Promise<void> {
  try {
    initSoundOnGesture();
    const useMp3 = await detectMp3();
    if (useMp3) {
      const AudioCtor = (globalThis as unknown as { Audio?: typeof Audio }).Audio;
      if (AudioCtor) {
        await new AudioCtor(MP3_URL).play();
        return;
      }
    }
    playSynthesized();
  } catch (err) {
    // 播放被拦截/失败：静默降级，不打扰用户
    console.debug('playEndSound failed', err);
  }
}
