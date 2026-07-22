import React, { useRef } from 'react';
import { m, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * S2-1 番茄钟（设计文档 §4/§5）：sticky 钉屏，SVG 圆环进度绑定滚动进度，
 * 复刻 RingCountdown 视觉（glass-2 圆盘 + 12px 进度环 + 中心时间）。
 * 滚动区间 [0.1, 0.8] 映射圆环 0 → 75%（演示一场进行中的专注）。
 * reduced-motion：静态呈现 75% 环，钉屏布局由 CSS 媒体查询解除。
 */

const CENTER = 180;
const RADIUS = 160;
/** 演示目标进度 */
const DEMO_PROGRESS = 0.75;

export function FeaturePomodoroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const pathLength = useTransform(scrollYProgress, [0.1, 0.8], [0, DEMO_PROGRESS]);
  const copyOpacity = useTransform(scrollYProgress, [0.05, 0.25], [0, 1]);
  const copyY = useTransform(scrollYProgress, [0.05, 0.25], [40, 0]);
  const discScale = useTransform(scrollYProgress, [0, 0.25], [0.9, 1]);

  return (
    <section
      ref={sectionRef}
      className="landing-feature landing-feature--pinned"
      aria-labelledby="landing-pomodoro-title"
    >
      <div className="landing-feature__sticky">
        <div className="landing-feature__grid">
          <m.div
            className="landing-feature__visual"
            style={reducedMotion ? undefined : { scale: discScale }}
          >
            <div className="landing-pomodoro__disc glass-2">
              <svg viewBox="0 0 360 360" aria-hidden="true" focusable="false">
                {/* 底环：同色浅底（令牌） */}
                <circle
                  className="landing-pomodoro__base"
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={12}
                />
                {/* 进度环：12 点起笔顺时针，pathLength 绑定滚动 */}
                <m.circle
                  className="landing-pomodoro__progress"
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={12}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${CENTER} ${CENTER})`}
                  style={reducedMotion ? { pathLength: DEMO_PROGRESS } : { pathLength }}
                />
              </svg>
              <div className="landing-pomodoro__center">
                <span className="landing-pomodoro__time">25:00</span>
                <span className="landing-pomodoro__mode">专注中</span>
              </div>
            </div>
          </m.div>

          <m.div
            className="landing-feature__copy"
            style={reducedMotion ? undefined : { opacity: copyOpacity, y: copyY }}
          >
            <p className="landing-feature__eyebrow">番茄钟</p>
            <h2 id="landing-pomodoro-title" className="landing-feature__title">
              把专注变成一场可量化的仪式
            </h2>
            <p className="landing-feature__desc">
              环形倒计时贴合心流节奏，四轮之后自动进入长休息。
              每一次开始与结束，都被妥帖记录。
            </p>
          </m.div>
        </div>
      </div>
    </section>
  );
}
