import React from 'react';
import { m } from 'framer-motion';

/**
 * S1 痛点过渡屏（设计文档 §4）：一句话情感共鸣，滚动进入视口时淡入上移。
 */
export function PainPointSection() {
  return (
    <section id="landing-painpoint" className="landing-painpoint" aria-label="产品理念">
      <m.blockquote
        className="landing-painpoint__quote"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        考研是场持久战。
        <br />
        你需要的不只是意志力，更是一套
        <span className="landing-painpoint__em">让努力可见</span>的系统。
      </m.blockquote>
    </section>
  );
}
