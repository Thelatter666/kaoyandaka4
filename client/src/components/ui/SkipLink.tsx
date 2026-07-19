import React from 'react';

export function SkipLink() {
  return (
    <a
      href="#main-content"
      style={{
        position: 'absolute',
        top: -100,
        left: 16,
        padding: 'var(--space-sm) var(--space-md)',
        backgroundColor: 'var(--color-accent-primary)',
        color: 'var(--color-text-inverse)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-sm)',
        fontWeight: 500,
        zIndex: 'var(--z-tooltip)',
        textDecoration: 'none',
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
