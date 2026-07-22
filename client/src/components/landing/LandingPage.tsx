import React from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { PainPointSection } from './PainPointSection';
import { FeaturePomodoroSection } from './FeaturePomodoroSection';
import { FeatureForestSection } from './FeatureForestSection';
import { FeatureCourseSection } from './FeatureCourseSection';
import { FeatureTaskSection } from './FeatureTaskSection';
import { StatsSection } from './StatsSection';
import { ScreenshotsSection } from './ScreenshotsSection';
import { StepsSection } from './StepsSection';
import { CtaFooterSection } from './CtaFooterSection';
import './LandingPage.css';

/**
 * 滚动式介绍页（设计文档《滚动式介绍页设计》）
 *
 * 7 屏叙事：S0 Hero → S1 痛点 → S2 功能×4 → S3 数据 → S4 实拍 → S5 三步走 → S6 CTA。
 * LazyMotion + domAnimation 按需加载动效运行时；MotionConfig reducedMotion="user"
 * 自动禁用 transform 类动画（opacity 淡入保留），滚动驱动部分在各组件内手动降级。
 */
export function LandingPage() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="landing">
          <LandingNav />
          <main id="main-content">
            <HeroSection />
            <PainPointSection />
            <FeaturePomodoroSection />
            <FeatureForestSection />
            <FeatureCourseSection />
            <FeatureTaskSection />
            <StatsSection />
            <ScreenshotsSection />
            <StepsSection />
            <CtaFooterSection />
          </main>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
