/**
 * 学习森林「玻璃花房」场景（设计文档 6.1 / 6.2 / 6.3）
 * glass-1 大卡内嵌微缩温室场景，自底向上：天空（本地小时 5 档渐变，1s 过渡）
 * → 远山剪影 → 苔藓地面 → 树层（科目分区 + 种植先后透视）→ 玻璃罩反光 → 尘埃光斑。
 * 树木为 ≥44px 按钮，hover/focus 触发露珠 tooltip（Escape 关闭）；
 * 单期 >24 棵渲染最近 24 棵并显示「+N 棵」角标；该科 0 棵显示幼苗占位。
 */
import React, { useEffect, useState } from 'react';
import type { Subject } from '@shared/types';
import { Button } from '../ui/Button';
import { TREE_COMPONENTS, SUBJECT_NAMES, Sapling } from './trees';
import './ForestGlasshouse.css';

/** 单期单科最多渲染的树木数量（超出以「+N 棵」角标呈现） */
const MAX_RENDERED_TREES = 24;

const SUBJECT_ORDER: Subject[] = ['math', 'english', '408'];

type SkyKey = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night';

/** 按本地小时取天空档位：黎明 5–7 / 上午 8–11 / 午后 12–16 / 黄昏 17–19 / 夜晚 20–4 */
function getSkyKey(hour: number): SkyKey {
  if (hour >= 5 && hour <= 7) return 'dawn';
  if (hour >= 8 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 19) return 'dusk';
  return 'night';
}

export interface ForestGlasshouseProps {
  /** 本期各科树木数量（来自 data.period.treesBySubject） */
  treesBySubject: Record<string, number>;
  /** 范围文字（如 2026-07-13 ~ 2026-07-19） */
  rangeLabel: string;
  /** 本期树木总数 */
  periodTotalTrees: number;
  /** 累计树木总数（用于空态判定：本期 0 且累计 0） */
  cumulativeTotalTrees: number;
  /** 空态 CTA：去番茄钟开始第一次专注 */
  onStartFocus?: () => void;
}

