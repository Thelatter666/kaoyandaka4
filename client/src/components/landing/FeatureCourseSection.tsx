import React, { useRef } from 'react';
import { m, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { ListVideo, Clock } from 'lucide-react';

/**
 * S2-3 网课管理（设计文档 §4/§5）：双进度条随滚动填充。
 * 填充用 scaleX（origin-left）驱动，严格遵守「只动 transform/opacity」规范，
 * 不复用 ProgressBar（其 width 过渡在此场景不符合规范）。
 * 演示数据：集数 68/96、时长 42.5/60 小时。
 */

interface FillBarProps {
  progress: MotionValue<number>;
  /** 滚动进度映射区间 */
  range: [number, number];
  /** 演示完成度（0-1）：滚动终点与 reduced-motion 静态值共用 */
  finalScale: number;
  reduced: boolean;
  /** 填充渐变（令牌引用，由 CSS 类提供） */
  fillClassName: string;
  icon: React.ReactNode;
  label: string;
}

function FillBar({ progress, range, finalScale, reduced, fillClassName, icon, label }: FillBarProps) {
  const scaleX = useTransform(progress, range, [0, finalScale]);
  return (
    <div className="landing-course__bar">
      <div className="landing-course__bar-label">
        <span className="landing-course__bar-icon" aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div className="landing-course__track">
        <m.div
          className={`landing-course__fill ${fillClassName}`}
          style={reduced ? { scaleX: finalScale } : { scaleX }}
        />
      </div>
    </div>
  );
}

export function FeatureCourseSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end end'],
  });

  const copyOpacity = useTransform(scrollYProgress, [0, 0.2], [0, 1]);
  const copyY = useTransform(scrollYProgress, [0, 0.2], [40, 0]);

  return (
    <section
      ref={sectionRef}
      className="landing-feature"
      aria-labelledby="landing-course-title"
    >
      <div className="landing-feature__grid">
        <div className="landing-feature__visual">
          <div className="landing-course glass-1">
            <p className="landing-course__name">张宇高等数学 18 讲</p>
            <FillBar
              progress={scrollYProgress}
              range={[0.2, 0.65]}
              finalScale={68 / 96}
              reduced={!!reducedMotion}
              fillClassName="landing-course__fill--episodes"
              icon={<ListVideo size={14} strokeWidth={1.75} />}
              label="集数 68/96"
            />
            <FillBar
              progress={scrollYProgress}
              range={[0.3, 0.75]}
              finalScale={42.5 / 60}
              reduced={!!reducedMotion}
              fillClassName="landing-course__fill--duration"
              icon={<Clock size={14} strokeWidth={1.75} />}
              label="时长 42.5h/60h"
            />
          </div>
        </div>

        <m.div
          className="landing-feature__copy"
          style={reducedMotion ? undefined : { opacity: copyOpacity, y: copyY }}
        >
          <p className="landing-feature__eyebrow">网课管理</p>
          <h2 id="landing-course-title" className="landing-feature__title">
            网课进度，一眼看清
          </h2>
          <p className="landing-feature__desc">
            七分区归类管理，粘贴文本即可导入整个课程。
            集数与时长双进度条，剩下多少，心里始终有数。
          </p>
        </m.div>
      </div>
    </section>
  );
}
