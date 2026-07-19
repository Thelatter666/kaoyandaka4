import React from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { today, formatDateDisplay, getDaysRemaining } from '../utils/date';

interface HomePageProps {
  navigate: (hash: string) => void;
}

export function HomePage({ navigate }: HomePageProps) {
  const daysRemaining = getDaysRemaining();
  const dateStr = today();

  return (
    <PageShell>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: 'var(--space-lg)',
      }}>
        {/* Date + Greeting */}
        <div style={{ gridColumn: 'span 12' }}>
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-lg)',
            marginBottom: 4,
          }}>
            {formatDateDisplay(dateStr)}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-3xl)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
          }}>
            欢迎回来 👋
          </h1>
        </div>

        {/* Countdown Card */}
        <div style={{ gridColumn: 'span 12' }}>
          <Card>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-md)',
            }}>
              <div>
                <p style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 4,
                }}>
                  2026 年 12 月 20 日 · 距离考试
                </p>
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-4xl)',
                  fontWeight: 700,
                  color: daysRemaining > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                }}>
                  {daysRemaining > 0 ? `${daysRemaining} 天` : '考试已结束'}
                </p>
                <p style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-xs)',
                  marginTop: 4,
                }}>
                  （不含今日）
                </p>
              </div>
              <Button variant="primary" size="lg" onClick={() => navigate('#/pomodoro')}>
                开始专注 🍅
              </Button>
            </div>
          </Card>
        </div>

        {/* Today Focus Card */}
        <div style={{ gridColumn: 'span 6' }}>
          <Card>
            <h3 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-lg)',
              marginBottom: 'var(--space-md)',
            }}>
              今日专注
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
              还没有今天的专注记录
            </p>
            <div style={{ marginTop: 'var(--space-md)' }}>
              <Button variant="primary" onClick={() => navigate('#/pomodoro')}>
                开始专注
              </Button>
            </div>
          </Card>
        </div>

        {/* Today Tasks Summary */}
        <div style={{ gridColumn: 'span 6' }}>
          <Card>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-md)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--text-lg)',
              }}>
                今日任务
              </h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('#/plan')}>
                查看全部 →
              </Button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
              还没有今天的任务
            </p>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
