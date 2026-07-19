import React from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';

interface NavItem {
  label: string;
  hash: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: '首页', hash: '#/', icon: '🏠' },
  { label: '计划', hash: '#/plan', icon: '📋' },
  { label: '预设', hash: '#/presets', icon: '⚙️' },
  { label: '番茄钟', hash: '#/pomodoro', icon: '🍅' },
  { label: '网课', hash: '#/courses', icon: '📺' },
  { label: '统计', hash: '#/statistics', icon: '🌳' },
];

interface TopNavProps {
  activeHash: string;
  onNavigate: (hash: string) => void;
}

export function TopNav({ activeHash, onNavigate }: TopNavProps) {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'var(--color-bg-page)',
        borderBottom: '1px solid var(--color-border-light)',
        backdropFilter: 'blur(8px)',
      }}
      aria-label="主导航"
    >
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 var(--space-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 'var(--nav-height)',
      }}>
        {/* Logo */}
        <a
          href="#/"
          onClick={(e) => { e.preventDefault(); onNavigate('#/'); }}
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          砚台考研
        </a>

        {/* Desktop Nav Items */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xs)',
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeHash === item.hash;
            return (
              <a
                key={item.hash}
                href={item.hash}
                onClick={(e) => { e.preventDefault(); onNavigate(item.hash); }}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-nav)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                  backgroundColor: isActive ? 'var(--color-accent-primary)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 'var(--text-base)' }}>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </a>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
