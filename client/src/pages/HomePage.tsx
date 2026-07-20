/**
 * 首页（设计文档 8.1）
 *
 * 12 栏网格：首行考试倒计时卡（8 栏）+ 今日专注卡（4 栏）；
 * 次行今日任务摘要（7 栏，最多 5 条 + 查看全部）+ 学习预设概览（5 栏，最多 3 个）。
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
  ChevronRight,
  ClipboardList,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { RingCountdown } from '../components/timer/RingCountdown';
import { tasksApi, Task } from '../api/tasks';
import { presetsApi, Preset } from '../api/presets';
import { focusApi, ActiveSession } from '../api/focus';
import { today, formatDateDisplay, getDaysRemaining } from '../utils/date';
import type { Subject, SubSubject } from '@shared/types';
import './HomePage.css';

interface HomePageProps {
  navigate: (hash: string) => void;
}

/** 任务摘要最大行数 / 预设概览最大个数（设计文档 8.1） */
const MAX_TASK_ROWS = 5;
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
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    focusApi.getActive().then(setActiveSession).catch(() => {
      /* 会话状态获取失败静默降级为「无进行中会话」 */
    });
  }, [fetchTasks, fetchPresets]);

  // 进行中会话逐秒刷新剩余时间
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  const remainingSeconds = activeSession
    ? Math.max(0, Math.round((new Date(activeSession.plannedEndAt).getTime() - nowMs) / 1000))
    : 0;

  const taskRows = (tasks ?? []).slice(0, MAX_TASK_ROWS);
  const presetRows = (presets ?? []).slice(0, MAX_PRESET_ROWS);

  return (
    <PageShell>
      {/* 标题区：宋体标题 + 日期 */}
      <header className="home-header">
        <h1 className="home-title">欢迎回来</h1>
        <p className="home-date">{formatDateDisplay(dateStr)}</p>
      </header>

      <div className="home-grid">
        {/* 考试倒计时卡（8 栏）：glass-1 + 蜜金光斑 + 超大等宽数字 */}
        <Card className="home-grid__countdown home-countdown">
          <span className="home-countdown__blob" aria-hidden="true" />
          <div className="home-countdown__body">
            <p className="home-countdown__label">
              <Hourglass size={16} strokeWidth={1.75} aria-hidden="true" />
              考研倒计时
            </p>
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
        </Card>

        {/* 今日专注卡（4 栏）：主 CTA / 进行中会话迷你进度环 */}
        <Card className="home-grid__focus home-focus">
          <h2 className="home-card-title">
            <Focus size={18} strokeWidth={1.75} aria-hidden="true" />
            今日专注
          </h2>
          {activeSession ? (
            <div className="home-focus__active">
              <RingCountdown
                variant="mini"
                totalSeconds={activeSession.plannedDurationSeconds}
                remainingSeconds={remainingSeconds}
                mode="focus"
              />
              <div className="home-focus__meta">
                <p className="home-focus__preset truncate" title={activeSession.presetNameSnapshot}>
                  {activeSession.presetNameSnapshot}
                </p>
                <SubjectBadge
                  subject={activeSession.subjectSnapshot as Subject}
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
              <Button variant="primary" size="lg" onClick={() => navigate('#/pomodoro')}>
                开始专注
              </Button>
            </div>
          )}
        </Card>

        {/* 今日任务摘要（7 栏）：玻璃列表行，最多 5 条 */}
        <Card className="home-grid__tasks">
          <div className="home-card-head">
            <h2 className="home-card-title">
              <ClipboardList size={18} strokeWidth={1.75} aria-hidden="true" />
              今日任务
            </h2>
            <button type="button" className="home-card-link" onClick={() => navigate('#/plan')}>
              查看全部
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
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
        </Card>

        {/* 学习预设概览（5 栏）：最多 3 个 */}
        <Card className="home-grid__presets">
          <div className="home-card-head">
            <h2 className="home-card-title">
              <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
              学习预设
            </h2>
            <button type="button" className="home-card-link" onClick={() => navigate('#/presets')}>
              查看全部
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {presets === null && !presetsError ? (
            <div className="home-list" role="status">
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
            <ul className="home-list">
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
        </Card>
      </div>
    </PageShell>
  );
}
