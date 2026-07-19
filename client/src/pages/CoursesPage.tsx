import React from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';

interface CoursesPageProps {
  navigate: (hash: string) => void;
}

export function CoursesPage(_props: CoursesPageProps) {
  return (
    <PageShell>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-lg)' }}>
        📺 网课管理
      </h2>
      <Card>
        <p style={{ color: 'var(--color-text-secondary)' }}>网课页面将在后续阶段实现</p>
      </Card>
    </PageShell>
  );
}
