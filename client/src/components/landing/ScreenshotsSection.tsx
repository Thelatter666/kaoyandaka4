import React, { useRef } from 'react';
import { m, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * S4 界面实拍（设计文档 §4/§5）：真实 UI 截图多层视差。
 * 截图为 Playwright 实拍产物（见 e2e/take-landing-screenshots.mjs，
 * 经 e2e/compress-screenshots.mjs 压缩为 WebP），
 * 存放于 client/public/screenshots/，懒加载 + 完整 alt。
 * reduced-motion 下取消视差，静态平铺。
 */

const SHOTS = [
  { src: '/screenshots/home.webp', alt: '砚台考研打卡首页：考试倒计时与今日专注摘要', caption: '首页 · 今日概览' },
  { src: '/screenshots/pomodoro.webp', alt: '番茄钟页面：砚池墨面倒计时', caption: '番茄钟 · 砚池' },
  { src: '/screenshots/statistics.webp', alt: '统计页面：学习森林玻璃花房', caption: '统计 · 学习森林' },
] as const;

export function ScreenshotsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  /* 三层视差：左右两张与中间一张移动速度不同（仅 translateY） */
  const ySlow = useTransform(scrollYProgress, [0, 1], [48, -48]);
  const yFast = useTransform(scrollYProgress, [0, 1], [96, -96]);

  const speeds = [yFast, ySlow, yFast];

  return (
    <section
      ref={sectionRef}
      className="landing-screenshots"
      aria-labelledby="landing-shots-title"
    >
      <m.h2
        id="landing-shots-title"
        className="landing-section-title"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        真实界面，所见即所得
      </m.h2>

      <div className="landing-screenshots__row">
        {SHOTS.map((shot, i) => (
          <m.figure
            key={shot.src}
            className="landing-screenshots__item glass-1"
            style={reducedMotion ? undefined : { y: speeds[i] }}
          >
            {/* width/height 按 webp 实际像素（1280x800）声明，消除懒加载带来的 CLS */}
            <img src={shot.src} alt={shot.alt} loading="lazy" width={1280} height={800} />
            <figcaption className="landing-screenshots__caption">{shot.caption}</figcaption>
          </m.figure>
        ))}
      </div>
    </section>
  );
}
