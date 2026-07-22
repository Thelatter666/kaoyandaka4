import React from 'react';
import { m } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { UserPlus, SlidersHorizontal, Timer } from 'lucide-react';

/**
 * S5 三步走（设计文档 §4/§5）：注册 → 创建预设 → 开始专注。
 * whileInView stagger 入场，降低新用户上手门槛。
 */

const STEPS = [
  {
    icon: UserPlus,
    step: '01',
    title: '注册账号',
    desc: '一分钟创建账号，数据云端同步',
  },
  {
    icon: SlidersHorizontal,
    step: '02',
    title: '创建学习预设',
    desc: '按数学 / 英语 / 408 设定你的专注时长',
  },
  {
    icon: Timer,
    step: '03',
    title: '开始第一次专注',
    desc: '种下属于你的第一棵树',
  },
] as const;

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export function StepsSection() {
  return (
    <section className="landing-steps" aria-labelledby="landing-steps-title">
      <m.h2
        id="landing-steps-title"
        className="landing-section-title"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        三步，开始沉淀
      </m.h2>

      <m.ol
        className="landing-steps__grid"
        variants={gridVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        {STEPS.map((item) => {
          const Icon = item.icon;
          return (
            <m.li key={item.step} className="landing-steps__card glass-1" variants={cardVariants}>
              <span className="landing-steps__step" aria-hidden="true">
                {item.step}
              </span>
              <span className="landing-steps__icon" aria-hidden="true">
                <Icon size={28} strokeWidth={1.75} />
              </span>
              <h3 className="landing-steps__card-title">{item.title}</h3>
              <p className="landing-steps__card-desc">{item.desc}</p>
            </m.li>
          );
        })}
      </m.ol>
    </section>
  );
}
