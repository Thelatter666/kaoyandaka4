import React from 'react';
import { m } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * S2-4 计划打卡（设计文档 §4/§5）：任务列表随滚动逐条入场，
 * 勾选标记依次 scale in（仅 transform/opacity）。
 * 科目色点引用 --color-subject-* 令牌，与 SubjectBadge 色彩语言一致。
 */

const DEMO_TASKS = [
  { subjectClass: 'landing-task__dot--math', subject: '数学', text: '张宇 18 讲 · 第 3 章习题' },
  { subjectClass: 'landing-task__dot--english', subject: '英语', text: '红宝书 Unit 12 复习' },
  { subjectClass: 'landing-task__dot--408', subject: '408', text: '数据结构 · 图的遍历' },
] as const;

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const taskVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const checkVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  show: {
    scale: 1,
    opacity: 1,
    transition: { delay: 0.3, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] },
  },
};

export function FeatureTaskSection() {
  return (
    <section className="landing-feature" aria-labelledby="landing-task-title">
      <div className="landing-feature__grid landing-feature__grid--reverse">
        <m.div
          className="landing-feature__copy"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="landing-feature__eyebrow">计划打卡</p>
          <h2 id="landing-task-title" className="landing-feature__title">
            今日事，今日毕
          </h2>
          <p className="landing-feature__desc">
            每日任务清单配上晚间复盘，完成一项勾掉一项。
            让每一天，都有始有终。
          </p>
        </m.div>

        <div className="landing-feature__visual">
          <m.ul
            className="landing-task"
            variants={listVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            {DEMO_TASKS.map((task) => (
              <m.li key={task.text} className="landing-task__item glass-1" variants={taskVariants}>
                <m.span className="landing-task__check" variants={checkVariants} aria-hidden="true">
                  <Check size={14} strokeWidth={2.5} />
                </m.span>
                <span className={`landing-task__dot ${task.subjectClass}`} aria-hidden="true" />
                <span className="landing-task__text">{task.text}</span>
                <span className="landing-task__subject">{task.subject}</span>
              </m.li>
            ))}
          </m.ul>
        </div>
      </div>
    </section>
  );
}
