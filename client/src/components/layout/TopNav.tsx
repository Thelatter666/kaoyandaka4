import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Home,
  ClipboardList,
  SlidersHorizontal,
  Timer,
  MonitorPlay,
  Trees,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
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
];

interface TopNavProps {
  activeHash: string;
  onNavigate: (hash: string) => void;
}

interface IndicatorState {
  x: number;
  w: number;
  visible: boolean;
}

export function TopNav({ activeHash, onNavigate }: TopNavProps) {
  const linksRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [indicator, setIndicator] = useState<IndicatorState>({ x: 0, w: 0, visible: false });
  /* 首帧定位完成后才启用滑动过渡，避免初始从左侧飞入 */
  const [animated, setAnimated] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  /* 退出登录（账号系统 T2.4）：销毁服务端会话并清空全局登录态，
     App 随即回落到未登录分支（介绍页） */
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logoutAuth();
    showToast('success', '已退出登录');
  };

  useLayoutEffect(() => {
    const container = linksRef.current;
    if (!container) return;

    const update = () => {
      const active = linkRefs.current.get(activeHash);
      if (!active) {
        setIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      setIndicator({ x: active.offsetLeft, w: active.offsetWidth, visible: true });
    };

    update();
    const raf = requestAnimationFrame(() => setAnimated(true));

    /* 视口/字体加载导致链接位置变化时重新定位 */
    const ro = new ResizeObserver(update);
    ro.observe(container);
    linkRefs.current.forEach((el) => ro.observe(el));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [activeHash]);

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

      {/* 中：6 项导航 + 滑动指示器（高亮胶囊随当前页滑动） */}
      <div className="top-nav__links" ref={linksRef}>
        <span
          className={`top-nav__indicator${animated ? ' top-nav__indicator--animated' : ''}`}
          style={{
            transform: `translateX(${indicator.x}px)`,
            width: indicator.w,
            opacity: indicator.visible ? 1 : 0,
          }}
          aria-hidden="true"
        />
        {NAV_ITEMS.map((item) => {
          const isActive = activeHash === item.hash;
          const Icon = item.icon;
          return (
            <a
              key={item.hash}
              href={item.hash}
              ref={(el) => {
                if (el) linkRefs.current.set(item.hash, el);
                else linkRefs.current.delete(item.hash);
              }}
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
