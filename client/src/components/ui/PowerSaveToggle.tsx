import React from 'react';
import { Leaf } from 'lucide-react';
import { usePowerSave } from '../../hooks/usePowerSave';
import './PowerSaveToggle.css';

/**
 * 节能模式开关（顶栏，主题切换左侧）：44px 玻璃圆钮，与 ThemeToggle 同造型。
 *
 * 开启后系统前端运行时开销显著低于正常模式（常驻动效冻结、墨面降频、
 * 装饰性效果关闭），布局与功能不变 —— 详见 utils/powerSave.ts 与
 * styles/power-save.css。按钮本身兼作常驻状态指示：开启时主色高亮，
 * 用户看到「页面为什么静止」时有处可查。
 *
 * 设备级偏好（存 localStorage，不落服务端 user_settings），点击即时生效、
 * 无网络往返，故不需要乐观更新/回滚（与 SoundToggle 的服务端偏好不同）。
 */
export function PowerSaveToggle() {
  const { powerSave, toggle } = usePowerSave();

  return (
    <button
      type="button"
      className="power-save-toggle glass-1"
      onClick={toggle}
      aria-pressed={powerSave}
      aria-label={powerSave ? '节能模式已开启' : '节能模式已关闭'}
      title={
        powerSave
          ? '节能模式已开启：常驻动效已冻结、墨面降频。点击恢复正常模式'
          : '节能模式已关闭：点击降低前端开销（降低动效与逐帧开销）'
      }
    >
      <Leaf size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
