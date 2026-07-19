import React from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';

export function PlanPage() {
  return (
    <PageShell>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-lg)' }}>
        📋 每日计划与复盘
      </h2>
      <Card>
        <p style={{ color: 'var(--color-text-secondary)' }}>计划页面将在后续阶段实现</p>
      </Card>
    </PageShell>
  );
}
