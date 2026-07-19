import React from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';

export function StatisticsPage() {
  return (
    <PageShell>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-lg)' }}>
        🌳 学习森林
      </h2>
      <Card>
        <p style={{ color: 'var(--color-text-secondary)' }}>统计页面将在后续阶段实现</p>
      </Card>
    </PageShell>
  );
}
