import React, { useRef, useCallback, useEffect } from 'react';

interface MagneticProps {
  children: React.ReactNode;
  className?: string;
  /** 磁性强弱（0-1），越大偏移越明显 */
  strength?: number;
  /** 作用半径（px），鼠标距离超过此值无效果 */
  radius?: number;
  /** 渲染容器标签（默认 div） */
  as?: keyof JSX.IntrinsicElements;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Magnetic({
  children,
  className = '',
  strength = 0.3,
  radius = 200,
  as: Tag = 'div',
  style,
  ...props
}: MagneticProps) {
  const elRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);
  const currentRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });

  // 缓动函数：easeOutQuad
  const easing = useCallback((t: number) => t * (2 - t), []);

  const applyTransform = useCallback(() => {
    if (!elRef.current) return;

    const dx = targetRef.current.x - currentRef.current.x;
    const dy = targetRef.current.y - currentRef.current.y;

    // 接近目标值时直接对齐并停止循环（避免空闲时 60fps 空转）
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
      currentRef.current = { ...targetRef.current };
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    currentRef.current.x += dx * 0.12;
    currentRef.current.y += dy * 0.12;
    elRef.current.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
    rafRef.current = requestAnimationFrame(applyTransform);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const rect = elRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 超出作用半径，重置位置
    if (dist > radius) {
      targetRef.current = { x: 0, y: 0 };
      return;
    }

    // 计算磁性力：距离越近力越大
    const force = (1 - dist / radius) * strength;
    targetRef.current = { x: dx * force, y: dy * force };
  };

  const handlePointerLeave = () => {
    targetRef.current = { x: 0, y: 0 };
  };

  const startRAF = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(applyTransform);
  };

  const stopRAF = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // 组件卸载时清理 RAF
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // 使用 React.createElement 支持动态标签
  return React.createElement(
    Tag,
    {
      ref: elRef,
      className,
      onPointerMove: handlePointerMove,
      onPointerLeave: handlePointerLeave, // 修复：使用标准事件名
      onPointerEnter: startRAF,
      style: {
        display: 'inline-block',
        willChange: 'transform',
        ...style,
      },
      ...props,
    },
    children
  );
}
