import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { statisticsApi } from '../api/statistics';
import { today, formatDate } from '../utils/date';
import { formatDurationHuman } from '../utils/duration';
import { ForestResponse } from '@shared/types';
import type { Subject, SubSubject } from '@shared/types';

type StatMode = 'day' | 'week' | 'month';

const MODE_LABELS: Record<StatMode, string> = { day: '日', week: '周', month: '月' };

const TREE_ICONS: Record<string, string> = {
  math: '🌲',       // pine tree
  english: '🌳',    // broadleaf tree
  '408': '🍎',      // fruit tree
};

export function StatisticsPage() {
  const [mode, setMode] = useState<StatMode>('week');
  const [currentDate, setCurrentDate] = useState(today());
  const [data, setData] = useState<ForestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await statisticsApi.getForest(mode, currentDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载统计数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, currentDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goBack = () => {
    const d = new Date(currentDate + 'T00:00:00');
    switch (mode) {
      case 'day': d.setDate(d.getDate() - 1); break;
      case 'week': d.setDate(d.getDate() - 7); break;
      case 'month': d.setMonth(d.getMonth() - 1); break;
    }
    setCurrentDate(formatDate(d));
  };

  const goForward = () => {
    const d = new Date(currentDate + 'T00:00:00');
    switch (mode) {
      case 'day': d.setDate(d.getDate() + 1); break;
      case 'week': d.setDate(d.getDate() + 7); break;
      case 'month': d.setMonth(d.getMonth() + 1); break;
    }
    setCurrentDate(formatDate(d));
  };

  const goToday = () => setCurrentDate(today());

  const formatRangeLabel = () => {
    if (!data) return '';
    return mode === 'day'
      ? data.rangeStart
      : `${data.rangeStart} ~ ${data.rangeEnd}`;
  };

  return (
    <PageShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0 }}>
          🌳 学习森林
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', maxWidth: 400 }}>
          每专注学习满 1 小时，就会在对应科目的森林里种下一棵树 🌿
        </p>
      </div>

      {/* Mode Switcher + Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)',
        flexWrap: 'wrap', gap: 'var(--space-md)',
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {(Object.entries(MODE_LABELS) as [StatMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setCurrentDate(today()); }}
              style={{
                padding: '8px 20px', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-sm)', fontWeight: mode === m ? 600 : 400,
                backgroundColor: mode === m ? 'var(--color-accent-primary)' : 'transparent',
                color: mode === m ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Button variant="secondary" size="sm" onClick={goBack} disabled={!data?.canGoBack}>←</Button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', minWidth: 160, textAlign: 'center' }}>
            {formatRangeLabel()}
          </span>
          <Button variant="secondary" size="sm" onClick={goForward} disabled={!data?.canGoForward}>→</Button>
          <Button variant="ghost" size="sm" onClick={goToday}>今天</Button>
        </div>
      </div>

      {loading ? <LoadingState message="加载统计中..." /> :
       error ? <ErrorState message={error} onRetry={fetchData} /> :
       !data ? <EmptyState icon="🌿" title="暂无数据" /> : (
        <>
          {/* Forest Visualization */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            {(['math', 'english', '408'] as Subject[]).map((subject) => {
              const trees = data.period.treesBySubject[subject] || 0;
              const remaining = data.period.remainingSecondsBySubject[subject] || 3600;
              const labels: Record<string, string> = { math: '数学森林', english: '英语森林', '408': '408 森林' };

              return (
                <Card key={subject} padding="var(--space-lg)" style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
                    {TREE_ICONS[subject]} {labels[subject]}
                  </h3>

                  {/* Tree icons */}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-md)', minHeight: 80,
                  }}>
                    {trees > 0 ? (
                      Array.from({ length: Math.min(trees, 20) }, (_, i) => (
                        <span key={i} style={{ fontSize: '2rem', lineHeight: 1 }} aria-label={`${labels[subject]} 第${i + 1}棵树`}>
                          {TREE_ICONS[subject]}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '2rem', opacity: 0.2 }} aria-label="还没有种下树">
                        🌱
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: `var(--color-subject-${subject})` }}>
                    {trees} 棵
                  </p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    距离下一棵树还有 {formatDurationHuman(remaining)}
                  </p>
                </Card>
              );
            })}
          </div>

          {/* Results Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <Card>
              <h3 style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }}>📊 本期成果</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
                <StatItem label="专注时长" value={formatDurationHuman(data.period.totalFocusSeconds)} />
                <StatItem label="完成次数" value={`${data.period.totalCompletedSessions} 次`} />
                <StatItem label="种下树木" value={`${data.period.totalTrees} 棵`} />
              </div>
            </Card>
            <Card>
              <h3 style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }}>🏆 累计成果</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
                <StatItem label="累计专注" value={formatDurationHuman(data.cumulative.totalFocusSeconds)} />
                <StatItem label="累计树木" value={`${data.cumulative.totalTrees} 棵`} />
              </div>
            </Card>
          </div>

          {/* Learning Records Timeline */}
          {data.records.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-md)' }}>📖 学习记录</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {data.records.map((day) => (
                  <div key={day.date}>
                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
                      {day.date}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {day.items.map((item) => (
                        <Card key={item.id} padding="10px 16px">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            <SubjectBadge subject={item.subject as Subject} subSubject={item.subSubject as SubSubject | null} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                              {formatDurationHuman(item.durationSeconds)}
                            </span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                              {new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.records.length === 0 && (
            <EmptyState
              icon="🌿"
              title="还没有种下第一棵树"
              description="每次专注 1 小时，这里就会长出一棵属于你的学习树"
              actionLabel="去番茄钟开始第一次专注"
              onAction={() => window.location.hash = '#/pomodoro'}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</p>
    </div>
  );
}
