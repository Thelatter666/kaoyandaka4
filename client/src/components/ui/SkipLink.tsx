import React from 'react';

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="glass-2"
      style={{
        position: 'absolute',
        top: -100,
        left: 16,
        padding: 'var(--space-sm) var(--space-md)',
        color: 'var(--color-text-primary)',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-medium)',
        zIndex: 'var(--z-tooltip)',
        textDecoration: 'none',
        transition: 'top var(--dur-fast) var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.top = '8px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.top = '-100px';
      }}
    >
      跳至主内容
    </a>
  );
}
