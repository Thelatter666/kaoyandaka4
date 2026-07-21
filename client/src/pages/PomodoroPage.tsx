import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Check,
  X,
  Coffee,
  Armchair,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { DurationSelector } from '../components/presets/DurationSelector';
import { PresetCard } from '../components/presets/PresetCard';
import { RingCountdown } from '../components/timer/RingCountdown';
import { BurstParticles } from '../components/timer/BurstParticles';
import { useFocusSession } from '../hooks/useFocusSession';
import { presetsApi, Preset } from '../api/presets';
import { statisticsApi } from '../api/statistics';
import { showToast } from '../components/ui/Toast';
import { today } from '../utils/date';
import { SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES, LONG_BREAK_AFTER_ROUNDS } from '@shared/schemas/common';
import type { Subject, SubSubject } from '@shared/types';
import './PomodoroPage.css';

/**
 * 番茄钟页「光晕核心」（设计文档 5.3 / v2 12.4 / 13.4）
 *
 * 业务规则保持不变：预设必选、时长 5–120/5 分钟倍数、短休 5 分钟 /
 * 长休 15 分钟固定、会话恢复、完成/取消/休息的记录规则、重复完成保护。
 *
 * v2 布局（非 bento）：圆盘舞台居中为本页唯一视觉主角（背后聚灯光斑 +
 * 大留白）；预设选择区为底部 dock 横排紧凑卡（glass-2 托盘，可横向滚动，
 * 窄屏纵向堆叠）；进行中辅助信息（当前预设/轮次/计划时长）收进单一侧卡；
 * 其余内容 opacity 0.4 淡出但保持可交互。页面编排 .reveal：圆盘舞台 →
 * 控制区 → 侧卡 / dock（每步 ≤4 个，远低于每页 8 个上限）。
 */

type PomodoroStep = 'select-preset' | 'adjust-duration' | 'active' | 'completed';

type RingMode = 'focus' | 'short_break' | 'long_break';

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  '408': '408',
};

/** 预设 dock 的铺平顺序：沿用既有科目分组顺序（数学 → 英语 → 408） */
const SUBJECT_ORDER: Subject[] = ['math', 'english', '408'];

