/**
 * 首页（设计文档 8.1 / v2 12.4 Bento 构图）
 *
 * Bento 主次网格：今日专注卡 span 8（唯一主角卡，GradientCard primary
 * elevated 变体 + 光泽扫过）；考试倒计时卡 span 4 + row-2 高卡；
 * 今日任务摘要 span 8（最多 4 条 + 查看全部 CTA）；学习预设概览 span 12
 * 横条卡（最多 3 个，预设项横向排列，水印 SlidersHorizontal）。
 * 今日任务/预设概览用 GradientCard neutral 变体 + 右下角大图标水印。
 * 各卡按阅读顺序 .reveal 依次入场（--i 0→3，≤8 个）。
 * 倒计时规则、任务/预设/会话数据口径保持现状；数字全部 tabular-nums，标题宋体。
 * 1366×768 桌面视口含导航无纵向滚动；小屏单列自然滚动。
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Hourglass,
  Focus,
  Pin,
  CheckCircle2,
  Circle,
  ClipboardList,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { GradientCard } from '../components/ui/GradientCard';
import { Button } from '../components/ui/Button';
import { InteractiveHoverButton } from '../components/ui/InteractiveHoverButton';
import { EmptyState } from '../components/ui/EmptyState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { RingCountdown } from '../components/timer/RingCountdown';
import { tasksApi, Task } from '../api/tasks';
import { presetsApi, Preset } from '../api/presets';
import { focusApi, ActiveSession } from '../api/focus';
import { statisticsApi } from '../api/statistics';
import { StudyHeatmap } from '../components/heatmap/StudyHeatmap';
import { today, formatDateDisplay, getDaysRemaining } from '../utils/date';
import type { Subject, SubSubject, SessionSubject } from '@shared/types';
import type { HeatmapResponse } from '@shared/types';
import './HomePage.css';

interface HomePageProps {
  navigate: (hash: string) => void;
}

/** 任务摘要最大行数 / 预设概览最大个数。
 *  v2 Bento 密度调整（12.4 为最高优先级）：为保 1366×768 含导航无纵向滚动，
 *  任务摘要由 8.1 的 5 条精简为 4 条展示（仅展示层精简，数据口径不变，完整列表经「查看全部」可达） */
const MAX_TASK_ROWS = 4;
const MAX_PRESET_ROWS = 3;

