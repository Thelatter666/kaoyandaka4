import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { flushSync } from 'react-dom';
import './AnimatedThemeToggle.css';

export type TransitionVariant = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'rectangle' | 'star';

interface AnimatedThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  duration?: number;
  variant?: TransitionVariant;
  /** When true, the transition expands from the viewport center instead of the button center. */
  fromCenter?: boolean;
  /**
   * Controlled theme value. When provided, the parent owns persistence
   * (e.g., `next-themes`) and this component will not write to localStorage.
   */
  theme?: 'light' | 'dark';
  /** Called on toggle. Pair with `theme` for controlled usage. */
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

const AnimatedThemeToggle = ({
  className,
  duration = 400,
  variant = 'circle',
  fromCenter = false,
  theme,
  onThemeChange,
  ...props
}: AnimatedThemeToggleProps) => {
  const shape = variant ?? 'circle';
  const isControlled = theme !== undefined;
  const [internalIsDark, setInternalIsDark] = useState(false);
  const isDark = isControlled ? theme === 'dark' : internalIsDark;
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    if (isControlled) return;

    const updateTheme = () => {
      setInternalIsDark(document.documentElement.classList.contains('dark'));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [isControlled]);

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current;
    if (!button || isTransitioningRef.current || document.documentElement.dataset.kaoyandailyThemeVt === 'active') return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x: number;
    let y: number;
    if (fromCenter) {
      x = viewportWidth / 2;
      y = viewportHeight / 2;
    } else {
      const { top, left, width, height } = button.getBoundingClientRect();
      x = left + width / 2;
      y = top + height / 2;
    }

    const maxRadius = Math.hypot(
      Math.max(x, viewportWidth - x),
      Math.max(y, viewportHeight - y),
    );

    const applyTheme = () => {
      const newTheme = !isDark;
      document.documentElement.classList.toggle('dark');
      if (isControlled) {
        onThemeChange?.(newTheme ? 'dark' : 'light');
      } else {
        setInternalIsDark(newTheme);
        localStorage.setItem('theme', newTheme ? 'dark' : 'light');
      }
    };

    if (typeof document.startViewTransition !== 'function') {
      applyTheme();
      return;
    }

    // 简化的 clipPath 计算（仅支持圆形和方形）
    const getClipPath = (): [string, string] => {
      switch (shape) {
        case 'circle':
          return [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ];
        case 'square': {
          const halfW = Math.max(x, viewportWidth - x);
          const halfH = Math.max(y, viewportHeight - y);
          const halfSide = Math.max(halfW, halfH) * 1.05;
          const start = `polygon(0px 0px, 0px 0px, 0px 0px, 0px 0px)`;
          const end = `polygon(${x - halfSide}px ${y - halfSide}px, ${x + halfSide}px ${y - halfSide}px, ${x + halfSide}px ${y + halfSide}px, ${x - halfSide}px ${y + halfSide}px)`;
          return [start, end];
        }
        default:
          return [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ];
      }
    };

    const root = document.documentElement;
    root.dataset.kaoyandailyThemeVt = 'active';
    
    isTransitioningRef.current = true;
    const transition = document.startViewTransition(() => {
      flushSync(applyTheme);
    });

    const cleanup = () => {
      isTransitioningRef.current = false;
      delete root.dataset.kaoyandailyThemeVt;
    };

    transition.finished.finally(cleanup).catch(() => {});

    transition.ready.then(() => {
      const clipPaths = getClipPath();
      
      document.documentElement.animate(
        {
          clipPath: clipPaths,
        },
        {
          duration,
          easing: shape === 'star' ? 'linear' : 'ease-out',
          fill: 'forwards',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  }, [shape, fromCenter, duration, isDark, isControlled, onThemeChange]);

  return (
    <button
      ref={buttonRef}
      onClick={toggleTheme}
      className={`animated-theme-toggle glass-1 ${className || ''}`}
      aria-label="切换主题"
      {...props}
    >
      {isDark ? (
        <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="sr-only">切换主题</span>
    </button>
  );
};

export default AnimatedThemeToggle;
