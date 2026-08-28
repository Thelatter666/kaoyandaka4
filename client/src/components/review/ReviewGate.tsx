import React, { useEffect, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { reviewLockApi } from '../../api/reviews';
import { useAuth } from '../../hooks/useAuth';
import { isReviewUnlocked, markReviewUnlocked } from '../../utils/unlockMarker';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import './ReviewGate.css';

/**
 * 复盘锁门禁（spec §1）：App.tsx 以 <ReviewGate><ReviewPage/></ReviewGate> 包裹，
 * children 保持 lazy（本组件不静态 import ReviewPage，勿破坏代码分割）。
 * 三态：未设锁 → 引导设置；已锁未解锁 → 验证；解锁 → children。
 * 解锁标记为会话 cookie（ADR-0005）：跨标签页共享，浏览器关闭即失效。
 */
type GateStep = 'loading' | 'error' | 'setup' | 'verify' | 'unlocked';

export function ReviewGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [step, setStep] = useState<GateStep>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reviewLockApi
      .getStatus()
      .then(({ hasLock }) => {
        if (cancelled) return;
        const identity = user?.id ?? '';
        if (!hasLock) setStep('setup');
        else if (identity && isReviewUnlocked(identity)) setStep('unlocked');
        else setStep('verify');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('加载复盘锁状态失败');
          setStep('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4 || newPassword.length > 64) {
      setFormError('密码需 4-64 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await reviewLockApi.set({ newPassword });
      markReviewUnlocked(user?.id ?? '');
      setStep('unlocked');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '设置失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await reviewLockApi.verify({ password });
      markReviewUnlocked(user?.id ?? '');
      setStep('unlocked');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '验证失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'unlocked') return <>{children}</>;

  return (
    <main className="review-gate">
      <Card className="review-gate__card glass-2">
        {step === 'loading' && <LoadingState message="加载复盘锁状态中..." />}
        {step === 'error' && (
          <ErrorState message={loadError ?? '加载失败'} onRetry={() => window.location.reload()} />
        )}

        {step === 'setup' && (
          <>
            <h2 className="review-gate__title">
              <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
              设置复盘锁
            </h2>
            <p className="review-gate__desc">
              复盘属于隐私内容，设置二重密码后，每次启动系统需验证一次才能进入。
            </p>
            <form onSubmit={handleSetup} className="review-gate__form">
              <input
                type="password"
                className="review-gate__input"
                placeholder="新密码（4-64 位）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <input
                type="password"
                className="review-gate__input"
                placeholder="确认新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {formError && (
                <p className="review-gate__error" role="alert">
                  {formError}
                </p>
              )}
              <Button type="submit" variant="primary" loading={submitting}>
                设置并进入
              </Button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <h2 className="review-gate__title">
              <Lock size={18} strokeWidth={1.75} aria-hidden="true" />
              复盘已加密保护
            </h2>
            <p className="review-gate__desc">请输入复盘锁密码进入。</p>
            <form onSubmit={handleVerify} className="review-gate__form">
              <input
                type="password"
                className="review-gate__input"
                placeholder="复盘锁密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
              {formError && (
                <p className="review-gate__error" role="alert">
                  {formError}
                </p>
              )}
              <Button type="submit" variant="primary" loading={submitting}>
                解锁
              </Button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
