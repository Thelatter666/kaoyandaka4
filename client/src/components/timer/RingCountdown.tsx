import React, { useId, useMemo } from 'react';
import { formatSeconds } from '../../utils/duration';
import { surfaceY } from './inkSurface';
import { WAVE_PATHS, type WaveVariant } from './inkWavePaths';
import './RingCountdown.css';

/**
 * 砚池 Inkstone Well
 * 设计：docs/superpowers/specs/2026-08-21-pomodoro-inkwell-design.md
 * 决策：docs/adr/0001~0004 · 术语：CONTEXT.md
 *
 * 一方砚台的墨池：墨面高度表达本轮剩余（等面积映射，ADR-0003），池壁外沿水痕
 * 表达今日累积（ADR-0001）。计时文字随墨面在阳文/阴文间连续切换（ADR-0002）；
 * 深色主题不做阴文，文字恒为阳文近白字（ADR-0004）。
 *
 * 层序（底→顶）：砚石池底 → 砚石纹 → 墨体(mask 挖字=阴文) → 反光带 →
 * 阳文(裁剪至墨面之上) → 凹面暗角 → 池壁泛金 → 涟漪 → 水痕(不受墨堂裁剪)
 *
 * ⚠ 四条结构禁忌（原型阶段逐一踩过，勿重犯）：
 *  1. <clipPath> 子元素只能是 shape/text/use —— 不得套 <g> 承载平移，否则裁剪区
 *     为空、阳文被整体裁掉；而 getBBox() 不受裁剪影响，读数正常极易误判为正常。
 *     竖向平移放在 <clipPath> 自身 transform 上。
 *  2. mask 必须挂在未被平移的外层组 —— 挂在 translate 之内会使挖空坐标整体偏移，
 *     阴文静默失效。
 *  3. 砚石纹不得进入中心文字安全区（r < R_SAFE），否则深斑点把数字糊成一团。
 *  4. CSS 的 fill 规则必须限定在 .inkwell__relief 之内 —— CSS 优先级高于呈现属性，
 *     无限定的 fill 会染掉 mask 内的黑字，使阴文挖空静默失效。
 */

type TimerMode = 'focus' | 'short_break' | 'long_break';
export type InkSubject = 'math' | 'english' | '408' | 'free';

interface RingCountdownProps {
  totalSeconds: number;
  remainingSeconds: number;
  mode: TimerMode;
  /** 决定墨色；休息态由 mode 覆盖为清水色 */
  subject?: InkSubject;
  ariaLabel?: string;
  /** 今日已完成轮次 → 水痕道数；满 60 道外扩第二圈 */
  completedRoundsToday?: number;
  /** 中心副标题（预设名 + 科目）；文字已移入 SVG，按字宽截断 */
  subtitle?: string;
  /** 模式文字覆盖（如空闲态显示「准备开始」） */
  modeLabel?: string;
  /** full＝400px 完整砚池；mini＝120px（仅池底/墨面/阳文数字/凹陷/低时变色） */
  variant?: 'full' | 'mini';
  /** 空池预览（未开始，spec §4.1）：墨面 h=0 露出砚石池底，目标时长以阳文呈现。
   *  若空闲态按满池渲染，开始专注的注墨会先从满池跳到 0 再升回满池，观感为故障 */
  emptyPool?: boolean;
  /** 根元素 ref：供 SmoothRing 查出需逐帧平移的元素（.surf-g 与 .surf-clip） */
  rootRef?: React.Ref<HTMLDivElement>;
  /** 追加到根元素 class（PomodoroPage 用它注入 inkwell--clarify 触发澄清） */
  extraClassName?: string;
}

const MODE_LABELS: Record<TimerMode, string> = {
  focus: '专注中',
  short_break: '短休息',
  long_break: '长休息',
};

const VB = 360;
const C = 180;
const R_WALL = 160;
/** 中心文字安全区半径：砚石纹不得侵入（结构禁忌 3） */
const R_SAFE = 104;
const R_MARK_IN = 168;
const R_MARK_OUT = 176;
/** 一圈水痕道数：6° 间隔 → 60 道满圈，其后外扩第二圈 */
const MARKS_PER_RING = 60;
const MARK_STEP_DEG = 6;
const MARK_RING_GAP = 12;
/** 低时警示阈值：沿用旧环形设计的既有行为，用户已有预期 */
const LOW_TIME_THRESHOLD_SECONDS = 300;
/** 副标题按字宽截断上限（全宽计 1、半宽计 0.5），依据 spec §6.3 的弦宽推导 */
const SUBTITLE_WIDTH_LIMIT = 18;
/** 砚石纹斑点数 */
const STONE_SPOT_COUNT = 22;

