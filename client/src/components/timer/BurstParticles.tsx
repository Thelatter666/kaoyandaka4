import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 完成粒子爆散（设计文档 5.1.7）
 *
 * 会话自然结束 / 提前完成时，在父容器（需 position: relative）中心触发
 * 一次轻量 canvas 粒子爆散：≤20 粒子、模式色、重力 + 淡出，1.2s 后销毁
 * canvas。取消 / 休息结束不触发（由使用方控制 burstKey 不递增即可）。
 * prefers-reduced-motion 直接跳过；组件卸载时清理 animation frame 与定时器。
 *
 * 触发方式：burstKey 从 0 开始递增，每次递增触发一次爆散（0 不触发）。
 */

interface BurstParticlesProps {
  /** 触发键：递增触发一次爆散；初始值 0 不触发 */
  burstKey: number;
  /** 粒子颜色来源的 CSS 自定义属性名，运行时解析以正确跟随双主题 */
  colorVar?: string;
}

/** 粒子数量上限（设计文档：≤20） */
const PARTICLE_COUNT = 18;
/** 爆散总时长：1.2s 后销毁 canvas */
const DURATION_MS = 1200;
/** 重力加速度（px/s²） */
const GRAVITY = 380;
/** 初速度范围（px/s） */
const SPEED_MIN = 120;
const SPEED_MAX = 320;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export function BurstParticles({ burstKey, colorVar = '--color-accent-primary' }: BurstParticlesProps) {
  const [active, setActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // burstKey 递增 → 触发一次爆散；reduced-motion 跳过
  useEffect(() => {
    if (burstKey <= 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setActive(true);
  }, [burstKey]);

  // active 后挂载 canvas 并驱动粒子动画，1.2s 后销毁
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setActive(false);
      return;
    }
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    if (!ctx || !parent) {
      setActive(false);
      return;
    }

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.scale(dpr, dpr);

    // 运行时解析模式色（CSS 变量无法直接赋给 fillStyle）
    const resolvedColor =
      getComputedStyle(canvas).getPropertyValue(colorVar).trim() ||
      getComputedStyle(canvas).color;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
      return {
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60, // 略微上抛，重力回落
        radius: 2 + Math.random() * 2,
      };
    });

    let startTs: number | null = null;
    let lastTs: number | null = null;

    const frame = (ts: number) => {
      if (startTs === null) {
        startTs = ts;
        lastTs = ts;
      }
      const elapsed = ts - startTs;
      const dt = Math.min(0.05, (ts - (lastTs ?? ts)) / 1000);
      lastTs = ts;
      const t = elapsed / DURATION_MS;

      ctx.clearRect(0, 0, rect.width, rect.height);
      if (t >= 1) {
        setActive(false);
        return;
      }

      ctx.fillStyle = resolvedColor;
      ctx.globalAlpha = Math.max(0, 1 - t);
      for (const p of particles) {
        p.vy += GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.radius * (1 - t * 0.4)), 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    // 卸载 / 重新触发时清理 animation frame
    return () => {
      stopAnimation();
    };
  }, [active, colorVar, stopAnimation]);

  // 组件卸载兜底清理
  useEffect(() => stopAnimation, [stopAnimation]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
