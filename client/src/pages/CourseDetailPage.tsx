import React from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';

interface CourseDetailPageProps {
  courseId: string;
}

export function CourseDetailPage({ courseId }: CourseDetailPageProps) {
  return (
    <PageShell>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-lg)' }}>
        📖 课程详情
      </h2>
      <Card>
        <p style={{ color: 'var(--color-text-secondary)' }}>课程详情页面将在后续阶段实现 (ID: {courseId})</p>
      </Card>
    </PageShell>
  );
}
