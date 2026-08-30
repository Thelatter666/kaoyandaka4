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
import { RingCountdown, type InkSubject } from '../components/timer/RingCountdown';
import { surfaceY } from '../components/timer/inkSurface';
import { BurstParticles } from '../components/timer/BurstParticles';
import { pauseRemainingSeconds, sessionRemainingSeconds } from '../utils/focusPause';
import { formatSeconds } from '../utils/duration';
import { useFocusSession } from '../hooks/useFocusSession';
import type { FocusMode } from '../hooks/useFocusSession';
import { SoundToggle } from '../components/ui/SoundToggle';
import { initSoundOnGesture, playEndSound } from '../utils/sound';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';
import { presetsApi, Preset } from '../api/presets';
import { statisticsApi } from '../api/statistics';
import { showToast } from '../components/ui/Toast';
import { SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES, LONG_BREAK_AFTER_ROUNDS } from '@shared/constants';
import type { Subject, SubSubject, SessionSubject } from '@shared/types';
import './PomodoroPage.css';

/**
 * 番茄钟页砚池（spec docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md）
 *
 * v3 布局：砚池常驻页面中央（不再经「选预设 → 调时长」两步跳转）——
 * 空闲态砚池满池预览目标时长，下方控制卡内联 DurationSelector 与
 * 「开始专注」大按钮；底部 dock 横排预设紧凑卡（含首张「漫游专注」卡），
 * 点击预设即选中并同步时长，再次点击取消回到漫游。
 *
 * 漫游专注：未选预设直接开始，会话快照记为「漫游专注 / free」，
 * 计入总时长与完成次数并参与学习森林种树，不归属任何科目。
 *
 * 无极平滑：进行中/休息中以 rAF 逐帧刷新剩余毫秒，墨面连续下降（等面积映射）；
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

/** 注墨时长（ms），与 tokens.css 的 --dur-inking 保持一致（rAF 内插值，非 CSS 过渡） */
const INKING_MS = 520;
/** 澄清时长（ms），与 tokens.css 的 --dur-clarify 保持一致；播完才切完成态 */
const CLARIFY_MS = 700;

/** 专注中砚池副标题：漫游固定文案；预设会话为「预设名 · 科目」 */
const focusSubtitle = (session: {
  subjectSnapshot: string;
  presetNameSnapshot: string;
}): string =>
  session.subjectSnapshot === 'free'
    ? '漫游专注'
    : `${session.presetNameSnapshot} · ${SUBJECT_LABELS[session.subjectSnapshot as Subject]}`;