/** 分钟粒度 aria-label，避免 aria-live 每秒播报 */
function buildDefaultAriaLabel(mode: TimerMode, remainingSeconds: number): string {
  if (remainingSeconds > 0 && remainingSeconds < 60) {
    return `${MODE_LABELS[mode]} 剩余不到 1 分钟`;
  }
  const snapped = Math.floor(remainingSeconds / 60) * 60;
  return `${MODE_LABELS[mode]} 剩余 ${Math.floor(snapped / 60)} 分 ${snapped % 60} 秒`;
}

/** 按字宽截断：全宽字符计 1、半宽计 0.5（文字已移入 SVG，CSS ellipsis 失效） */
export function truncateByWidth(text: string, limit: number): string {
  let width = 0;
  let out = '';
  for (const ch of text) {
    width += /[\u2E80-\u9FFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.5;
    if (width > limit) return `${out}…`;
    out += ch;
  }
  return out;
}

interface StoneSpot {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  opacity: number;
}

/** 砚石纹：确定性 seed 斑点，仅布于环带 [R_SAFE, R_WALL-16]，中心留白给文字 */
function buildStoneSpots(): StoneSpot[] {
  let seed = 20260821;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: STONE_SPOT_COUNT }, () => {
    const angle = rnd() * Math.PI * 2;
    const radius = R_SAFE + rnd() * (R_WALL - 16 - R_SAFE);
    return {
      cx: C + Math.cos(angle) * radius,
      cy: C + Math.sin(angle) * radius,
      rx: 3 + rnd() * 8,
      ry: 2 + rnd() * 5,
      rot: rnd() * 180,
      opacity: 0.1 + rnd() * 0.12,
    };
  });
}

