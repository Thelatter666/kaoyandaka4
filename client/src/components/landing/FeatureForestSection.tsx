import React, { useRef } from 'react';
import { m, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { TreePine, TreeBroadleaf, TreeFruit, TreeWillow } from '../forest/trees';

/**
 * S2-2 学习森林（设计文档 §4/§5）：四棵树随滚动依次「生长」，
 * 复用 forest/trees 组件（数学松 / 英语阔叶 / 408 果树 / 漫游垂柳）。
 * scale + opacity + y 绑定滚动进度；reduced-motion 下全尺寸静态呈现。
 */

interface GrowingTreeProps {
  progress: MotionValue<number>;
  /** 该树在滚动进度中的生长区间 */
  range: [number, number];
  reduced: boolean;
  label: string;
  children: React.ReactNode;
}

function GrowingTree({ progress, range, reduced, label, children }: GrowingTreeProps) {
  const scale = useTransform(progress, range, [0.3, 1]);
  const opacity = useTransform(progress, range, [0, 1]);
  const y = useTransform(progress, range, [40, 0]);

  return (
    <m.figure
      className="landing-forest__tree"
      style={reduced ? undefined : { scale, opacity, y }}
    >
      {children}
      <m.figcaption className="landing-forest__label">{label}</m.figcaption>
    </m.figure>
  );
}

export function FeatureForestSection() {
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
      aria-labelledby="landing-forest-title"
    >
      <div className="landing-feature__grid landing-feature__grid--reverse">
        <m.div
          className="landing-feature__copy"
          style={reducedMotion ? undefined : { opacity: copyOpacity, y: copyY }}
        >
          <p className="landing-feature__eyebrow">学习森林</p>
          <h2 id="landing-forest-title" className="landing-feature__title">
            每一小时专注，都长成一棵树
          </h2>
          <p className="landing-feature__desc">
            数学松、英语阔叶、408 果树——三科独立生长，漫游专注亦有所属。
            日、周、月三重视角，见证你的森林郁郁成林。
          </p>
        </m.div>

        <div className="landing-feature__visual">
          <div className="landing-forest glass-1">
            <GrowingTree progress={scrollYProgress} range={[0.15, 0.4]} reduced={!!reducedMotion} label="数学">
              <TreePine />
            </GrowingTree>
            <GrowingTree progress={scrollYProgress} range={[0.3, 0.55]} reduced={!!reducedMotion} label="英语">
              <TreeBroadleaf />
            </GrowingTree>
            <GrowingTree progress={scrollYProgress} range={[0.45, 0.7]} reduced={!!reducedMotion} label="408">
              <TreeFruit />
            </GrowingTree>
            <GrowingTree progress={scrollYProgress} range={[0.6, 0.85]} reduced={!!reducedMotion} label="漫游">
              <TreeWillow />
            </GrowingTree>
          </div>
        </div>
      </div>
    </section>
  );
}
