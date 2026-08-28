import React, { useState, useCallback, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsApi } from '../../api/settings';
import { setSoundEnabled } from '../../utils/sound';
import { showToast } from './Toast';
import './SoundToggle.css';

/**
 * 提示音开关（番茄钟页头右上角）：
 * 控制专注/休息自然结束时是否响铃；偏好存服务端（跨设备生效）。
 * 进入页面拉取一次；点击乐观更新，失败回滚 + toast。
 */
export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .get()
      .then((s) => {
        if (!cancelled) {
          setEnabled(s.pomodoroSoundEnabled);
          setSoundEnabled(s.pomodoroSoundEnabled);
        }
      })
      .catch(() => {
        /* 拉取失败：静默回退默认开启，按钮仍可交互 */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next); // 乐观更新
    try {
      const s = await settingsApi.update({ pomodoroSoundEnabled: next });
      setEnabled(s.pomodoroSoundEnabled);
      setSoundEnabled(s.pomodoroSoundEnabled);
    } catch {
      setEnabled(!next); // 回滚
      showToast('error', '提示音设置保存失败');
    }
  }, [enabled]);

  return (
    <button
      type="button"
      className="sound-toggle glass-1"
      onClick={handleToggle}
      disabled={loading}
      aria-pressed={enabled}
      aria-label={enabled ? '提示音已开启' : '提示音已关闭'}
      title={enabled ? '提示音已开启' : '提示音已关闭'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={enabled ? 'on' : 'off'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.1 }}
          className="sound-toggle__icon"
        >
          {enabled ? (
            <Volume2 size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <VolumeX size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