export function RingCountdown({
  totalSeconds,
  remainingSeconds,
  mode,
  subject = 'free',
  ariaLabel,
  completedRoundsToday = 0,
  subtitle,
  modeLabel,
  variant = 'full',
  emptyPool = false,
  rootRef,
  extraClassName,
}: RingCountdownProps) {
  const isMini = variant === 'mini';
  // useId 含冒号，不能直接用于 url(#...)，清洗后作为 defs id 前缀
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const spots = useMemo(() => (isMini ? [] : buildStoneSpots()), [isMini]);

  const fraction = emptyPool
    ? 0
    : totalSeconds > 0
      ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds))
      : 0;
  const isLowTime = mode === 'focus' && remainingSeconds <= LOW_TIME_THRESHOLD_SECONDS;
  const isBreak = mode !== 'focus';

  const waveVariant: WaveVariant = isLowTime ? 'lowtime' : isBreak ? 'break' : 'normal';
  const paths = WAVE_PATHS[waveVariant];

  const displaySeconds = Math.ceil(remainingSeconds);
  const timeStr = formatSeconds(displaySeconds);
  const label = ariaLabel ?? buildDefaultAriaLabel(mode, displaySeconds);
  const shownSubtitle = subtitle ? truncateByWidth(subtitle, SUBTITLE_WIDTH_LIMIT) : undefined;
  const shownModeLabel = modeLabel ?? MODE_LABELS[mode];
  // 首帧就位；进行中由 SmoothRing 每帧直写覆盖
  const initialTransform = `translate(0 ${surfaceY(fraction).toFixed(2)})`;
  const timeFontSize = isMini ? 46 : 62;

  // 墨色：休息态覆盖科目色
  const inkVar = isBreak ? '--color-ink-break' : `--color-ink-${subject}`;

  const classNames = [
    'inkwell',
    `inkwell--${mode}`,
    isLowTime ? 'inkwell--lowtime' : '',
    isBreak ? 'inkwell--break' : '',
    isMini ? 'inkwell--mini' : '',
    extraClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={classNames}
      role="timer"
      aria-live="polite"
      aria-label={label}
      style={{ '--_ink': `var(${inkVar})` } as React.CSSProperties}
    >
      <div className="inkwell__hall glass-2">
        <svg
          className="inkwell__svg"
          viewBox={`0 0 ${VB} ${VB}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id={`hall-${uid}`}>
              <circle cx={C} cy={C} r={R_WALL} />
            </clipPath>

            {/* 阴文：以文字为 mask 从墨中挖空，透出砚石池底。
                使用此 mask 的组不得被平移（结构禁忌 2）。
                mask 内文字靠 fill="#000" 呈现属性挖空，CSS 不得覆盖（结构禁忌 4）。 */}
            <mask id={`inkMask-${uid}`}>
              <rect x={0} y={0} width={VB} height={VB} fill="#fff" />
              <text
                className="inkwell__t-time"
                x={C}
                y={C}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={timeFontSize}
                fill="#000"
              >
                {timeStr}
              </text>
              {!isMini && (
                <>
                  <text
                    className="inkwell__t-mode"
                    x={C}
                    y={C + 52}
                    textAnchor="middle"
                    fontSize={15}
                    fill="#000"
                  >
                    {shownModeLabel}
                  </text>
                  {shownSubtitle && (
                    <text
                      className="inkwell__t-sub"
                      x={C}
                      y={C + 76}
                      textAnchor="middle"
                      fontSize={13}
                      fill="#000"
                    >
                      {shownSubtitle}
                    </text>
                  )}
                </>
              )}
            </mask>

            {/* 阳文裁剪：竖向平移放在 clipPath 自身 transform（结构禁忌 1），
                横向波动由内部 path 的 CSS 动画负责。与墨体共用同一条波边缘，
                故两者严格互补，墨面推进时文字自动从阳转阴、无跳变。 */}
            <clipPath
              id={`reliefClip-${uid}`}
              className="inkwell__surf-clip"
              transform={initialTransform}
            >
              <path className="inkwell__wave-a" d={paths.reliefA} />
            </clipPath>

            <radialGradient id={`stone-${uid}`} cx="42%" cy="34%" r="78%">
              <stop offset="0%" stopColor="var(--color-ink-stone)" />
              <stop offset="100%" stopColor="var(--color-ink-stone-deep)" />
            </radialGradient>
            <radialGradient id={`concave-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="72%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="var(--color-ink-concave)" />
            </radialGradient>
          </defs>

          <g clipPath={`url(#hall-${uid})`}>
            {/* 砚石池底 */}
            <circle cx={C} cy={C} r={R_WALL} fill={`url(#stone-${uid})`} />
            {spots.map((sp, i) => (
              <ellipse
                key={i}
                cx={sp.cx}
                cy={sp.cy}
                rx={sp.rx}
                ry={sp.ry}
                transform={`rotate(${sp.rot} ${sp.cx} ${sp.cy})`}
                fill="var(--color-ink-stone-deep)"
                opacity={sp.opacity}
              />
            ))}

            {/* 墨体：外层承载 mask（不平移），内层承载竖向平移 */}
            <g className="inkwell__body" mask={`url(#inkMask-${uid})`}>
              <g className="inkwell__surf-g" transform={initialTransform}>
                {!isMini && (
                  <g className="inkwell__glow">
                    <path className="inkwell__wave-a" d={paths.inkA} fill="var(--_ink)" />
                  </g>
                )}
                {!isMini && (
                  <path
                    className="inkwell__wave-b"
                    d={paths.inkB}
                    fill="var(--_ink)"
                    opacity={0.45}
                  />
                )}
                <path className="inkwell__wave-a" d={paths.inkA} fill="var(--_ink)" />
              </g>
            </g>

            {/* 反光带：静态高光线，随墨面同降，不游走 */}
            {!isMini && (
              <g className="inkwell__surf-g" transform={initialTransform}>
                <line
                  className="inkwell__highlight"
                  x1={C - R_WALL}
                  y1={0}
                  x2={C + R_WALL}
                  y2={0}
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* 阳文：实体字，裁剪到墨面之上（深色主题由 CSS 解除裁剪） */}
            <g className="inkwell__relief" clipPath={`url(#reliefClip-${uid})`}>
              <text
                className="inkwell__t-time"
                x={C}
                y={C}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={timeFontSize}
              >
                {timeStr}
              </text>
              {!isMini && (
                <>
                  <text
                    className="inkwell__t-mode"
                    x={C}
                    y={C + 52}
                    textAnchor="middle"
                    fontSize={15}
                  >
                    {shownModeLabel}
                  </text>
                  {shownSubtitle && (
                    <text
                      className="inkwell__t-sub"
                      x={C}
                      y={C + 76}
                      textAnchor="middle"
                      fontSize={13}
                    >
                      {shownSubtitle}
                    </text>
                  )}
                </>
              )}
            </g>

            {/* 凹面暗角 */}
            <circle
              cx={C}
              cy={C}
              r={R_WALL}
              fill={`url(#concave-${uid})`}
              pointerEvents="none"
            />

            {/* 池壁内缘低时泛金 */}
            <circle
              className="inkwell__lowring"
              cx={C}
              cy={C}
              r={R_WALL - 4}
              fill="none"
              strokeWidth={8}
            />

            {/* 涟漪：仅澄清阶段出现 */}
            <circle className="inkwell__ripple" cx={C} cy={C} r={6} fill="none" />
          </g>

          {/* 水痕：池壁外沿，不受墨堂裁剪 */}
          {!isMini && (
            <g className="inkwell__marks">
              {Array.from(
                { length: Math.max(0, Math.floor(completedRoundsToday)) },
                (_, i) => {
                  const ring = Math.floor(i / MARKS_PER_RING);
                  const rad =
                    ((-90 + (i % MARKS_PER_RING) * MARK_STEP_DEG) * Math.PI) / 180;
                  const ri = R_MARK_IN + ring * MARK_RING_GAP;
                  const ro = R_MARK_OUT + ring * MARK_RING_GAP;
                  return (
                    <line
                      key={i}
                      className="inkwell__mark"
                      x1={C + Math.cos(rad) * ri}
                      y1={C + Math.sin(rad) * ri}
                      x2={C + Math.cos(rad) * ro}
                      y2={C + Math.sin(rad) * ro}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  );
                }
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
