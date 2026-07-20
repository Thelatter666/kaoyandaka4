/**
 * 场景下方数据条（设计文档 6.3）：玻璃横条四等分，tabular-nums
 * 本期专注时长 / 完成次数 / 树木总数 / 各科距下一棵树剩余时长。
 * 数据同时以文字呈现，不依赖图形。
 */
import React from 'react';
import type { Subject } from '@shared/types';
import { formatDurationHuman } from '../../utils/duration';
import { SUBJECT_NAMES } from './trees';
import './ForestDataBar.css';

const SUBJECT_ORDER: Subject[] = ['math', 'english', '408'];

export interface ForestDataBarProps {
  totalFocusSeconds: number;
  totalCompletedSessions: number;
  totalTrees: number;
  remainingSecondsBySubject: Record<string, number>;
}

export function ForestDataBar({
  totalFocusSeconds,
  totalCompletedSessions,
  totalTrees,
  remainingSecondsBySubject,
}: ForestDataBarProps) {
  return (
    <dl className="forest-bar glass-1" aria-label="本期森林数据">
      <div className="forest-bar__cell">
        <dt className="forest-bar__label">本期专注时长</dt>
        <dd className="forest-bar__value tabular-nums">{formatDurationHuman(totalFocusSeconds)}</dd>
      </div>
      <div className="forest-bar__cell">
        <dt className="forest-bar__label">完成次数</dt>
        <dd className="forest-bar__value tabular-nums">{totalCompletedSessions} 次</dd>
      </div>
      <div className="forest-bar__cell">
        <dt className="forest-bar__label">树木总数</dt>
        <dd className="forest-bar__value tabular-nums">{totalTrees} 棵</dd>
      </div>
      <div className="forest-bar__cell">
        <dt className="forest-bar__label">距下一棵树</dt>
        <dd className="forest-bar__remaining">
          {SUBJECT_ORDER.map((subject) => (
            <span key={subject} className="forest-bar__remaining-item">
              <span
                className={`forest-bar__dot forest-bar__dot--${subject}`}
                aria-hidden="true"
              />
              <span className="forest-bar__subject">{SUBJECT_NAMES[subject]}</span>
              <span className="tabular-nums">
                {formatDurationHuman(remainingSecondsBySubject[subject] ?? 3600)}
              </span>
            </span>
          ))}
        </dd>
      </div>
    </dl>
  );
}
