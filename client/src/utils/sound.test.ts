import { describe, it, expect, vi, beforeEach } from 'vitest';

class MockOscillator {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn(() => ({ connect: vi.fn() }));
  start = vi.fn();
  stop = vi.fn();
}

class MockGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn(() => ({ connect: vi.fn() }));
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = vi.fn(() => new MockOscillator());
  createGain = vi.fn(() => new MockGain());
  resume = vi.fn(() => Promise.resolve());
}

beforeEach(() => {
  vi.restoreAllMocks();
  // 清模块缓存：sound.ts 模块级的 mp3 探测缓存与 AudioContext 单例需每测试重置
  vi.resetModules();
  vi.stubGlobal('AudioContext', MockAudioContext);
});

function headResponse(ok: boolean, contentType: string) {
  return { ok, headers: { get: () => contentType } };
}

describe('sound utils', () => {
  it('mp3 存在（audio/* Content-Type）时用 Audio 播放，且探测只请求一次', async () => {
    const fetchMock = vi.fn().mockResolvedValue(headResponse(true, 'audio/mpeg'));
    const audioMock = { play: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', vi.fn(() => audioMock));

    const { playEndSound } = await import('./sound');
    await playEndSound();
    await playEndSound();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(audioMock.play).toHaveBeenCalledTimes(2);
  });

  it('mp3 404 时走合成音（创建 AudioContext，不创建 Audio）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(headResponse(false, 'text/html'));
    vi.stubGlobal('fetch', fetchMock);
    const AudioCtor = vi.fn();
    vi.stubGlobal('Audio', AudioCtor);

    const { playEndSound } = await import('./sound');
    await playEndSound();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(AudioCtor).not.toHaveBeenCalled();
  });

  it('SPA fallback 误报 200（text/html）时视为无 mp3，走合成音', async () => {
    // dev vite / 生产 nginx 对不存在的路径回退 index.html：200 + text/html
    const fetchMock = vi.fn().mockResolvedValue(headResponse(true, 'text/html'));
    vi.stubGlobal('fetch', fetchMock);
    const AudioCtor = vi.fn();
    vi.stubGlobal('Audio', AudioCtor);

    const { playEndSound } = await import('./sound');
    await playEndSound();

    expect(AudioCtor).not.toHaveBeenCalled();
  });

  it('Audio.play 失败时静默不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(headResponse(true, 'audio/mpeg')));
    vi.stubGlobal('Audio', vi.fn(() => ({ play: vi.fn().mockRejectedValue(new Error('blocked')) })));

    const { playEndSound } = await import('./sound');
    await expect(playEndSound()).resolves.toBeUndefined();
  });
});
