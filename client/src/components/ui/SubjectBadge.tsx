import React from 'react';
import { Sigma, BookA, Cpu, type LucideProps } from 'lucide-react';
import type { Subject, SubSubject } from '@shared/types';

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  '408': '408',
};

const SUB_SUBJECT_LABELS: Record<SubSubject, string> = {
  data_structure: '数据结构',
  computer_organization: '计算机组成',
  operating_system: '操作系统',
  computer_network: '计算机网络',
};

const SUBJECT_ICONS: Record<Subject, React.ComponentType<LucideProps>> = {
  math: Sigma,
  english: BookA,
  '408': Cpu,
};

interface SubjectBadgeProps {
  subject: Subject;
  subSubject?: SubSubject | null;
  size?: 'sm' | 'md';
}

export function SubjectBadge({ subject, subSubject, size = 'sm' }: SubjectBadgeProps) {
  const label = subSubject ? SUB_SUBJECT_LABELS[subSubject] : SUBJECT_LABELS[subject];
  const Icon = SUBJECT_ICONS[subject];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '2px 10px' : '4px 14px',
        borderRadius: 'var(--radius-full)',
        fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
        fontWeight: 'var(--font-medium)',
        backgroundColor: `var(--color-subject-${subject}-bg)`,
        color: `var(--color-subject-${subject})`,
        whiteSpace: 'nowrap',
        border: `1px solid var(--color-subject-${subject}-bg)`,
      }}
      aria-label={`科目：${SUBJECT_LABELS[subject]}${subSubject ? ` - ${SUB_SUBJECT_LABELS[subSubject]}` : ''}`}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </span>
  );
}
