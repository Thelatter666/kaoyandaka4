import React from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Button } from '../ui/Button';

/**
 * 介绍页极简导航（设计文档 §3）：品牌 + 主题切换 + 登录/注册。
 * 登录/注册已接通真实路由（账号系统 T2.4）：#/login、#/register。
 */
export function LandingNav() {
  return (
    <header className="landing-nav glass-2">
      <a className="landing-nav__brand" href="#/" aria-label="砚台考研打卡 首页">
        砚台考研
      </a>
      <nav className="landing-nav__actions" aria-label="账户操作">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={() => { window.location.hash = '#/login'; }}>
          登录
        </Button>
        <Button variant="primary" size="sm" onClick={() => { window.location.hash = '#/register'; }}>
          免费注册
        </Button>
      </nav>
    </header>
  );
}
