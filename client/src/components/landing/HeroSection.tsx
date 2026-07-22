import React from 'react';
import { m, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { getDaysRemaining } from '../../utils/date';

/**
 * S0 Hero：品牌 + Slogan + 考研倒计时 + CTA（设计文档 §4）。
 * stagger 淡入上移入场；滚动提示箭头呼吸浮动（reduced-motion 下静止）。
 */

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

/*
 * 缓动与 --ease-out（cubic-bezier(0.22, 1, 0.36, 1)）一致。
 * initial opacity 取 0.01 而非 0：元素首帧即可绘制，避免 LCP 被入场动画拖后
 * （0.01 与全透明视觉无差，动画表现不变）。
 */
const itemVariants: Variants = {
  hidden: { opacity: 0.01, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

export function HeroSection() {
  const reducedMotion = useReducedMotion();
  const days = getDaysRemaining();

  const scrollToNext = () => {
    document
      .getElementById('landing-painpoint')
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <section className="landing-hero" aria-labelledby="landing-hero-title">
      <m.div
        className="landing-hero__inner"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <m.p variants={itemVariants} className="landing-hero__badge">
          距离 2026 考研还有 <strong>{days}</strong> 天
        </m.p>
        <m.h1 variants={itemVariants} id="landing-hero-title" className="landing-hero__title">
          砚台
        </m.h1>
        <m.p variants={itemVariants} className="landing-hero__slogan">
          把漫长的备考，沉淀为可见的进步
        </m.p>
        <m.p variants={itemVariants} className="landing-hero__sub">
          番茄钟 · 学习森林 · 网课管理 · 计划打卡
          <br />
          考研人的一站式学习管理工具
        </m.p>
        <m.div variants={itemVariants} className="landing-hero__cta">
          <Button variant="primary" size="lg" onClick={() => { window.location.hash = '#/register'; }}>
            免费开始
          </Button>
          <Button variant="glass" size="lg" onClick={scrollToNext}>
            了解更多
          </Button>
        </m.div>
      </m.div>

      <m.button
        type="button"
        className="landing-hero__scrollhint"
        onClick={scrollToNext}
        aria-label="向下滚动，了解更多"
        animate={reducedMotion ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ChevronDown size={24} strokeWidth={1.75} aria-hidden="true" />
      </m.button>
    </section>
  );
}