export function PomodoroPage() {
  const {
    activeSession,
    breakMode, breakRemainingSeconds, roundCount,
    startFocus, completeFocus, cancelFocus,
    startBreak, completeBreak,
  } = useFocusSession();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  // UI state
  const [step, setStep] = useState<PomodoroStep>('select-preset');
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [actionLoading, setActionLoading] = useState(false);

  // 光晕核心：逐秒刷新 / 完成粒子爆散 / 今日已完成轮次
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [burstKey, setBurstKey] = useState(0);
  const [statsRounds, setStatsRounds] = useState(0);
  const [naturalRounds, setNaturalRounds] = useState(0);
  const prevSessionIdRef = useRef<string | null>(null);
  /** 完成/取消按钮触发的会话结束（区别于自然结束），避免重复触发粒子 */
  const selfEndedRef = useRef(false);

  const fetchPresets = useCallback(async () => {
    setPresetsLoading(true);
    try {
      setPresets(await presetsApi.getAll());
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : '加载预设失败');
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  // 今日已完成轮次：优先沿用统计接口的当日完成数；接口不可用时回退为页面内状态推导
  useEffect(() => {
    let cancelled = false;
    statisticsApi
      .getForest('day', today())
      .then((data) => {
        if (!cancelled) setStatsRounds(data.period.totalCompletedSessions);
      })
      .catch(() => {
        /* 回退：仅使用页面内状态（roundCount / naturalRounds）推导 */
      });
    return () => { cancelled = true; };
  }, []);

  // Sync with active session（会话恢复：检测到进行中会话即进入计时视图）
  useEffect(() => {
    if (activeSession) {
      setStep('active');
    }
  }, [activeSession]);

  // 进行中逐秒刷新剩余时间
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  // 会话自然结束检测：activeSession 由有变无且非完成/取消按钮触发
  // （后端对到期会话自动完成并记录），触发粒子爆散并进入完成页
  useEffect(() => {
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = activeSession?.id ?? null;
    if (prevId && !activeSession) {
      if (selfEndedRef.current) {
        selfEndedRef.current = false;
        return;
      }
      setBurstKey((k) => k + 1);
      setNaturalRounds((n) => n + 1);
      setStep('completed');
    }
  }, [activeSession]);

  const handleSelectPreset = (preset: Preset) => {
    // 进行中/休息中其余内容保持可交互，但不允许切入新的专注流程
    if (activeSession) {
      showToast('info', '当前有进行中的专注，请先完成或取消');
      return;
    }
    if (breakMode) {
      showToast('info', '休息结束后再开始新的专注');
      return;
    }
    setSelectedPreset(preset);
    setDurationMinutes(preset.durationMinutes);
    setStep('adjust-duration');
  };

  const handleStartFocus = async () => {
    if (!selectedPreset) return;
    setActionLoading(true);
    try {
      await startFocus(selectedPreset.id, durationMinutes, 'pomodoro');
      setStep('active');
    } catch {
      // Error handled by hook
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    // 标记为按钮触发的结束，自然结束检测据此跳过重复爆散
    selfEndedRef.current = true;
    try {
      await completeFocus();
      setBurstKey((k) => k + 1);
      setStep('completed');
    } catch {
      selfEndedRef.current = false;
      // Error handled by hook
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    selfEndedRef.current = true;
    try {
      await cancelFocus();
      setStep('select-preset');
      setSelectedPreset(null);
    } catch {
      selfEndedRef.current = false;
      // Error handled by hook
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartBreak = (mode: 'short' | 'long') => {
    startBreak(mode);
    setStep('select-preset');
    setSelectedPreset(null);
  };

  const handleContinue = () => {
    setStep('select-preset');
    setSelectedPreset(null);
  };

  const handleNoBreak = () => {
    setStep('select-preset');
    setSelectedPreset(null);
  };

  // 剩余时间（基于逐秒刷新的 nowMs）
  const remainingSeconds = activeSession
    ? Math.max(0, Math.round((new Date(activeSession.plannedEndAt).getTime() - nowMs) / 1000))
    : 0;
  const totalPlannedSeconds = activeSession?.plannedDurationSeconds || 0;

  // Determine if we should show long break option（沿用既有规则）
  const showLongBreak = roundCount % LONG_BREAK_AFTER_ROUNDS === 0 && roundCount > 0;

  // 今日已完成轮次：统计接口种子 + 本页按钮完成（roundCount 自 1 起）+ 自然结束
  const completedRoundsToday = statsRounds + Math.max(0, roundCount - 1) + naturalRounds;

  // ======================
  // 共享片段
  // ======================

  /** 圆盘舞台：聚灯光斑（跟随模式色）+ 大留白，reveal 依次入场 */
  const renderStage = (mode: RingMode, ring: React.ReactNode, revealIndex: number) => (
    <div
      className={`pomodoro-hero__stage pomodoro-hero__stage--${mode} reveal`}
      style={{ '--i': revealIndex } as React.CSSProperties}
    >
      <span className="pomodoro-stage__glow" aria-hidden="true" />
      {ring}
    </div>
  );

  /** 底部预设 dock：横排紧凑卡托盘；dimmed 时淡出 0.4 保持可交互 */
  const renderPresetDock = (dimmed: boolean, revealIndex: number) => {
    const content = (() => {
      if (presetsLoading) {
        return <LoadingState message="加载预设中..." />;
      }
      if (presetsError) {
        return <ErrorState message={presetsError} onRetry={fetchPresets} />;
      }
      if (presets.length === 0) {
        return (
          <EmptyState
            icon={<ClipboardList size={40} strokeWidth={1.75} />}
            title="还没有学习预设"
            description="需要先创建预设才能开始专注"
            actionLabel="创建第一个预设"
            onAction={() => { window.location.hash = '#/presets'; }}
          />
        );
      }
      // 铺平为横向 dock（沿用既有科目分组顺序，选择语义不变）
      const orderedPresets = SUBJECT_ORDER.flatMap((subj) => presets.filter((p) => p.subject === subj));
      return (
        <div className="pomodoro-dock__strip">
          {orderedPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              id={preset.id}
              name={preset.name}
              subject={preset.subject as Subject}
              subSubject={preset.subSubject as SubSubject | null}
              durationMinutes={preset.durationMinutes}
              compact
              onClick={() => handleSelectPreset(preset)}
            />
          ))}
        </div>
      );
    })();

    return (
      <section
        className={`pomodoro-dock reveal${dimmed ? ' pomodoro-dimmed' : ''}`}
        style={{ '--i': revealIndex } as React.CSSProperties}
        aria-label="选择学习预设"
      >
        {!dimmed && <p className="pomodoro-dock__caption">选择一个预设开始专注学习</p>}
        <div className="pomodoro-dock__tray glass-2">{content}</div>
      </section>
    );
  };

  // ======================
  // RENDER: Select Preset（休息中展示休息圆盘舞台 + dock 淡出）
  // ======================
  if (step === 'select-preset') {
    return (
      <PageShell
        title="番茄钟"
        subtitle={breakMode ? '休息一下，恢复精力' : '选择预设，开始一段专注时光'}
      >
        <p className="sr-only">今日已完成 {completedRoundsToday} 轮</p>

        {breakMode ? (
          <>
            <div className="pomodoro-hero">
              {renderStage(
                breakMode,
                <RingCountdown
                  totalSeconds={breakMode === 'short_break' ? SHORT_BREAK_MINUTES * 60 : LONG_BREAK_MINUTES * 60}
                  remainingSeconds={breakRemainingSeconds}
                  mode={breakMode}
                  completedRoundsToday={completedRoundsToday}
                />,
                0,
              )}
              <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
                <Button variant="ghost" onClick={completeBreak}>
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                  跳过休息
                </Button>
              </div>
            </div>
            <div className="pomodoro-below">
              {renderPresetDock(true, 2)}
            </div>
          </>
        ) : (
          renderPresetDock(false, 0)
        )}
      </PageShell>
    );
  }

  // ======================
  // RENDER: Adjust Duration（glass-2 横条卡 + 大主按钮）
  // ======================
  if (step === 'adjust-duration' && selectedPreset) {
    return (
      <PageShell maxWidth={720} title="调整时长">
        <div
          className="glass-2 pomodoro-adjust-card reveal"
          style={{ '--i': 0 } as React.CSSProperties}
        >
          {/* 横条：已选预设信息 */}
          <div className="pomodoro-adjust-card__preset">
            <div className="pomodoro-adjust-card__preset-info">
              <p className="pomodoro-adjust-card__preset-label">已选预设</p>
              <p className="pomodoro-adjust-card__preset-name">{selectedPreset.name}</p>
            </div>
            <SubjectBadge
              subject={selectedPreset.subject as Subject}
              subSubject={selectedPreset.subSubject as SubSubject | null}
            />
            <span className="pomodoro-adjust-card__preset-duration">
              {selectedPreset.durationMinutes} 分钟
            </span>
          </div>

          {/* Duration selector */}
          <div>
            <p className="pomodoro-adjust-card__duration-label">本次专注时长</p>
            <DurationSelector value={durationMinutes} onChange={setDurationMinutes} />
          </div>

          {/* Actions */}
          <div className="pomodoro-adjust-card__actions">
            <Button variant="ghost" onClick={() => { setStep('select-preset'); setSelectedPreset(null); }}>
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              返回
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="pomodoro-cta"
              onClick={handleStartFocus}
              loading={actionLoading}
            >
              <Play size={18} strokeWidth={1.75} aria-hidden="true" />
              开始专注
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ======================
  // RENDER: Active Session（圆盘舞台为唯一主角，辅助信息收进单一侧卡）
  // ======================
  if (step === 'active' && activeSession) {
    const plannedMinutes = Math.round(totalPlannedSeconds / 60);
    return (
      <PageShell maxWidth={1080}>
        <p className="sr-only">今日已完成 {completedRoundsToday} 轮</p>

        <div className="pomodoro-active">
          <div className="pomodoro-hero">
            {renderStage(
              'focus',
              <RingCountdown
                totalSeconds={totalPlannedSeconds}
                remainingSeconds={remainingSeconds}
                mode="focus"
                completedRoundsToday={completedRoundsToday}
                subtitle={`${activeSession.presetNameSnapshot} · ${SUBJECT_LABELS[activeSession.subjectSnapshot]}`}
              />,
              0,
            )}

            {/* 操作区：圆盘正下方一排（移动端纵向堆叠） */}
            <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
              <Button variant="primary" size="lg" onClick={handleComplete} loading={actionLoading}>
                <Check size={18} strokeWidth={1.75} aria-hidden="true" />
                提前完成
              </Button>
              <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                取消
              </Button>
            </div>
          </div>

          {/* 进行中辅助信息：当前预设 / 轮次 / 计划时长，收进单一侧卡 */}
          <aside
            className="pomodoro-active__side reveal"
            style={{ '--i': 2 } as React.CSSProperties}
            aria-label="当前专注信息"
          >
            <Card className="pomodoro-side">
              <h2 className="pomodoro-side__title">当前专注</h2>
              <p
                className="pomodoro-side__preset truncate"
                title={activeSession.presetNameSnapshot}
              >
                {activeSession.presetNameSnapshot}
              </p>
              <div className="pomodoro-side__badge">
                <SubjectBadge
                  subject={activeSession.subjectSnapshot as Subject}
                  subSubject={activeSession.subSubjectSnapshot as SubSubject | null}
                />
              </div>
              <div className="pomodoro-side__rows">
                <p className="pomodoro-side__row">
                  <span className="pomodoro-side__label">今日轮次</span>
                  <span className="pomodoro-side__value tabular-nums">第 {roundCount} 轮</span>
                </p>
                <p className="pomodoro-side__row">
                  <span className="pomodoro-side__label">今日已完成</span>
                  <span className="pomodoro-side__value tabular-nums">{completedRoundsToday} 轮</span>
                </p>
                <p className="pomodoro-side__row">
                  <span className="pomodoro-side__label">计划时长</span>
                  <span className="pomodoro-side__value tabular-nums">{plannedMinutes} 分钟</span>
                </p>
              </div>
            </Card>
          </aside>
        </div>

        {/* 页面其余内容：淡出 0.4，保持可交互 */}
        <div className="pomodoro-below">
          {renderPresetDock(true, 3)}
        </div>
      </PageShell>
    );
  }

  // ======================
  // RENDER: Completed（粒子爆散 + 继续/休息入口）
  // ======================
  if (step === 'completed') {
    return (
      <PageShell maxWidth={720}>
        <p className="sr-only">今日已完成 {completedRoundsToday} 轮</p>

        <div className="pomodoro-completed">
          {/* 完成粒子：自然结束/提前完成触发一次；取消/休息结束不触发 */}
          <BurstParticles burstKey={burstKey} colorVar="--color-accent-primary" />

          <div
            className="pomodoro-hero reveal"
            style={{ '--i': 0, textAlign: 'center' } as React.CSSProperties}
          >
            <span className="glass-1 pomodoro-completed__icon" aria-hidden="true">
              <CheckCircle2 size={40} strokeWidth={1.75} />
            </span>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', margin: 0 }}>
              专注完成！
            </h2>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              很棒！今日已完成 {completedRoundsToday} 轮专注。
            </p>

            <div className="pomodoro-ops">
              <Button variant="primary" size="lg" onClick={handleContinue}>
                <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                继续专注
              </Button>
              <Button variant="glass" onClick={() => handleStartBreak('short')}>
                <Coffee size={16} strokeWidth={1.75} aria-hidden="true" />
                短休息 {SHORT_BREAK_MINUTES} 分钟
              </Button>
              {showLongBreak && (
                <Button
                  variant="glass"
                  className="pomodoro-longbreak"
                  onClick={() => handleStartBreak('long')}
                >
                  <Armchair size={16} strokeWidth={1.75} aria-hidden="true" />
                  长休息 {LONG_BREAK_MINUTES} 分钟
                </Button>
              )}
              <Button variant="ghost" onClick={handleNoBreak}>
                不休息
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return null;
}
