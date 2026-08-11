import React from 'react';
import {
  Home,
  ClipboardList,
  SlidersHorizontal,
  Timer,
  MonitorPlay,
  NotebookPen,
  Trees,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { ThemeToggle } from '../ui/ThemeToggle';
import { showToast } from '../ui/Toast';
import { logoutAuth } from '../../hooks/useAuth';
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
  { label: '复盘', hash: '#/review', icon: NotebookPen },
];

interface TopNavProps {
  activeHash: string;
  onNavigate: (hash: string) => void;
  /** hover/focus 导航项时预取目标页面 chunk，点击切换零等待 */
  onPrefetch?: (hash: string) => void;
}

export function TopNav({ activeHash, onNavigate, onPrefetch }: TopNavProps) {
  const reducedMotion = useReducedMotion();
  const [loggingOut, setLoggingOut] = React.useState(false);

  /* 退出登录（账号系统 T2.4）：销毁服务端会话并清空全局登录态，
     App 随即回落到未登录分支（介绍页） */
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logoutAuth();
    showToast('success', '已退出登录');
  };

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

      {/* 中：6 项导航 + 灯管指示器（tubelight：layoutId 弹簧滑动 + 顶部发光灯管，
          活动项渲染在链接内部，切换时 framer 共享布局动画平滑移动） */}
      <div className="top-nav__links">
        {NAV_ITEMS.map((item) => {
          const isActive = activeHash === item.hash;
          const Icon = item.icon;
          return (
            <a
              key={item.hash}
              href={item.hash}
              onClick={(e) => { e.preventDefault(); onNavigate(item.hash); }}
              onMouseEnter={() => onPrefetch?.(item.hash)}
              onFocus={() => onPrefetch?.(item.hash)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className="top-nav__link"
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="top-nav__link-label" aria-hidden="true">{item.label}</span>
              {isActive && (
                <motion.span
                  layoutId="lamp"
                  className="top-nav__lamp"
                  aria-hidden="true"
                  initial={false}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 300, damping: 30 }
                  }
                >
                  <span className="top-nav__lamp-tube">
                    <span className="top-nav__lamp-glow top-nav__lamp-glow--lg" />
                    <span className="top-nav__lamp-glow top-nav__lamp-glow--md" />
                    <span className="top-nav__lamp-glow top-nav__lamp-glow--sm" />
                  </span>
                </motion.span>
              )}
            </a>
          );
        })}
      </div>

      {/* 右：主题切换 + 退出登录 */}
      <div className="top-nav__actions">
        <ThemeToggle />
        <button
          type="button"
          className="top-nav__logout glass-1"
          onClick={() => { void handleLogout(); }}
          disabled={loggingOut}
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
