import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Trash2, LogIn } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ImportBackupModal } from '../components/ui/ImportBackupModal';
import { applyAuthUser } from '../hooks/useAuth';
import { setLocalContext } from '../local/mode';
import {
  createLocalAccount,
  deleteLocalAccount,
  getActiveLocalAccount,
  listLocalAccounts,
  setActiveLocalAccount,
} from '../local/accounts';
import type { LocalAccount } from '../local/types';
import './AuthPage.css';
import './LocalModePage.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 本地账户页（#/local，P3 本地模式入口，仅未登录可访问）
 *
 * 数据全部存在当前浏览器 IndexedDB（kaoyandaily_local），无网络依赖。
 * - 激活账户区：已有本地账户 → 直接进入应用；
 * - 账户列表：每个账户可进入 / 删除（删除级联清空该账户全部数据，不可恢复）；
 * - 新建账户：邮箱即为登录标识（无密码），邮箱须合法以兼容备份文件；
 * - 从备份文件导入：未激活时可建本地账户并迁移 P1 备份（导入即自动激活）。
 */
export function LocalModePage() {
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [active, setActive] = useState<LocalAccount | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalAccount | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    setAccounts(await listLocalAccounts());
    setActive(getActiveLocalAccount());
  }, []);

  useEffect(() => {
    setLocalContext(true);
    void refresh();
    return () => setLocalContext(false);
  }, [refresh]);

  const enter = (account: LocalAccount) => {
    setActiveLocalAccount(account);
    applyAuthUser({ id: account.accountId, email: account.email });
    window.location.hash = '#/';
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const email = newEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setFormError('请输入有效的邮箱地址（本地账户无密码，邮箱作为登录标识）');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      await createLocalAccount(email);
      setNewEmail('');
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteLocalAccount(deleteTarget.accountId);
      setDeleteTarget(null);
      await refresh();
    } finally {
      setBusy(false);
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
          <div className="local-card__icon" aria-hidden="true">
            <HardDrive size={22} strokeWidth={1.75} />
          </div>
          <h1 className="auth-card__title">本地模式</h1>
          <p className="auth-card__sub">数据仅保存在当前浏览器，无需服务器即可使用全部功能</p>

          {active && (
            <section className="local-active" aria-label="当前激活账户">
              <p className="local-active__label">当前账户</p>
              <p className="local-active__email">{active.email}</p>
              <Button
                variant="primary"
                size="lg"
                className="local-active__enter"
                onClick={() => enter(active)}
              >
                进入应用
              </Button>
            </section>
          )}

          {accounts.length > 0 && (
            <section className="local-accounts" aria-label="本地账户列表">
              <h2 className="local-section__title">本地账户</h2>
              <ul className="local-accounts__list">
                {accounts.map((account) => (
                  <li key={account.accountId} className="local-accounts__row">
                    <div className="local-accounts__info">
                      <span className="local-accounts__email">{account.email}</span>
                      <span className="local-accounts__meta">
                        {account.accountId === active?.accountId ? '（当前）' : ''}
                        {account.createdAt.slice(0, 10)} 创建
                      </span>
                    </div>
                    <div className="local-accounts__actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => enter(account)}
                        aria-label={`以 ${account.email} 进入应用`}
                      >
                        <LogIn size={14} strokeWidth={1.75} aria-hidden="true" />
                        进入
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="local-accounts__delete"
                        onClick={() => setDeleteTarget(account)}
                        aria-label={`删除账户 ${account.email}`}
                      >
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="local-create" aria-label="新建本地账户">
            <h2 className="local-section__title">新建本地账户</h2>
            <form className="auth-form" onSubmit={handleCreate} noValidate>
              <div className="auth-field">
                <label className="auth-field__label" htmlFor="local-email">
                  邮箱
                </label>
                <input
                  id="local-email"
                  className="auth-field__input"
                  type="email"
                  autoComplete="email"
                  placeholder="你@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={busy}
                />
                <p className="auth-field__hint">无需密码；邮箱将作为数据归属标识，用于备份迁移</p>
              </div>
              {formError && (
                <p className="auth-form__error" role="alert">
                  {formError}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" loading={busy} className="auth-form__submit">
                创建本地账户
              </Button>
            </form>
          </section>

          <button type="button" className="auth-card__import" onClick={() => setImportOpen(true)}>
            从备份文件导入（首次导入将自动创建本地账户）
          </button>
          <a className="auth-card__back" href="#/login">
            返回登录
          </a>
        </div>
      </main>

      <ImportBackupModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(result) => {
          applyAuthUser({ id: result.id, email: result.email });
          window.location.hash = '#/';
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          void handleDelete();
        }}
        title="删除本地账户？"
        message={`将删除账户 ${deleteTarget?.email ?? ''} 及该账户的全部数据（任务/复盘/预设/网课/专注/记录/设置），此操作不可恢复。`}
        confirmLabel="确认删除"
        destructive
      />
    </div>
  );
}