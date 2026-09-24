import React, { useState } from 'react';
import {
  Home,
  ClipboardList,
  SlidersHorizontal,
  Timer,
  MonitorPlay,
  NotebookPen,
  Trees,
  Power,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { ThemeToggle } from '../ui/ThemeToggle';
import { ProfileDropdown } from '../ui/ProfileDropdown';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { showToast } from '../ui/Toast';
import { clearReviewUnlocked } from '../../utils/unlockMarker';
import { isLocalLauncherHost, powerOffSystem } from '../../utils/localPower';
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
  const [powerConfirmOpen, setPowerConfirmOpen] = useState(false);
  /** 浏览器拒绝脚本关窗时的兜底态：留在页面上明说「已关闭」 */
  const [poweredOff, setPoweredOff] = useState(false);

  /* 关闭系统：清复盘解锁标记（退出系统即离开「一次启动」，下次进入复盘需重输密码）
     → 通知本地监听器退出 → 关掉本标签页。监听器不在时给替代提示。 */
  const handlePowerOff = async () => {
    clearReviewUnlocked();
    if (!(await powerOffSystem())) {
      showToast('error', '无法关闭：本地启动器未在运行（可关闭终端窗口停止服务）');
      return;
    }
    window.close();
    // 非脚本打开的窗口会被浏览器拒绝关闭：400ms 后若本模块仍在执行，说明没关成
    window.setTimeout(() => setPoweredOff(true), 400);
  };

  return (
    <>
      <nav className="top-nav glass-2" aria-label="主导航">
        {/* 左：品牌 */}
        <a
          href="#/"
          className="top-nav__brand"
          onClick={(e) => { e.preventDefault(); onNavigate('#/'); }}
        >
          砚台考研
        </a>

        {/* 中：7 项导航 + 灯管指示器（tubelight：layoutId 弹簧滑动 + 顶部发光灯管，
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

        {/* 右：主题切换 + 账户菜单（导出数据 / 登出）+ 关闭系统（最右上角） */}
        <div className="top-nav__actions">
          <ThemeToggle />
          <ProfileDropdown />
          {isLocalLauncherHost() && (
            /* 与主题切换同造型的 44px 圆钮：文字标签会把胶囊撑破——导航条
               max-width 960px 是既有设计，内容实测需 973px，故此处只留图标，
               全称交给 title 与确认框 */
            <button
              type="button"
              className="top-nav__power glass-1"
              onClick={() => setPowerConfirmOpen(true)}
              aria-label="关闭系统"
              title="关闭系统（停止本地服务并关闭本页）"
            >
              <Power size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </nav>

      <ConfirmDialog
        isOpen={powerConfirmOpen}
        onClose={() => setPowerConfirmOpen(false)}
        onConfirm={handlePowerOff}
        title="关闭系统"
        message="将停止本地前后端服务并关闭本页。"
        detail="下次双击《砚台考研打卡.command》即可重新启动，登录状态仍然保留；复盘页会因离开本次启动而重新上锁。"
        confirmLabel="关闭系统"
        cancelLabel="取消"
      />

      {/* 浏览器拒绝脚本关窗（非脚本打开的标签页）时的兜底：服务此时已停 */}
      {poweredOff && (
        <div className="top-nav__powered-off" role="alert">
          <p className="top-nav__powered-off-title">系统已关闭</p>
          <p className="top-nav__powered-off-desc">本页可以关闭了。</p>
        </div>
      )}
    </>
  );
}
