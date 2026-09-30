import React from 'react';
import { LazyMotion, MotionConfig } from 'framer-motion';
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
import { useShouldReduceMotion } from '../../hooks/usePowerSave';
import './LandingPage.css';

/**
 * 滚动式介绍页（设计文档《滚动式介绍页设计》）
 *
 * 7 屏叙事：S0 Hero → S1 痛点 → S2 功能×4 → S3 数据 → S4 实拍 → S5 三步走 → S6 CTA。
 * LazyMotion 动效特性包动态加载（不随首屏同步打包）；MotionConfig 自动禁用
 * transform 类动画（opacity 淡入保留）：系统偏好走 "user"，节能模式走 "always"
 * （滚动视差是介绍页最重的每帧开销，节能模式下必须停）。
 * 注意 MotionConfig 内层覆盖外层，故此处必须自己感知节能模式。
 */
const loadFeatures = () => import('framer-motion').then((m) => m.domAnimation);

export function LandingPage() {
  const shouldReduceMotion = useShouldReduceMotion();

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion={shouldReduceMotion ? 'always' : 'user'}>
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
