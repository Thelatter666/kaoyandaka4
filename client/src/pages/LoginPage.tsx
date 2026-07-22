import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { applyAuthUser } from '../hooks/useAuth';
import './AuthPage.css';

/**
 * 登录页（#/login，账号系统 T2.4）
 *
 * 未登录可访问的公开路由；已登录访问由 App 守卫重定向回 #/。
 * 提交 → POST /auth/login：401 显示「邮箱或密码错误」（后端统一文案，防账号枚举）、
 * 429 显示限流 message；成功后 applyAuthUser 使全局登录态立即生效并跳 #/。
 * 视觉：居中玻璃卡片（glass-2），双主题；label/focus 环/Enter 提交俱全。
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError('请输入邮箱和密码');
      return;
    }

    setSubmitting(true);
    try {
      const user = await authApi.login(trimmedEmail, password);
      /* 全局登录态立即生效（无需再查 /me），随后跳应用首页 */
      applyAuthUser(user);
      window.location.hash = '#/';
    } catch (err) {
      if (err instanceof ApiError) {
        /* 401 → 邮箱或密码错误；429 → 限流文案；其余 → 后端 message */
        setFormError(err.message);
      } else {
        setFormError('网络异常，请稍后重试');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <a className="auth-topbar__brand" href="#/" aria-label="砚台考研打卡 首页">
          砚台考研
        </a>
        <ThemeToggle />
      </header>

      <main id="main-content" className="auth-main">
        <div className="auth-card glass-2">
          <h1 className="auth-card__title">欢迎回来</h1>
          <p className="auth-card__sub">登录后继续你的备考沉淀</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="login-email">
                邮箱
              </label>
              <input
                id="login-email"
                className="auth-field__input"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label" htmlFor="login-password">
                密码
              </label>
              <input
                id="login-password"
                className="auth-field__input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {formError && (
              <p className="auth-form__error" role="alert">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="auth-form__submit"
            >
              登录
            </Button>
          </form>

          <p className="auth-card__switch">
            还没有账号？<a href="#/register">免费注册</a>
          </p>
          <a className="auth-card__back" href="#/">
            返回首页
          </a>
        </div>
      </main>
    </div>
  );
}
