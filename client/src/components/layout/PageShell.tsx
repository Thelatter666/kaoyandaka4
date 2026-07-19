import React from 'react';

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: number;
}

export function PageShell({ children, maxWidth = 1200 }: PageShellProps) {
  return (
    <main
      id="main-content"
      style={{
        flex: 1,
        maxWidth,
        margin: '0 auto',
        padding: 'var(--space-section-gap) var(--space-lg)',
        width: '100%',
      }}
    >
      {children}
    </main>
  );
}