export function ForestGlasshouse({
  treesBySubject,
  rangeLabel,
  periodTotalTrees,
  cumulativeTotalTrees,
  onStartFocus,
}: ForestGlasshouseProps) {
  const [skyKey, setSkyKey] = useState<SkyKey>(() => getSkyKey(new Date().getHours()));
  /** 当前展示 tooltip 的树 id（hover / focus 触发） */
  const [activeTip, setActiveTip] = useState<string | null>(null);
  /** Escape 关闭后在 blur 前抑制的树 id（焦点保留但不再弹出） */
  const [suppressedTip, setSuppressedTip] = useState<string | null>(null);

  // 每分钟对齐本地时间刷新天空档位（切换由 CSS transition 1s 平滑完成）
  useEffect(() => {
    const timer = window.setInterval(() => setSkyKey(getSkyKey(new Date().getHours())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isEmpty = periodTotalTrees === 0 && cumulativeTotalTrees === 0;
  const totalOverflow = SUBJECT_ORDER.reduce(
    (sum, s) => sum + Math.max(0, (treesBySubject[s] || 0) - MAX_RENDERED_TREES),
    0
  );

  return (
    <section className="forest glass-1" aria-label="本期学习森林场景">
      {/* 场景标题条：左侧标题 + 范围文字，右侧图例 */}
      <header className="forest__header">
        <div className="forest__heading">
          <h3 className="forest__title">本期学习森林</h3>
          <p className="forest__range tabular-nums">{rangeLabel}</p>
        </div>
        <ul className="forest__legend" aria-label="树木图例">
          {SUBJECT_ORDER.map((subject) => {
            const TreeIcon = TREE_COMPONENTS[subject];
            const count = treesBySubject[subject] || 0;
            return (
              <li key={subject} className="forest__legend-item">
                <TreeIcon style={{ height: 20, width: 'auto' }} />
                <span className="forest__legend-name">{SUBJECT_NAMES[subject]}</span>
                <span className="forest__legend-count tabular-nums">{count} 棵</span>
              </li>
            );
          })}
        </ul>
      </header>

      <div className={`forest__scene forest__scene--${skyKey}`}>
        {/* 1. 天空层：按小时 5 档渐变；深色主题叠加压暗罩 */}
        <div className="forest__sky" aria-hidden="true" />

        {/* 2. 远山层：2 条剪影 path，中性蓝灰 opacity 0.10 / 0.16 */}
        <svg
          className="forest__hills"
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M0 118 C 120 58, 250 142, 390 92 C 520 46, 650 132, 800 78 L800 200 L0 200 Z"
            fill="var(--color-forest-hill)"
            opacity="0.10"
          />
          <path
            d="M0 158 C 150 100, 300 178, 460 130 C 600 92, 710 162, 800 128 L800 200 L0 200 Z"
            fill="var(--color-forest-hill)"
            opacity="0.16"
          />
        </svg>

        {/* 3. 地面层：底部 28% 苔藓渐变 + 草叶点缀 */}
        <div className="forest__ground" aria-hidden="true">
          <svg
            className="forest__grass"
            viewBox="0 0 800 40"
            preserveAspectRatio="none"
            focusable="false"
          >
            {[40, 130, 235, 330, 440, 545, 650, 745].map((x, i) => (
              <path
                key={x}
                d={i % 2 === 0
                  ? `M${x} 40 L${x + 4} ${18 + (i % 3) * 4} L${x + 8} 40 Z`
                  : `M${x} 40 L${x + 3} ${24 - (i % 3) * 3} L${x + 6} 40 Z`}
                fill="var(--color-forest-grass)"
              />
            ))}
          </svg>
        </div>

        {/* 4. 树层：数学左区 / 英语中区 / 408 右区，组内按种植先后透视排布 */}
        <div className="forest__trees">
          {SUBJECT_ORDER.map((subject, zoneIndex) => {
            const count = treesBySubject[subject] || 0;
            const rendered = Math.min(count, MAX_RENDERED_TREES);
            const startIndex = count - rendered; // 仅渲染最近 24 棵
            const TreeComponent = TREE_COMPONENTS[subject];
            return (
              <div
                key={subject}
                className="forest__zone"
                style={{ left: `${zoneIndex * 33.3333}%` }}
              >
                {rendered === 0 ? (
                  /* 幼苗占位：该科本期 0 棵 */
                  <div className="forest__sapling">
                    <Sapling style={{ height: 56, width: 'auto' }} />
                    <span className="sr-only">{SUBJECT_NAMES[subject]}本期还没有种下树</span>
                  </div>
                ) : (
                  Array.from({ length: rendered }, (_, i) => {
                    const treeNumber = startIndex + i + 1; // 种植序（第 N 棵）
                    const t = i / Math.max(1, rendered - 1);
                    const scale = 0.55 + 0.45 * t;
                    const jitter = ((i * 37) % 17) - 8; // 基线错落 ±8px（确定性）
                    const leftPct = rendered === 1 ? 50 : 12 + t * 76;
                    const bottomPct = 8 + (1 - t) * 10;
                    const tipId = `forest-tip-${subject}-${treeNumber}`;
                    const isActive = activeTip === tipId;
                    /* 场景边缘的树：tooltip 改为中心对齐 → 向内展开，避免被场景 overflow:hidden 裁切 */
                    const sceneLeftPct = zoneIndex * 33.3333 + (leftPct * 33.3333) / 100;
                    const tipAlign = sceneLeftPct < 20 ? 'left' : sceneLeftPct > 80 ? 'right' : 'center';
                    return (
                      <div
                        key={treeNumber}
                        className="forest__tree-wrap"
                        style={{
                          left: `${leftPct}%`,
                          bottom: `calc(${bottomPct}% + ${jitter}px)`,
                          zIndex: isActive ? 30 : i + 1,
                        }}
                      >
                        <button
                          type="button"
                          className="forest__tree"
                          aria-label={`${SUBJECT_NAMES[subject]} 第${treeNumber}棵树`}
                          aria-describedby={isActive ? tipId : undefined}
                          onMouseEnter={() => setActiveTip(tipId)}
                          onMouseLeave={() => setActiveTip(null)}
                          onFocus={() => { if (suppressedTip !== tipId) setActiveTip(tipId); }}
                          onBlur={() => { setActiveTip(null); setSuppressedTip(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setActiveTip(null);
                              setSuppressedTip(tipId);
                            }
                          }}
                        >
                          <TreeComponent style={{ height: 92 * scale, width: 'auto' }} />
                        </button>
                        {isActive && (
                          <span
                            role="tooltip"
                            id={tipId}
                            className={`forest__tooltip glass-3${tipAlign !== 'center' ? ` forest__tooltip--align-${tipAlign}` : ''}`}
                          >
                            第 {treeNumber} 棵 · {SUBJECT_NAMES[subject]}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>

        {/* 5. 玻璃罩反光：顶部弧形高光 + 左上→右下对角反光带 */}
        <div className="forest__sheen" aria-hidden="true">
          <div className="forest__sheen-arc" />
          <div className="forest__sheen-band" />
        </div>

        {/* 6. 尘埃光斑：6 个模糊圆点缓慢漂浮（reduced-motion 静止） */}
        <div className="forest__dust" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`forest__mote forest__mote--${i + 1}`} />
          ))}
        </div>

        {/* 空态：本期 0 棵且累计 0 棵 → 三株幼苗占位 + 居中引导 + CTA */}
        {isEmpty && (
          <div className="forest__empty">
            <div className="forest__empty-panel glass-2">
              <p className="forest__empty-title">还没有种下第一棵树</p>
              <p className="forest__empty-desc">每次专注 1 小时，这里就会长出一棵属于你的学习树</p>
              {onStartFocus && (
                <Button variant="primary" onClick={onStartFocus}>
                  去番茄钟开始第一次专注
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 容量角标：单期 >24 棵时渲染最近 24 棵 */}
        {totalOverflow > 0 && (
          <span className="forest__overflow glass-2">+{totalOverflow} 棵</span>
        )}
      </div>
    </section>
  );
}
