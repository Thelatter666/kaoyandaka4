import React from 'react';
import './PageShell.css';

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: number;
}

export function PageShell({ children, maxWidth = 1120 }: PageShellProps) {
  return (
    <main
      id="main-content"
      className="page-shell"
      style={{ maxWidth }}
    >
      {children}
    </main>
  );
}
