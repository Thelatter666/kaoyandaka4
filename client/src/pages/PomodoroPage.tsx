import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Check,
  X,
  Coffee,
  Armchair,
  CheckCircle2,
  ClipboardList,
  Compass,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Button } from '../components/ui/Button';
import { InteractiveHoverButton } from '../components/ui/InteractiveHoverButton';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { Magnetic } from '../components/ui/Magnetic';
import { DurationSelector } from '../components/presets/DurationSelector';
import { PresetCard } from '../components/presets/PresetCard';
import { RingCountdown, PROGRESS_CIRCUMFERENCE } from '../components/timer/RingCountdown';
import { BurstParticles } from '../components/timer/BurstParticles';
import { useFocusSession } from '../hooks/useFocusSession';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';
import { presetsApi, Preset } from '../api/presets';
import { statisticsApi } from '../api/statistics';
import { showToast } from '../components/ui/Toast';
import { SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES, LONG_BREAK_AFTER_ROUNDS } from '@shared/constants';
import type { Subject, SubSubject, SessionSubject } from '@shared/types';
import './PomodoroPage.css';

/**
 * 番茄钟页「光晕核心」（设计文档 5.3 / v2 12.4 / 13.4）
 *
 * v3 布局：圆盘常驻页面中央（不再经「选预设 → 调时长」两步跳转）——
 * 空闲态圆盘满环预览目标时长，下方控制卡内联 DurationSelector 与
 * 「开始专注」大按钮；底部 dock 横排预设紧凑卡（含首张「漫游专注」卡），
 * 点击预设即选中并同步时长，再次点击取消回到漫游。
 *
 * 漫游专注：未选预设直接开始，会话快照记为「漫游专注 / free」，
 * 计入总时长与完成次数并参与学习森林种树，不归属任何科目。
 *
 * 无极平滑：进行中/休息中以 rAF 逐帧刷新剩余毫秒，圆环匀速连续消减；
 * 业务规则保持不变（时长 5–120/5 分钟倍数、短休 5 / 长休 15 固定、
 * 会话恢复、完成/取消/休息记录规则、重复完成保护）。
 */

