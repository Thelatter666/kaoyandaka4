/**
 * 提示音引擎：合成音兜底 + 可替换 mp3 + 用户手势解锁 + 开关门控
 *
 * - 浏览器自动播放策略：AudioContext 必须经用户手势（如点击「开始专注」）
 *   后创建/resume，否则后续自然结束时的播放会被拦截。
 * - mp3 可选：client/public/sounds/pomodoro-end.mp3（专注结束钟声）与
 *   break-end.mp3（休息结束提示音）。存在则优先用 Audio 播放（fetch HEAD 探测
 *   一次并校验 Content-Type），缺失则用 Web Audio 合成兜底，功能不依赖文件存在。
 * - setSoundEnabled 门控所有播放（修复：响铃开关此前从未被消费的 bug）。
 * - 全部失败路径静默（console.debug），绝不抛出到 UI 层。
 */
let audioCtx: AudioContext | null = null;
let soundEnabled = true;

type SoundKind = 'focus' | 'break';
const MP3_URLS: Record<SoundKind, string> = {
  focus: '/sounds/pomodoro-end.mp3',
  break: '/sounds/break-end.mp3',
};
const mp3Available: Partial<Record<SoundKind, boolean>> = {};

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

/** 响铃总开关（SoundToggle 同步；设置拉取失败保持默认开启，与后端默认一致） */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

async function detectMp3(kind: SoundKind): Promise<boolean> {
  if (mp3Available[kind] !== undefined) return mp3Available[kind] as boolean;
  try {
    const res = await fetch(MP3_URLS[kind], { method: 'HEAD' });
    // 仅状态码 200 不够：dev vite / 生产 nginx 的 SPA fallback 会把不存在的
    // 路径回退为 index.html（200 + text/html），须校验 Content-Type 为 audio/*
    const contentType = res.headers.get('content-type') ?? '';
    mp3Available[kind] = res.ok && contentType.startsWith('audio/');
  } catch {
    mp3Available[kind] = false;
  }
  return mp3Available[kind] as boolean;
}

interface SynthNote {
  freq: number;
  startOffset: number;
  duration: number;
}

/** 合成提示音：notes 为频率/起始偏移/时长序列；mp3 缺失时的兜底音源 */
function playSynthesized(notes: SynthNote[]): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const { freq, startOffset, duration } of notes) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + startOffset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.85);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }
}

// 专注结束钟声：A5 → D6（既有音色，勿改——用户已有预期）
const FOCUS_NOTES: SynthNote[] = [
  { freq: 880, startOffset: 0, duration: 0.4 },
  { freq: 1174.66, startOffset: 0.18, duration: 0.4 },
];
// 休息结束提示音：D6 → A6 上行双音，更轻快，与专注钟声区分（CONTEXT.md 休息提示音）
const BREAK_NOTES: SynthNote[] = [
  { freq: 1174.66, startOffset: 0, duration: 0.3 },
  { freq: 1760, startOffset: 0.14, duration: 0.3 },
];

export async function playEndSound(kind: SoundKind = 'focus'): Promise<void> {
  if (!soundEnabled) return;
  try {
    initSoundOnGesture();
    const useMp3 = await detectMp3(kind);
    if (useMp3) {
      const AudioCtor = (globalThis as unknown as { Audio?: typeof Audio }).Audio;
      if (AudioCtor) {
        await new AudioCtor(MP3_URLS[kind]).play();
        return;
      }
    }
    playSynthesized(kind === 'break' ? BREAK_NOTES : FOCUS_NOTES);
  } catch (err) {
    // 播放被拦截/失败：静默降级，不打扰用户
    console.debug('playEndSound failed', err);
  }
}
