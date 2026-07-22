import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { applyAuthUser } from '../hooks/useAuth';
import './AuthPage.css';

/**
 * 注册页（#/register，账号系统 T2.4）
 *
 * 未登录可访问的公开路由；已登录访问由 App 守卫重定向回 #/。
 * 前端先做基础校验（邮箱格式 / 密码规则与后端一致 / 两次一致）再提交；
 * 400 按 details 映射字段级错误，409 显示「该邮箱已被注册」，429 显示限流文案；
 * 成功（后端已自动建立会话）→ applyAuthUser 立即生效并跳 #/。
 */

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  /* 前端基础校验：规则与 shared/schemas/auth.ts 的 RegisterSchema 对齐 */
  const validateLocal = (): FieldErrors => {
    const errs: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errs.email = '邮箱不能为空';
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      errs.email = '邮箱格式不正确';
    }
    if (password.length < 8) {
      errs.password = '密码至少 8 位';
    } else if (password.length > 72) {
      errs.password = '密码最长 72 位';
    } else if (!/[A-Za-z]/.test(password)) {
      errs.password = '密码必须包含字母';
    } else if (!/\d/.test(password)) {
      errs.password = '密码必须包含数字';
    }
    if (confirmPassword !== password) {
      errs.confirmPassword = '两次输入的密码不一致';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const localErrors = validateLocal();
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setSubmitting(true);
    try {
      const user = await authApi.register(email.trim(), password, confirmPassword);
      /* 注册成功后端已自动建立会话：直接写入全局登录态并跳应用首页 */
      applyAuthUser(user);
      window.location.hash = '#/';
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.details?.length) {
        /* 字段级校验错误：按 details 回填各字段 */
        const mapped: FieldErrors = {};
        for (const d of err.details) {
          if (d.field === 'email' || d.field === 'password' || d.field === 'confirmPassword') {
            mapped[d.field] = d.message;
          }
        }
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
        } else {
          setFormError(err.message);
        }
      } else if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ email: err.message });
      } else if (err instanceof ApiError) {
        /* 429 限流等：表单级展示后端 message */
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
          <h1 className="auth-card__title">创建账号</h1>
          <p className="auth-card__sub">注册即自动登录，开始沉淀每一天</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="register-email">
                邮箱
              </label>
              <input
                id="register-email"
                className={`auth-field__input${fieldErrors.email ? ' auth-field__input--error' : ''}`}
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="register-email-error" className="auth-field__error" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-field__label" htmlFor="register-password">
                密码
              </label>
              <input
                id="register-password"
                className={`auth-field__input${fieldErrors.password ? ' auth-field__input--error' : ''}`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
              />
              {fieldErrors.password ? (
                <p id="register-password-error" className="auth-field__error" role="alert">
                  {fieldErrors.password}
                </p>
              ) : (
                <p className="auth-field__hint">至少 8 位，须同时包含字母和数字</p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-field__label" htmlFor="register-confirm">
                确认密码
              </label>
              <input
                id="register-confirm"
                className={`auth-field__input${fieldErrors.confirmPassword ? ' auth-field__input--error' : ''}`}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-error' : undefined}
              />
              {fieldErrors.confirmPassword && (
                <p id="register-confirm-error" className="auth-field__error" role="alert">
                  {fieldErrors.confirmPassword}
                </p>
              )}
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
              注册并登录
            </Button>
          </form>

          <p className="auth-card__switch">
            已有账号？<a href="#/login">去登录</a>
          </p>
          <a className="auth-card__back" href="#/">
            返回首页
          </a>
        </div>
      </main>
    </div>
  );
}