export function HomePage({ navigate }: HomePageProps) {
  const daysRemaining = getDaysRemaining();
  const dateStr = today();

  // 今日任务摘要（接口已按 重要优先 + sortOrder 排序，取前 5 条展示）
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // 学习预设概览（接口按科目分组 + 最近使用排序，取前 3 个）
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  // 进行中专注会话：有则展示 RingCountdown mini（120px 简化模式）
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  // 学习趋势热力图（近 6 个月每日专注秒数）
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);

  const fetchHeatmap = useCallback(async () => {
    setHeatmapError(null);
    try {
      setHeatmap(await statisticsApi.getHeatmap());
    } catch (err) {
      setHeatmapError(err instanceof Error ? err.message : '加载学习趋势失败');
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    setTasksError(null);
    try {
      setTasks(await tasksApi.getByDate(today()));
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : '加载任务失败');
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    setPresetsError(null);
    try {
      setPresets(await presetsApi.getAll());
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : '加载预设失败');
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchPresets();
    fetchHeatmap();
    focusApi.getActive().then(setActiveSession).catch(() => {
      /* 会话状态获取失败静默降级为「无进行中会话」 */
    });
  }, [fetchTasks, fetchPresets, fetchHeatmap]);


  const taskRows = (tasks ?? []).slice(0, MAX_TASK_ROWS);
  const presetRows = (presets ?? []).slice(0, MAX_PRESET_ROWS);

  return (
    <PageShell>
      {/* 标题区：宋体标题 + 日期 */}
      <header className="home-header">
        <h1 className="home-title">欢迎回来</h1>
        <p className="home-date">{formatDateDisplay(dateStr)}</p>
      </header>

      <div className="bento-grid home-grid">
        {/* 今日专注卡（span 8，唯一主角卡）：GradientCard primary elevated 变体；
            主 CTA / 进行中会话迷你进度环（无水印，进行中会话占位） */}
        <GradientCard
          tone="primary"
          elevated
          className="bento-span-8 home-focus sheen-hover reveal"
          style={{ '--i': 0 } as React.CSSProperties}
        >
          <h2 className="home-card-title">
            <Focus size={18} strokeWidth={1.75} aria-hidden="true" />
            今日专注
          </h2>
          {activeSession ? (
            <div className="home-focus__active">
              <MiniSessionRing
                plannedEndAt={activeSession.plannedEndAt}
                totalSeconds={activeSession.plannedDurationSeconds}
              />
              <div className="home-focus__meta">
                <p className="home-focus__preset truncate" title={activeSession.presetNameSnapshot}>
                  {activeSession.presetNameSnapshot}
                </p>
                <SubjectBadge
                  subject={activeSession.subjectSnapshot as SessionSubject}
                  subSubject={activeSession.subSubjectSnapshot as SubSubject | null}
                />
                <Button variant="primary" onClick={() => navigate('#/pomodoro')}>
                  继续专注
                </Button>
              </div>
            </div>
          ) : (
            <div className="home-focus__idle">
              <p className="home-focus__hint">还没有进行中的专注，现在开始一轮吧</p>
              <InteractiveHoverButton onClick={() => navigate('#/pomodoro')}>
                开始专注
              </InteractiveHoverButton>
            </div>
          )}
        </GradientCard>

        {/* 考试倒计时宽卡（span 8，与原今日任务卡对调位置）：蜜金光斑 + 超大数字
            与学习趋势热力图左右并排 */}
        <GradientCard
          tone="neutral"
          watermark={<Hourglass />}
          title={
            <>
              <Hourglass size={18} strokeWidth={1.75} aria-hidden="true" />
              考研倒计时
            </>
          }
          className="bento-span-8 home-countdown reveal"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          <span className="home-countdown__blob" aria-hidden="true" />
          <div className="home-countdown__wide">
            {/* 左：超大等宽倒计时数字 */}
            <div className="home-countdown__num-block">
              {daysRemaining > 0 ? (
                <>
                  <p className="home-countdown__days">
                    <span className="home-countdown__num tabular-nums">{daysRemaining}</span>
                    <span className="home-countdown__unit">天</span>
                  </p>
                  <p className="home-countdown__sub">距 2026 年 12 月 20 日（不含今日）</p>
                </>
              ) : (
                <>
                  <p className="home-countdown__ended">考试已结束</p>
                  <p className="home-countdown__sub">2026 年 12 月 20 日</p>
                </>
              )}
            </div>

            {/* 右：学习趋势热力图（近 6 个月每日专注时长，5 档强度） */}
            <div className="home-countdown__heatmap">
              <p className="home-countdown__heatmap-title">
                学习趋势
                <span className="home-countdown__heatmap-range tabular-nums">近 6 个月</span>
              </p>
              <StudyHeatmap
                data={heatmap}
                loading={heatmap === null}
                error={heatmapError}
                onRetry={fetchHeatmap}
              />
            </div>
          </div>
        </GradientCard>

        {/* 今日任务摘要（span 4 + row-2 窄高卡，与原倒计时卡对调位置）：
            GradientCard neutral + ClipboardList 水印，查看全部 CTA；玻璃列表行，最多 4 条 */}
        <GradientCard
          tone="neutral"
          watermark={<ClipboardList />}
          title={
            <>
              <ClipboardList size={18} strokeWidth={1.75} aria-hidden="true" />
              今日任务
            </>
          }
          ctaText="查看全部"
          onCta={() => navigate('#/plan')}
          className="bento-span-4 bento-row-2 home-tasks reveal"
          style={{ '--i': 2 } as React.CSSProperties}
        >
          {tasks === null && !tasksError ? (
            <div className="home-list" role="status">
              <span className="sr-only">加载任务中...</span>
              <div className="skeleton home-list-skeleton" aria-hidden="true" />
              <div className="skeleton home-list-skeleton" aria-hidden="true" />
              <div className="skeleton home-list-skeleton" aria-hidden="true" />
            </div>
          ) : tasksError ? (
            <div className="home-inline-error" role="alert">
              <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="home-inline-error__text">{tasksError}</span>
              <Button variant="ghost" onClick={fetchTasks}>
                重试
              </Button>
            </div>
          ) : taskRows.length === 0 ? (
            <EmptyState
              compact
              icon={<ClipboardList size={40} strokeWidth={1.75} />}
              title="今天还没有任务"
              description="去计划页安排今天的学习任务吧"
            />
          ) : (
            <ul className="home-list">
              {taskRows.map((task) => (
                <li
                  key={task.id}
                  className={`home-task glass-1${task.isImportant ? ' home-task--important' : ''}${task.isCompleted ? ' home-task--done' : ''}`}
                >
                  <span className="home-task__status" aria-hidden="true">
                    {task.isCompleted ? (
                      <CheckCircle2 size={18} strokeWidth={1.75} />
                    ) : (
                      <Circle size={18} strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="sr-only">
                    {`${task.isImportant ? '重要，' : ''}${task.isCompleted ? '已完成：' : '未完成：'}`}
                  </span>
                  {task.isImportant && (
                    <span className="home-task__pin" aria-hidden="true">
                      <Pin size={14} strokeWidth={1.75} fill="currentColor" />
                    </span>
                  )}
                  <span className="home-task__content truncate">{task.content}</span>
                  <SubjectBadge
                    subject={task.subject as Subject}
                    subSubject={task.subSubject as SubSubject | null}
                  />
                </li>
              ))}
            </ul>
          )}
        </GradientCard>

        {/* 学习预设概览（span 12 横条卡）：GradientCard neutral + SlidersHorizontal
            水印，查看全部 CTA；最多 3 个，预设项横向排列 */}
        <GradientCard
          tone="neutral"
          watermark={<SlidersHorizontal />}
          title={
            <>
              <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
              学习预设
            </>
          }
          ctaText="查看全部"
          onCta={() => navigate('#/presets')}
          className="bento-span-12 home-presets reveal"
          style={{ '--i': 3 } as React.CSSProperties}
        >
          {presets === null && !presetsError ? (
            <div className="home-list home-preset-strip" role="status">
              <span className="sr-only">加载预设中...</span>
              <div className="skeleton home-list-skeleton" aria-hidden="true" />
              <div className="skeleton home-list-skeleton" aria-hidden="true" />
            </div>
          ) : presetsError ? (
            <div className="home-inline-error" role="alert">
              <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="home-inline-error__text">{presetsError}</span>
              <Button variant="ghost" onClick={fetchPresets}>
                重试
              </Button>
            </div>
          ) : presetRows.length === 0 ? (
            <EmptyState
              compact
              icon={<SlidersHorizontal size={40} strokeWidth={1.75} />}
              title="还没有学习预设"
              description="创建预设后即可一键开始专注"
            />
          ) : (
            <ul className="home-list home-preset-strip">
              {presetRows.map((preset) => (
                <li key={preset.id} className="home-preset glass-1">
                  <span className="home-preset__name truncate">{preset.name}</span>
                  <SubjectBadge
                    subject={preset.subject as Subject}
                    subSubject={preset.subSubject as SubSubject | null}
                  />
                  <span className="home-preset__duration tabular-nums">
                    {preset.durationMinutes}
                    <span className="home-preset__unit"> 分钟</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GradientCard>
      </div>
    </PageShell>
  );
}

/** 进行中会话迷你环：每秒刷新收敛在本组件内部，首页整体不再随秒整页重渲染 */
const MiniSessionRing = React.memo(function MiniSessionRing({
  plannedEndAt,
  totalSeconds,
}: {
  plannedEndAt: string;
  totalSeconds: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingSeconds = Math.max(
    0,
    Math.round((new Date(plannedEndAt).getTime() - nowMs) / 1000)
  );

  return (
    <RingCountdown
      variant="mini"
      totalSeconds={totalSeconds}
      remainingSeconds={remainingSeconds}
      mode="focus"
    />
  );
});
