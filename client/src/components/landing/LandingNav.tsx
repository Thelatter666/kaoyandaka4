import React from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Button } from '../ui/Button';

/**
 * 介绍页极简导航（设计文档 §3）：品牌 + 主题切换 + 登录/注册。
 * 登录/注册暂为占位（账号系统阶段接通真实路由）。
 */
export function LandingNav() {
  // TODO(账号系统)：接通登录/注册页路由
  const noop = () => {};
  return (
    <header className="landing-nav glass-2">
      <a className="landing-nav__brand" href="#/" aria-label="砚台考研打卡 首页">
        砚台考研
      </a>
      <nav className="landing-nav__actions" aria-label="账户操作">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={noop}>
          登录
        </Button>
        <Button variant="primary" size="sm" onClick={noop}>
          免费注册
        </Button>
      </nav>
    </header>
  );
}
