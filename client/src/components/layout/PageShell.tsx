import React from 'react';
import './PageShell.css';

interface PageShellProps {
  children: React.ReactNode;
  /** v2 可选页头：宋体 30px 标题（设计文档 12.3），不传则保持旧行为 */
  title?: string;
  /** v2 可选页头：14px secondary 副文案 */
  subtitle?: string;
  /** v2 可选页头：右侧操作槽 */
  actions?: React.ReactNode;
  maxWidth?: number;
}

export function PageShell({ children, title, subtitle, actions, maxWidth = 1200 }: PageShellProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined;
  return (
    <main
      id="main-content"
      className="page-shell"
      style={{ maxWidth }}
    >
      {hasHeader && (
        <header className="page-header">
          <div className="page-header__text">
            {title !== undefined && <h1 className="page-header__title">{title}</h1>}
            {subtitle !== undefined && <p className="page-header__subtitle">{subtitle}</p>}
          </div>
          {actions !== undefined && (
            <div className="page-header__actions">{actions}</div>
          )}
        </header>
      )}
      {children}
    </main>
  );
}