type PomodoroStep = 'idle' | 'active' | 'completed';

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
    breakMode, breakRemainingSeconds, breakEndsAt, roundCount,
    startFocus, completeFocus, cancelFocus,
    startBreak, completeBreak,
  } = useFocusSession();

  // 番茄钟进行中（专注或休息）保持屏幕点亮，不进入睡眠/休眠
  useScreenWakeLock(!!activeSession || !!breakMode);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  // UI state
  const [step, setStep] = useState<PomodoroStep>('idle');
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [actionLoading, setActionLoading] = useState(false);

  // 光晕核心：完成粒子爆散 / 今日已完成轮次（逐帧刷新已下沉至 SmoothRing 内部）
  const [burstKey, setBurstKey] = useState(0);
  const [statsRounds, setStatsRounds] = useState(0);
  /** 今日每科目累计秒数（来自 today-summary，供「距下一棵树」提示） */
  const [treeBySubject, setTreeBySubject] = useState<Record<string, number> | null>(null);
  /** 进行中会话已进行秒数（60s 间隔刷新，分钟粒度） */
  const [activeElapsedSec, setActiveElapsedSec] = useState(0);
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

  // 今日已完成轮次：优先用轻量 today-summary 端点取当日完成数（单条聚合查询，
  // 避免为一个数字拉取 /forest 全量明细）；接口不可用时回退为页面内状态推导
  useEffect(() => {
    let cancelled = false;
    statisticsApi
      .getTodaySummary()
      .then((data) => {
        if (!cancelled) {
          setStatsRounds(data.completedSessions);
          setTreeBySubject(data.bySubject);
        }
      })
      .catch(() => {
        /* 回退：仅使用页面内状态（roundCount / naturalRounds）推导 */
      });
    return () => { cancelled = true; };
  }, []);

  // 距下一棵树剩余分钟：1 树 = 3600 秒/科目（与统计页 forest 口径一致，free 漫游独立累计）
  const TREE_SECONDS = 3600;
  const treeRemainingMinutes = (subject: string, elapsedSeconds = 0): number => {
    const completed = treeBySubject?.[subject] ?? 0;
    const remaining = TREE_SECONDS - ((completed + elapsedSeconds) % TREE_SECONDS);
    return Math.ceil(remaining / 60);
  };

  // 进行中会话实时 elapsed：基于计划时长减剩余（60s 刷新，分钟粒度）
  useEffect(() => {
    if (!activeSession) return;
    const update = () => {
      const endMs = new Date(activeSession.plannedEndAt).getTime();
      const remainSec = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setActiveElapsedSec(totalPlannedSeconds - remainSec);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [activeSession]);

  // Sync with active session（会话恢复：检测到进行中会话即进入计时视图）
  useEffect(() => {
    if (activeSession) {
      setStep('active');
    }
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
    // 再次点击已选中的预设：取消选中，回到漫游专注
    if (selectedPreset?.id === preset.id) {
      setSelectedPreset(null);
      return;
    }
    setSelectedPreset(preset);
    setDurationMinutes(preset.durationMinutes);
  };

  const handleStartFocus = async () => {
    setActionLoading(true);
    try {
      // 未选预设即漫游专注：presetId 传 null
      await startFocus(selectedPreset?.id ?? null, durationMinutes, 'pomodoro');
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
      setStep('idle');
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
    setStep('idle');
    setSelectedPreset(null);
  };

  const handleContinue = () => {
    setStep('idle');
    setSelectedPreset(null);
  };

  const handleNoBreak = () => {
    setStep('idle');
    setSelectedPreset(null);
  };

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

  /** 底部预设 dock：首张「漫游专注」+ 横排紧凑卡托盘；dimmed 时淡出 0.4 保持可交互 */
  const renderPresetDock = (dimmed: boolean, revealIndex: number) => {
    const content = (() => {
      if (presetsLoading) {
        return <LoadingState message="加载预设中..." />;
      }
      if (presetsError) {
        return <ErrorState message={presetsError} onRetry={fetchPresets} />;
      }
      // 铺平为横向 dock（沿用既有科目分组顺序，选择语义不变）
      const orderedPresets = SUBJECT_ORDER.flatMap((subj) => presets.filter((p) => p.subject === subj));
      return (
        <div className="pomodoro-dock__strip">
          {/* 漫游专注：不设科目，随时出发；未选预设时呈选中态 */}
          <button
            type="button"
            className={`pomodoro-roam${!selectedPreset ? ' pomodoro-roam--selected' : ''}`}
            aria-pressed={!selectedPreset}
            onClick={() => setSelectedPreset(null)}
          >
            <span className="pomodoro-roam__icon" aria-hidden="true">
              <Compass size={18} strokeWidth={1.75} />
            </span>
            <span className="pomodoro-roam__name">漫游专注</span>
            <span className="pomodoro-roam__desc">不设科目 · 随时出发</span>
            {!selectedPreset && <span className="sr-only">已选择</span>}
          </button>
          {orderedPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              id={preset.id}
              name={preset.name}
              subject={preset.subject as Subject}
              subSubject={preset.subSubject as SubSubject | null}
              durationMinutes={preset.durationMinutes}
              compact
              isSelected={selectedPreset?.id === preset.id}
              onClick={() => handleSelectPreset(preset)}
            />
          ))}
          {presets.length === 0 && (
            <EmptyState
              icon={<ClipboardList size={40} strokeWidth={1.75} />}
              title="还没有学习预设"
              description="创建预设可按科目追踪时长；也可以直接开始漫游专注"
              actionLabel="创建第一个预设"
              onAction={() => { window.location.hash = '#/presets'; }}
            />
          )}
        </div>
      );
    })();

    return (
      <section
        className={`pomodoro-dock reveal${dimmed ? ' pomodoro-dimmed' : ''}`}
        style={{ '--i': revealIndex } as React.CSSProperties}
        aria-label="选择学习预设"
      >
        {!dimmed && <p className="pomodoro-dock__caption">选择一个预设，或直接开始漫游专注</p>}
        <div className="pomodoro-dock__tray glass-2">{content}</div>
      </section>
    );
  };

  // ======================
  // RENDER: Idle（圆盘常驻中央：满环预览 + 控制卡 + 预设 dock）
  // ======================
  if (step === 'idle') {
    return (
      <PageShell
        title="番茄钟"
        subtitle={breakMode ? '休息一下，恢复精力' : '设定时长，即刻开始一段专注'}
      >
        <p className="sr-only">今日已完成 {completedRoundsToday} 轮</p>

        {breakMode ? (
          <>
            <div className="pomodoro-hero">
              {renderStage(
                breakMode,
                <SmoothRing
                  mode={breakMode}
                  totalSeconds={breakMode === 'short_break' ? SHORT_BREAK_MINUTES * 60 : LONG_BREAK_MINUTES * 60}
                  endsAtMs={breakEndsAt}
                  fallbackRemainingSeconds={breakRemainingSeconds}
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
          <>
            <div className="pomodoro-hero">
              {renderStage(
                'focus',
                <RingCountdown
                  totalSeconds={durationMinutes * 60}
                  remainingSeconds={durationMinutes * 60}
                  mode="focus"
                  smooth
                  modeLabel="准备开始"
                  completedRoundsToday={completedRoundsToday}
                  subtitle={
                    selectedPreset
                      ? `${selectedPreset.name} · ${SUBJECT_LABELS[selectedPreset.subject as Subject]}`
                      : '漫游专注'
                  }
                />,
                0,
              )}

              {/* 控制卡：时长选择 + 开始专注（圆盘正下方横条） */}
              <div
                className="glass-2 pomodoro-control reveal"
                style={{ '--i': 1 } as React.CSSProperties}
              >
                <div className="pomodoro-control__duration">
                  <DurationSelector value={durationMinutes} onChange={setDurationMinutes} />
                </div>
                <Magnetic strength={0.2} radius={150}>
                  <InteractiveHoverButton
                    className="pomodoro-cta"
                    onClick={handleStartFocus}
                    loading={actionLoading}
                  >
                    开始专注
                  </InteractiveHoverButton>
                </Magnetic>
                <p className="pomodoro-tree-hint">
                  再专注 {treeRemainingMinutes(selectedPreset?.subject ?? 'free')} 分钟可种下一棵树
                </p>
              </div>
            </div>
            <div className="pomodoro-below">
              {renderPresetDock(false, 2)}
            </div>
          </>
        )}
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
              <SmoothRing
                mode="focus"
                totalSeconds={totalPlannedSeconds}
                endsAtMs={new Date(activeSession.plannedEndAt).getTime()}
                completedRoundsToday={completedRoundsToday}
                subtitle={
                  activeSession.subjectSnapshot === 'free'
                    ? '漫游专注'
                    : `${activeSession.presetNameSnapshot} · ${SUBJECT_LABELS[activeSession.subjectSnapshot as Subject]}`
                }
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
                  subject={activeSession.subjectSnapshot as SessionSubject}
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
                <p className="pomodoro-side__row">
                  <span className="pomodoro-side__label">距下一棵树</span>
                  <span className="pomodoro-side__value tabular-nums">
                    {treeRemainingMinutes(activeSession.subjectSnapshot as string, activeElapsedSec)} 分钟
                  </span>
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

interface SmoothRingProps {
  mode: RingMode;
  totalSeconds: number;
  /** 目标结束时间戳（ms）；为 null 时回退为外部整数秒驱动（不启 rAF） */
  endsAtMs: number | null;
  fallbackRemainingSeconds?: number;
  completedRoundsToday: number;
  subtitle?: string;
  modeLabel?: string;
}

/**
 * 无极平滑圆环：rAF 每帧不再 setState，而是通过 ref 直写进度环 circle 的
 * stroke-dashoffset（每帧零重渲染）；中心倒计时数字仍按整数秒跳字，
 * 仅在秒数变化时 setState（每秒至多一次重渲染）。视觉与旧实现一致：
 * 平滑圆环 + 每秒跳字；页面级组件树与本组件均不随 60fps 逐帧重渲染。
 */
const SmoothRing = React.memo(function SmoothRing({
  mode,
  totalSeconds,
  endsAtMs,
  fallbackRemainingSeconds = 0,
  completedRoundsToday,
  subtitle,
  modeLabel,
}: SmoothRingProps) {
  // 仅整数秒入 state：驱动中心数字每秒跳字与低时警示态切换
  const [displaySeconds, setDisplaySeconds] = useState(() =>
    endsAtMs != null
      ? Math.ceil(Math.max(0, (endsAtMs - Date.now()) / 1000))
      : fallbackRemainingSeconds
  );
  // 进度环 circle 的 DOM 引用：rAF 中绕过 React 直写 stroke-dashoffset
  const progressCircleRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    if (endsAtMs == null) return;
    let rafId = 0;
    let lastSeconds = -1;
    const tick = () => {
      const remaining = Math.max(0, (endsAtMs - Date.now()) / 1000);
      // 圆环平滑推进：直写 SVG 属性，不触发 React 重渲染
      const circle = progressCircleRef.current;
      if (circle) {
        const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, remaining / totalSeconds)) : 0;
        circle.setAttribute('stroke-dashoffset', String(PROGRESS_CIRCUMFERENCE * (1 - progress)));
      }
      // 中心倒计时文字：整数秒变化时才 setState
      const secs = Math.ceil(remaining);
      if (secs !== lastSeconds) {
        lastSeconds = secs;
        setDisplaySeconds(secs);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [endsAtMs, totalSeconds]);

  const remainingSeconds = endsAtMs != null ? displaySeconds : fallbackRemainingSeconds;

  return (
    <RingCountdown
      totalSeconds={totalSeconds}
      remainingSeconds={remainingSeconds}
      mode={mode}
      smooth
      completedRoundsToday={completedRoundsToday}
      subtitle={subtitle}
      modeLabel={modeLabel}
      progressCircleRef={progressCircleRef}
    />
  );
});
