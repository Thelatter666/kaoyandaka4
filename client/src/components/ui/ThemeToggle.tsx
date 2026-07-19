import React from 'react';
import { useTheme } from '../../hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? '切换到浅色主题' : '切换到深色主题'}
      title={isDark ? '切换到浅色主题' : '切换到深色主题'}
      style={{
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '1.25rem',
        color: 'var(--color-text-secondary)',
        transition: 'all var(--transition-fast)',
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
