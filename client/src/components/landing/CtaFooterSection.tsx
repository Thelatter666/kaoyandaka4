import React from 'react';
import { m } from 'framer-motion';
import { Button } from '../ui/Button';
import { getDaysRemaining } from '../../utils/date';

/**
 * S6 底部 CTA + footer（设计文档 §4）：倒计时重申 + 注册按钮收口。
 * footer 预留 ICP 备案号位置（上线后填写，国内法规要求悬挂）。
 */
export function CtaFooterSection() {
  const days = getDaysRemaining();

  return (
    <section className="landing-cta" aria-labelledby="landing-cta-title">
      <m.div
        className="landing-cta__inner"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 id="landing-cta-title" className="landing-cta__title">
          距离 2026 考研还有 <strong>{days}</strong> 天
        </h2>
        <p className="landing-cta__sub">从今天开始沉淀。</p>
        {/* TODO(账号系统)：接通注册流程 */}
        <Button variant="primary" size="lg" onClick={() => {}}>
          免费开始
        </Button>
      </m.div>

      <footer className="landing-footer">
        <p className="landing-footer__line">© 2026 砚台考研打卡 · 让努力可见</p>
        {/* TODO(上线)：备案通过后在此悬挂 ICP 备案号（国内法规要求） */}
        <p className="landing-footer__icp" aria-hidden="true" />
      </footer>
    </section>
  );
}
