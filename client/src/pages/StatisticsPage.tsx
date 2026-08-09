/**
 * 统计页 · 学习森林「玻璃花房」（设计文档 8.7 / v2 12.4 Bento 构图）
 * PageShell 页头 + 日/周/月玻璃分段控件 + 范围导航器（玻璃圆钮 + 等宽日期 + 今天胶囊）；
 * Bento 主次网格：森林玻璃花房 span 12 全景主角（内附数据条）→
 * 三张本期数据卡 span 4×3 → 累计成果卡 span 4 + 学习记录时间线 span 8。
 * 主体区块按阅读顺序 .reveal 依次入场（--i 0→6，≤8 个）；时间线内大量项不做 stagger。
 * 数据逻辑（接口调用、mode/range 切换、禁用规则、统计口径）与重构前完全一致。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock, TreePine, Trophy } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { ForestGlasshouse } from '../components/forest/ForestGlasshouse';
import { ForestDataBar } from '../components/forest/ForestDataBar';
import { statisticsApi } from '../api/statistics';
import { today, formatDate } from '../utils/date';
import { formatDurationHuman } from '../utils/duration';
import type { ForestResponse } from '@shared/types';
import type { SessionSubject, SubSubject } from '@shared/types';
import './StatisticsPage.css';

type StatMode = 'day' | 'week' | 'month';

const MODE_LABELS: Record<StatMode, string> = { day: '日', week: '周', month: '月' };
const MODE_ORDER: StatMode[] = ['day', 'week', 'month'];

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
    <PageShell
      title="学习森林"
      subtitle="每专注学习满 1 小时，就会在对应科目的森林里种下一棵树"
    >
      {/* 日/周/月玻璃分段控件 + 范围导航器 */}
      <div className="stats-controls reveal" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="segmented glass-1" role="group" aria-label="统计范围">
          <span
            className="segmented__indicator"
            style={{ transform: `translateX(${MODE_ORDER.indexOf(mode) * 100}%)` }}
            aria-hidden="true"
          />
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={`segmented__item${mode === m ? ' segmented__item--active' : ''}`}
              aria-pressed={mode === m}
              onClick={() => { setMode(m); setCurrentDate(today()); }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <div className="range-nav">
          <button
            type="button"
            className="range-nav__arrow glass-1"
            onClick={goBack}
            disabled={!data?.canGoBack}
            aria-disabled={!data?.canGoBack}
            aria-label="上一期"
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className="range-nav__label tabular-nums">{formatRangeLabel()}</span>
          <button
            type="button"
            className="range-nav__arrow glass-1"
            onClick={goForward}
            disabled={!data?.canGoForward}
            aria-disabled={!data?.canGoForward}
            aria-label="下一期"
          >
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <Button variant="glass" size="sm" className="range-nav__today" onClick={goToday}>
            今天
          </Button>
        </div>
      </div>

      {/* 仅首次加载（无既有数据）时替换为骨架；范围切换保留旧内容原地更新，
          避免 reveal 入场动画随每次请求重播（设计文档 13.3：仅首次挂载播放一次） */}
      {loading && !data ? (
        /* 加载：场景骨架 shimmer */
        <div role="status">
          <span className="sr-only">加载统计中...</span>
          <div className="skeleton stats-skeleton__scene" aria-hidden="true" />
          <div className="skeleton stats-skeleton__bar" aria-hidden="true" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : !data ? (
        <EmptyState title="暂无数据" />
      ) : (
        <div className="bento-grid stats-layout" data-updating={loading}>
          {/* 主角：森林玻璃花房全景（span 12）+ 场景数据条 */}
          <div className="bento-span-12 stats-hero reveal" style={{ '--i': 1 } as React.CSSProperties}>
            {/* 玻璃花房场景 */}
            <ForestGlasshouse
              treesBySubject={data.period.treesBySubject}
              rangeLabel={formatRangeLabel()}
              periodTotalTrees={data.period.totalTrees}
              cumulativeTotalTrees={data.cumulative.totalTrees}
              onStartFocus={() => { window.location.hash = '#/pomodoro'; }}
            />

            {/* 数据条：本期专注时长 / 完成次数 / 树木总数 / 各科距下一棵树剩余时长 */}
            <ForestDataBar
              totalFocusSeconds={data.period.totalFocusSeconds}
              totalCompletedSessions={data.period.totalCompletedSessions}
              totalTrees={data.period.totalTrees}
              remainingSecondsBySubject={data.period.remainingSecondsBySubject}
            />
          </div>

          {/* 三张本期数据卡（span 4×3） */}
          <Card className="bento-span-4 stats-data reveal" style={{ '--i': 2 } as React.CSSProperties}>
            <h3 className="stats-data__title">
              <Clock size={18} strokeWidth={1.75} aria-hidden="true" />
              本期专注时长
            </h3>
            <p className="stats-data__value tabular-nums">
              {formatDurationHuman(data.period.totalFocusSeconds)}
            </p>
          </Card>
          <Card className="bento-span-4 stats-data reveal" style={{ '--i': 3 } as React.CSSProperties}>
            <h3 className="stats-data__title">
              <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
              完成次数
            </h3>
            <p className="stats-data__value tabular-nums">
              {data.period.totalCompletedSessions} 次
            </p>
          </Card>
          <Card className="bento-span-4 stats-data reveal" style={{ '--i': 4 } as React.CSSProperties}>
            <h3 className="stats-data__title">
              <TreePine size={18} strokeWidth={1.75} aria-hidden="true" />
              种下树木
            </h3>
            <p className="stats-data__value tabular-nums">
              {data.period.totalTrees} 棵
            </p>
          </Card>

          {/* 累计成果卡（span 4，时间线旁侧卡） */}
          <Card className="bento-span-4 stats-cumulative reveal" style={{ '--i': 5 } as React.CSSProperties}>
            <h3 className="stats-card-title">
              <Trophy size={18} strokeWidth={1.75} aria-hidden="true" />
              累计成果
            </h3>
            <div className="stats-grid">
              <StatItem label="累计专注" value={formatDurationHuman(data.cumulative.totalFocusSeconds)} />
              <StatItem label="累计树木" value={`${data.cumulative.totalTrees} 棵`} />
            </div>
          </Card>

          {/* 学习记录时间线（span 8，按日分组 glass-1 行卡；大量项不做 stagger） */}
          {data.records.length > 0 && (
            <section
              className="bento-span-8 stats-records reveal"
              style={{ '--i': 6 } as React.CSSProperties}
              aria-label="学习记录"
            >
              <h3 className="stats-card-title">
                <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
                学习记录
              </h3>
              <div className="stats-records__groups">
                {data.records.map((day) => (
                  <div key={day.date}>
                    <h4 className="stats-records__date tabular-nums">{day.date}</h4>
                    <div className="stats-records__items">
                      {day.items.map((item) => (
                        <Card
                          key={item.id}
                          padding="10px 16px"
                          className="stats-record"
                        >
                          <div className="stats-record__row">
                            <SubjectBadge subject={item.subject as SessionSubject} subSubject={item.subSubject as SubSubject | null} />
                            <span className="stats-record__title truncate">{item.title}</span>
                            <span className="stats-record__duration tabular-nums">
                              {formatDurationHuman(item.durationSeconds)}
                            </span>
                            <span className="stats-record__time tabular-nums">
                              {new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="stats-stat__label">{label}</p>
      <p className="stats-stat__value tabular-nums">{value}</p>
    </div>
  );
}
