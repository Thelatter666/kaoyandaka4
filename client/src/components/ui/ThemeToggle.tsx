import React from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import './ThemeToggle.css';

/**
 * View Transitions 水波扩散（设计文档 4.4：圆形扩散 320ms）。
 * 特性检测：不支持 startViewTransition 或 prefers-reduced-motion 时
 * 直接切换主题，由 global.css 的 180ms 颜色淡变（reduced-motion 下瞬时）降级接管。
 */
interface ViewTransitionLike {
  ready: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const doc = document as DocumentWithViewTransition;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof doc.startViewTransition !== 'function' || reducedMotion) {
      toggleTheme();
      return;
    }

    // 以点击处为水波圆心；键盘触发（clientX/Y 为 0）时取按钮中心
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = doc.startViewTransition(() => {
      flushSync(() => toggleTheme());
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 320,
            easing: 'ease-out',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // 过渡被跳过（如快速连续切换）：主题状态已更新，无需额外处理
      });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="theme-toggle glass-1"
      aria-label="切换主题"
      title="切换主题"
    >
      {isDark ? (
        <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}