export function PomodoroPage() {
  const {
    activeSession,
    breakMode, breakRemainingSeconds, breakEndsAt, breakEndMode, roundCount,
    startFocus, completeFocus, cancelFocus, pauseFocus, resumeFocus,
    startBreak, completeBreak,
  } = useFocusSession();

  /** 判断暂停一律看 pausedAt（ADR-0006）；页面多处使用，置于最前 */
  const paused = !!activeSession?.pausedAt;

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
  /** 暂停剩余秒数（1s 递减；0 = 已到点自动恢复） */
  const [pauseLeftSec, setPauseLeftSec] = useState(0);

  // 砚池：完成粒子爆散 / 今日已完成轮次（逐帧刷新已下沉至 SmoothRing 内部）
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
  /** 响铃 worker：后台标签页准点触发（worker 定时器不受页面后台节流） */
  const soundWorkerRef = useRef<Worker | null>(null);
  /** 当前武装的响铃 tag：worker 到点消息只有 tag 匹配才播放，防竞态误响 */
  const armedTagRef = useRef<string | null>(null);
  /** 开始专注瞬间的点火动画：一次 240ms scale 沉降 + 聚光灯涌起 */
  const [igniting, setIgniting] = useState(false);
  /** 澄清阶段：完成后先播砚池澄清 700ms 再切完成态——完成卡会 display:none 掉砚池，
   *  立即切换会使澄清连一帧播放窗口都没有（spec §7.2） */
  const [clarifying, setClarifying] = useState(false);
  const clarifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 最近一次专注会话的钟参数：澄清窗口内会话已结束、完成态未切换，砚池以这份
   *  冻结参数渲染，墨面停在结束瞬间的高度完成转清（spec §5.3，不落入空闲满池） */
  const lastTimedRingRef = useRef<{
    mode: RingMode;
    totalSeconds: number;
    endsAtMs: number;
    subject: InkSubject;
    subtitle?: string;
  } | null>(null);

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
  // 计划时长在 effect 内从 activeSession 派生（声明在下方,deps 引用会 TDZ）
  useEffect(() => {
    if (!activeSession) return;
    const planned = activeSession.plannedDurationSeconds || 0;
    const update = () => {
      const endMs = new Date(activeSession.plannedEndAt).getTime();
      const remainSec = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setActiveElapsedSec(planned - remainSec);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [activeSession]);

  // 标签页标题实时倒计时：Web Worker 每秒刷新（不受后台标签页 interval 节流），
  // 切到其他标签页看网课/学习时从标签栏即可扫读剩余；结束/离开时恢复原标题
  useEffect(() => {
    if (!activeSession && !breakMode) return;
    const baseTitle = document.title;
    const endMs = breakMode ? (breakEndsAt ?? 0) : new Date(activeSession?.plannedEndAt ?? '').getTime();
    const label = breakMode ? '休息' : '专注';
    const worker = new Worker(new URL('../workers/countdown-title.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<string>) => { document.title = e.data; };
    worker.postMessage({ endMs, label });
    return () => {
      worker.terminate();
      document.title = baseTitle;
    };
  }, [activeSession, breakMode, breakEndsAt]);

  // Sync with active session（会话恢复：检测到进行中会话即进入计时视图）
  useEffect(() => {
    if (activeSession) {
      setStep('active');
    }
  }, [activeSession]);

  // 记录最近一次专注会话的钟参数（供澄清窗口冻结渲染，见 lastTimedRingRef 注释）
  useEffect(() => {
    if (activeSession) {
      lastTimedRingRef.current = {
        mode: 'focus',
        totalSeconds: activeSession.plannedDurationSeconds,
        endsAtMs: new Date(activeSession.plannedEndAt).getTime(),
        subject: activeSession.subjectSnapshot as InkSubject,
        subtitle: focusSubtitle(activeSession),
      };
    }
  }, [activeSession]);

  // 会话恢复（刷新后）按快照名匹配预设恢复选中态；匹配不到（预设已删/漫游）退回漫游。
  // 仅在 activeSession 首次出现时执行一次（presetRestoreRef），不干扰用户手动取消选中
  const presetRestoreRef = useRef(false);
  useEffect(() => {
    if (!activeSession || presets.length === 0 || presetRestoreRef.current) return;
    presetRestoreRef.current = true;
    if (activeSession.subjectSnapshot === 'free') return;
    const match = presets.find((p) => p.name === activeSession.presetNameSnapshot);
    if (match) {
      setSelectedPreset(match);
      setDurationMinutes(match.durationMinutes);
    }
  }, [activeSession, presets]);

  // 卸载清理：澄清定时器不得在组件卸载后仍触发完成态切换
  useEffect(() => () => {
    if (clarifyTimerRef.current) clearTimeout(clarifyTimerRef.current);
  }, []);

  // 会话自然结束检测：activeSession 由有变无且非完成/取消按钮触发
  // （后端对到期会话自动完成并记录），先播砚池澄清再进完成页
  useEffect(() => {
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = activeSession?.id ?? null;
    if (prevId && !activeSession) {
      if (selfEndedRef.current) {
        selfEndedRef.current = false;
        return;
      }
      // 兜底：worker 未武装成功或消息丢失时，页面检测到自然结束补响一次
      if (armedTagRef.current === prevId) {
        armedTagRef.current = null;
        void playEndSound();
      }
      // 自然结束的墨面已见底，澄清以涟漪为主（spec §5.3）
      setNaturalRounds((n) => n + 1);
      setClarifying(true);
      clarifyTimerRef.current = setTimeout(() => {
        setClarifying(false);
        setBurstKey((k) => k + 1);
        setStep('completed');
      }, CLARIFY_MS);
    }
  }, [activeSession]);

  // 武装/解除响铃 worker：有进行中专注或休息时按结束时间武装；手动结束或
  // 离开页面时解除（armedTagRef 同步清空，避免迟到的 'end' 消息误触发播放）
  useEffect(() => {
    let endMs: number | null = null;
    let tag: string | null = null;
    // 暂停中解除武装：plannedEndAt 将被顺延，旧武装到点会误响；恢复后本 effect
    // 重跑按新结束时间重新武装
    if (activeSession && !paused) {
      endMs = new Date(activeSession.plannedEndAt).getTime();
      tag = activeSession.id;
    } else if (breakMode && breakEndsAt) {
      endMs = breakEndsAt;
      tag = `break:${breakEndsAt}`;
    }

    if (endMs === null || tag === null) {
      if (soundWorkerRef.current) {
        soundWorkerRef.current.postMessage({ type: 'disarm' });
        soundWorkerRef.current.terminate();
        soundWorkerRef.current = null;
      }
      armedTagRef.current = null;
      return;
    }

    if (!soundWorkerRef.current) {
      soundWorkerRef.current = new Worker(new URL('../workers/end-sound.ts', import.meta.url), {
        type: 'module',
      });
      soundWorkerRef.current.onmessage = (e: MessageEvent<{ type: 'end'; tag: string }>) => {
        const { type, tag: firedTag } = e.data;
        // 仅当 tag 与当前武装一致且非手动结束（提前完成/取消）才播放；
        // 休息 tag（break:*）播休息提示音，专注会话播结束钟声
        if (type === 'end' && firedTag === armedTagRef.current && !selfEndedRef.current) {
          armedTagRef.current = null;
          void playEndSound(firedTag.startsWith('break:') ? 'break' : 'focus');
        }
      };
    }
    armedTagRef.current = tag;
    soundWorkerRef.current.postMessage({ type: 'arm', endMs, tag });
  }, [activeSession, breakMode, breakEndsAt, paused]);

    // 休息自然结束兜底：worker 未响时，页面检测 breakMode 消失 + natural 标记补响
    const prevBreakModeRef = useRef<FocusMode | null>(null);
    useEffect(() => {
      const prev = prevBreakModeRef.current;
      prevBreakModeRef.current = breakMode;
      if (prev && !breakMode && breakEndMode === 'natural' && armedTagRef.current !== null) {
        armedTagRef.current = null;
        void playEndSound('break');
      }
    }, [breakMode, breakEndMode]);

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
      // 用户手势即解锁音频（浏览器自动播放策略），后续自然结束才能响铃
      initSoundOnGesture();
      // 未选预设即漫游专注：presetId 传 null
      await startFocus(selectedPreset?.id ?? null, durationMinutes, 'pomodoro');
      setStep('active');
      setIgniting(true);
      window.setTimeout(() => setIgniting(false), 260);
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
      // 提前完成：墨面尚有高度，澄清的转清明显，读作「还剩这么多但我收工了」（spec §5.3）
      setClarifying(true);
      clarifyTimerRef.current = setTimeout(() => {
        setClarifying(false);
        setBurstKey((k) => k + 1);
        setStep('completed');
      }, CLARIFY_MS);
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

  const handlePause = async () => {
    setActionLoading(true);
    try {
      await pauseFocus();
    } catch {
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
    // 保留 selectedPreset 与 durationMinutes：完成态返回后砚池/控制卡
    // 仍呈现刚才的预设（需求 2）；取消/休息入口才清空
    setStep('idle');
  };

  const handleNoBreak = () => {
    setStep('idle');
    setSelectedPreset(null);
  };

  const totalPlannedSeconds = activeSession?.plannedDurationSeconds || 0;

  // 暂停倒计时：自 pausedAt 起算（上限 5 分钟），到点自动恢复。后台标签页 interval
  // 被节流时，回前台由 getActive 惰性恢复链兜底（spec §2，ADR-0006）
  useEffect(() => {
    if (!paused || !activeSession?.pausedAt) {
      setPauseLeftSec(0);
      return;
    }
    const pausedAtMs = new Date(activeSession.pausedAt).getTime();
    const update = () => {
      const left = pauseRemainingSeconds(pausedAtMs, Date.now());
      setPauseLeftSec(left);
      return left;
    };
    if (update() <= 0) return;
    const timer = setInterval(() => {
      if (update() <= 0) {
        clearInterval(timer);
        void resumeFocus();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, activeSession?.pausedAt, resumeFocus]);

  // Determine if we should show long break option（沿用既有规则）
  const showLongBreak = roundCount % LONG_BREAK_AFTER_ROUNDS === 0 && roundCount > 0;

  // 今日已完成轮次：统计接口种子 + 本页按钮完成（roundCount 自 1 起）+ 自然结束
  const completedRoundsToday = statsRounds + Math.max(0, roundCount - 1) + naturalRounds;

  const breakTotalSeconds = breakMode === 'short_break' ? SHORT_BREAK_MINUTES * 60 : LONG_BREAK_MINUTES * 60;

  // 钟的 props 由 step 派生：单一常驻 SmoothRing，永不重挂
  const ringProps = (() => {
    if (step === 'active' && activeSession) {
      if (paused) {
        // 暂停：砚池冻结在暂停时刻的墨面高度，不启 rAF（endsAtMs=null 走 fallback）
        return {
          mode: 'focus' as RingMode,
          totalSeconds: totalPlannedSeconds,
          endsAtMs: null,
          fallbackRemainingSeconds: sessionRemainingSeconds(
            new Date(activeSession.plannedEndAt).getTime(),
            activeSession.pausedAt ? new Date(activeSession.pausedAt).getTime() : null,
            Date.now()
          ),
          subject: activeSession.subjectSnapshot as InkSubject,
          subtitle: focusSubtitle(activeSession),
          modeLabel: '暂停中',
        };
      }
      return {
        mode: 'focus' as RingMode,
        totalSeconds: totalPlannedSeconds,
        endsAtMs: new Date(activeSession.plannedEndAt).getTime(),
        fallbackRemainingSeconds: 0,
        subject: activeSession.subjectSnapshot as InkSubject,
        subtitle: focusSubtitle(activeSession),
      };
    }
    if (breakMode) {
      return {
        mode: breakMode as RingMode,
        totalSeconds: breakTotalSeconds,
        endsAtMs: breakEndsAt,
        fallbackRemainingSeconds: breakRemainingSeconds,
      };
    }
    // 澄清窗口：会话已结束、完成态未切换（step 仍为 active）。以冻结参数渲染，
    // 墨面停在结束瞬间的高度（自然结束 ≈ 0 / 提前完成 = 剩余高度），不启 rAF。
    // 若落入空闲满池预览，墨面回涨会被读作「重新开始」（spec §5.3 明确排除）
    if ((step === 'active' || clarifying) && lastTimedRingRef.current) {
      const last = lastTimedRingRef.current;
      return {
        mode: last.mode,
        totalSeconds: last.totalSeconds,
        endsAtMs: null,
        fallbackRemainingSeconds: Math.max(0, Math.ceil((last.endsAtMs - Date.now()) / 1000)),
        subject: last.subject,
        subtitle: last.subtitle,
      };
    }
    return {
      mode: 'focus' as RingMode,
      totalSeconds: durationMinutes * 60,
      endsAtMs: null,
      fallbackRemainingSeconds: durationMinutes * 60,
      modeLabel: '准备开始',
      emptyPool: true,
      subject: (selectedPreset?.subject as InkSubject | undefined) ?? 'free',
      subtitle: selectedPreset
        ? `${selectedPreset.name} · ${SUBJECT_LABELS[selectedPreset.subject as Subject]}`
        : '漫游专注',
    };
  })();

  const plannedMinutes = Math.round(totalPlannedSeconds / 60);

  // ======================
  // 共享片段
  // ======================

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
  // RENDER: 单一常驻树（钟跨步骤持续挂载，辅助内容按条件浮现）
  // ======================
  return (
    <PageShell
      title="番茄钟"
      subtitle={breakMode ? '休息一下，恢复精力' : '设定时长，即刻开始一段专注'}
      actions={<SoundToggle />}
      maxWidth={step === 'active' ? 1080 : step === 'completed' ? 720 : undefined}
    >
      <p className="sr-only">今日已完成 {completedRoundsToday} 轮</p>

      <div className={step === 'active' && activeSession ? 'pomodoro-active' : undefined}>
        <div className="pomodoro-hero">
          {/* 常驻舞台：钟跨步骤持续存在，props 随状态演化 */}
          <div
            className={`pomodoro-hero__stage pomodoro-hero__stage--${ringProps.mode}${
              step === 'completed' ? ' pomodoro-hero__stage--hidden' : ''
            }${igniting ? ' pomodoro-hero__stage--ignite' : ''}${
              clarifying ? ' pomodoro-hero__stage--clarify' : ''
            }`}
          >
            <span className="pomodoro-stage__glow" aria-hidden="true" />
            <SmoothRing {...ringProps} clarifying={clarifying} completedRoundsToday={completedRoundsToday} />
          </div>

          {step === 'idle' && !breakMode && (
            /* 控制卡：时长选择 + 开始专注（圆盘正下方横条） */
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
          )}

          {step === 'idle' && breakMode && (
            <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
              <Button variant="ghost" onClick={completeBreak}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                跳过休息
              </Button>
            </div>
          )}

          {step === 'active' && activeSession && !paused && (
            /* 操作区：圆盘正下方一排（移动端纵向堆叠） */
            <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
              <Button variant="primary" size="lg" onClick={handleComplete} loading={actionLoading}>
                <Check size={18} strokeWidth={1.75} aria-hidden="true" />
                提前完成
              </Button>
              <Button variant="glass" onClick={handlePause} disabled={actionLoading}>
                暂停
              </Button>
              <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                取消
              </Button>
            </div>
          )}

          {step === 'active' && activeSession && paused && (
            /* 暂停态：倒计时 + 继续专注（主）/取消；「提前完成」隐藏（W4） */
            <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
              <p
                className="pomodoro-pause-timer"
                role="timer"
                aria-label={`暂停剩余 ${Math.ceil(pauseLeftSec / 60)} 分钟`}
              >
                {formatSeconds(pauseLeftSec)}
              </p>
              <Button variant="primary" size="lg" onClick={() => void resumeFocus()} loading={actionLoading}>
                <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                继续专注
              </Button>
              <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                取消专注
              </Button>
            </div>
          )}
        </div>

        {step === 'active' && activeSession && (
          /* 进行中辅助信息：当前预设 / 轮次 / 计划时长，收进单一侧卡 */
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
        )}
      </div>

      {step === 'completed' ? (
        /* 完成态：粒子爆散 + 继续/休息入口（钟随舞台隐藏，保持挂载不重挂）。
           key 强制重挂载：与下方 .pomodoro-below 分支的 div 区分，否则 React 复用
           DOM 节点（仅换 className），@starting-style 入场不触发 */
        <div key="completed" className="pomodoro-completed">
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
      ) : (
        /* 页面其余内容：淡出 0.4，保持可交互（专注进行中或休息中均淡出） */
        <div className="pomodoro-below">
          {renderPresetDock(step === 'active' || breakMode !== null, step === 'active' ? 3 : 2)}
        </div>
      )}
    </PageShell>
  );
}

interface SmoothRingProps {
  mode: RingMode;
  totalSeconds: number;
  /** 目标结束时间戳（ms）；为 null 时回退为外部整数秒驱动（不启 rAF） */
  endsAtMs: number | null;
  fallbackRemainingSeconds?: number;
  completedRoundsToday: number;
  /** 决定墨色；休息态由 mode 覆盖为清水色 */
  subject?: InkSubject;
  /** 空池预览（未开始）：墨面 h=0，目标时长以阳文呈现（spec §4.1） */
  emptyPool?: boolean;
  subtitle?: string;
  modeLabel?: string;
  /** 澄清阶段：给砚池根注入 inkwell--clarify，触发转清/涟漪/水痕刻入 */
  clarifying?: boolean;
}

/**
 * 砚池平滑驱动：rAF 每帧不再 setState，而是把墨面 y 直写为 2 个 .surf-g 与
 * 1 个 .surf-clip 的 transform（每帧零重渲染）；中心倒计时数字仍按整数秒跳字，
 * 仅在秒数变化时 setState（每秒至多一次重渲染）。注墨（520ms）在同一 rAF 内
 * 插值实现——CSS 过渡会被逐帧写入反复重启，产生阻尼拖尾而非干净的上升。
 */
const SmoothRing = React.memo(function SmoothRing({
  mode,
  totalSeconds,
  endsAtMs,
  fallbackRemainingSeconds = 0,
  completedRoundsToday,
  subject,
  emptyPool = false,
  subtitle,
  modeLabel,
  clarifying = false,
}: SmoothRingProps) {
  // 仅整数秒入 state：驱动中心数字每秒跳字与低时警示态切换
  const [displaySeconds, setDisplaySeconds] = useState(() =>
    endsAtMs != null
      ? Math.ceil(Math.max(0, (endsAtMs - Date.now()) / 1000))
      : fallbackRemainingSeconds
  );

  // 砚池根元素 + 需逐帧平移的元素集合（墨体 .inkwell__surf-g ×2 与
  // 阳文裁剪 .inkwell__surf-clip ×1）。不用回调 ref 收集数组：React 18 卸载时
  // 回调只收到 null，无法精确移除对应元素，数组会留悬垂引用
  const rootRef = useRef<HTMLDivElement>(null);
  const surfEls = useRef<SVGElement[]>([]);
  /** 注墨窗口结束时刻（ms）；null = 不在注墨中 */
  const inkingUntilRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    surfEls.current = root
      ? Array.from(root.querySelectorAll<SVGElement>('.inkwell__surf-g, .inkwell__surf-clip'))
      : [];
  }, [mode, totalSeconds]);

  useEffect(() => {
    if (endsAtMs == null) return;
    let rafId = 0;
    let lastSeconds = -1;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, (endsAtMs - now) / 1000);
      const live = totalSeconds > 0 ? Math.min(1, Math.max(0, remaining / totalSeconds)) : 0;

      // 注墨（spec §5.1）：520ms 内墨面自池底升至当前应有高度，之后交回实时值
      let fraction = live;
      const until = inkingUntilRef.current;
      if (until !== null) {
        if (now >= until) {
          inkingUntilRef.current = null;
        } else {
          const k = 1 - (until - now) / INKING_MS;
          fraction = easeOut(Math.min(1, Math.max(0, k))) * live;
        }
      }

      // 墨面平滑推进：直写 SVG transform，不触发 React 重渲染
      const tf = `translate(0 ${surfaceY(fraction).toFixed(2)})`;
      for (const el of surfEls.current) el.setAttribute('transform', tf);

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

  // 会话切换即触发一次注墨（endsAtMs 变化 = 新会话开始或恢复）
  useEffect(() => {
    if (endsAtMs == null) return;
    // 会话恢复（刷新后墨面本就该在中途）不播注墨：仅当剩余接近计划时长才视为新开始
    const remaining = (endsAtMs - Date.now()) / 1000;
    if (totalSeconds > 0 && remaining > totalSeconds - 2) {
      inkingUntilRef.current = Date.now() + INKING_MS;
    }
  }, [endsAtMs, totalSeconds]);

  const remainingSeconds = endsAtMs != null ? displaySeconds : fallbackRemainingSeconds;

  return (
    <RingCountdown
      totalSeconds={totalSeconds}
      remainingSeconds={remainingSeconds}
      mode={mode}
      subject={subject}
      emptyPool={emptyPool}
      completedRoundsToday={completedRoundsToday}
      subtitle={subtitle}
      modeLabel={modeLabel}
      rootRef={rootRef}
      extraClassName={clarifying ? 'inkwell--clarify' : undefined}
    />
  );
});
