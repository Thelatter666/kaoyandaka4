import React from 'react';
import {
  Home,
  ClipboardList,
  SlidersHorizontal,
  Timer,
  MonitorPlay,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import './TopNav.css';

interface NavItem {
  label: string;
  hash: string;
  icon: LucideIcon;
}

/* 导航图标映射（设计文档 4.3）：emoji 全部替换为 lucide，16px / stroke 1.75 */
const NAV_ITEMS: NavItem[] = [
  { label: '首页', hash: '#/', icon: Home },
  { label: '计划', hash: '#/plan', icon: ClipboardList },
  { label: '预设', hash: '#/presets', icon: SlidersHorizontal },
  { label: '番茄钟', hash: '#/pomodoro', icon: Timer },
  { label: '网课', hash: '#/courses', icon: MonitorPlay },
  { label: '统计', hash: '#/statistics', icon: Trees },
];

interface TopNavProps {
  activeHash: string;
  onNavigate: (hash: string) => void;
}

export function TopNav({ activeHash, onNavigate }: TopNavProps) {
  return (
    <nav className="top-nav glass-2" aria-label="主导航">
      {/* 左：品牌 */}
      <a
        href="#/"
        className="top-nav__brand"
        onClick={(e) => { e.preventDefault(); onNavigate('#/'); }}
      >
        砚台考研
      </a>

      {/* 中：6 项导航 */}
      <div className="top-nav__links">
        {NAV_ITEMS.map((item) => {
          const isActive = activeHash === item.hash;
          const Icon = item.icon;
          return (
            <a
              key={item.hash}
              href={item.hash}
              onClick={(e) => { e.preventDefault(); onNavigate(item.hash); }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className="top-nav__link"
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="top-nav__link-label" aria-hidden="true">{item.label}</span>
            </a>
          );
        })}
      </div>

      {/* 右：主题切换 */}
      <div className="top-nav__actions">
        <ThemeToggle />
      </div>
    </nav>
  );
}
