import React, { useEffect, useRef } from 'react';
import { m, animate, useInView, useReducedMotion } from 'framer-motion';

/**
 * S3 数据机制（设计文档 §4/§5）：进入视口时数字滚动计数。
 * reduced-motion 下直接显示终值。
 */

interface CountUpProps {
  to: number;
  reduced: boolean;
}

function CountUp({ to, reduced }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });

  useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(0, to, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) {
          ref.current.textContent = String(Math.round(v));
        }
      },
    });
    return () => controls.stop();
  }, [inView, reduced, to]);

  return <span ref={ref}>{reduced ? to : 0}</span>;
}

const STATS = [
  { value: 60, unit: '分钟', desc: '专注 1 小时，种活 1 棵树' },
  { value: 4, unit: '轮', desc: '第 4 轮番茄后，自动进入长休息' },
  { value: 3, unit: '科目', desc: '数学 / 英语 / 408，独立追踪生长' },
] as const;

export function StatsSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="landing-stats" aria-label="产品机制">
      <div className="landing-stats__grid">
        {STATS.map((stat) => (
          <m.div
            key={stat.unit}
            className="landing-stats__card glass-1"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="landing-stats__number">
              <CountUp to={stat.value} reduced={!!reducedMotion} />
              <span className="landing-stats__unit">{stat.unit}</span>
            </p>
            <p className="landing-stats__desc">{stat.desc}</p>
          </m.div>
        ))}
      </div>
    </section>
  );
}
