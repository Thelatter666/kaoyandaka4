import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { DurationSelector } from '../components/presets/DurationSelector';
import { PresetCard } from '../components/presets/PresetCard';
import { RingCountdown } from '../components/timer/RingCountdown';
import { useFocusSession } from '../hooks/useFocusSession';
import { presetsApi, Preset } from '../api/presets';
import { showToast } from '../components/ui/Toast';
import { SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES, LONG_BREAK_AFTER_ROUNDS } from '@shared/schemas/common';
import type { Subject, SubSubject } from '@shared/types';

type PomodoroStep = 'select-preset' | 'adjust-duration' | 'active' | 'completed';

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

  // Sync with active session
  useEffect(() => {
    if (activeSession) {
      setStep('active');
    } else if (breakMode) {
      // In break - RingCountdown handles this
    }
  }, [activeSession, breakMode]);

  const handleSelectPreset = (preset: Preset) => {
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
    try {
      await completeFocus();
      setStep('completed');
    } catch {
      // Error handled by hook
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelFocus();
      setStep('select-preset');
      setSelectedPreset(null);
    } catch {
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

  // Calculate remaining time for active session
  const getRemainingSeconds = () => {
    if (!activeSession) return 0;
    const plannedEnd = new Date(activeSession.plannedEndAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.round((plannedEnd - now) / 1000));
  };

  const getTotalPlannedSeconds = () => activeSession?.plannedDurationSeconds || 0;

  // Determine if we should show long break option
  const showLongBreak = roundCount % LONG_BREAK_AFTER_ROUNDS === 0 && roundCount > 0;

  // ======================
  // RENDER: Select Preset
  // ======================
  if (step === 'select-preset') {
    return (
      <PageShell>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-lg)' }}>
          🍅 番茄钟
        </h2>

        {breakMode && (
          <Card style={{ marginBottom: 'var(--space-lg)', textAlign: 'center' }}>
            <RingCountdown
              totalSeconds={breakMode === 'short_break' ? SHORT_BREAK_MINUTES * 60 : LONG_BREAK_MINUTES * 60}
              remainingSeconds={breakRemainingSeconds}
              mode={breakMode}
            />
            <div style={{ marginTop: 'var(--space-md)' }}>
              <Button variant="ghost" size="sm" onClick={completeBreak}>跳过休息</Button>
            </div>
          </Card>
        )}

        {!breakMode && (
          <>
            {presetsLoading ? (
              <LoadingState message="加载预设中..." />
            ) : presetsError ? (
              <ErrorState message={presetsError} onRetry={fetchPresets} />
            ) : presets.length === 0 ? (
              <EmptyState
                icon="📋"
                title="还没有学习预设"
                description="需要先创建预设才能开始专注"
                actionLabel="创建第一个预设"
                onAction={() => window.location.hash = '#/presets'}
              />
            ) : (
              <div>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
                  选择一个预设开始专注学习
                </p>
                {(['math', 'english', '408'] as Subject[]).map((subj) => {
                  const items = presets.filter((p) => p.subject === subj);
                  if (items.length === 0) return null;
                  const labels: Record<string, string> = { math: '数学', english: '英语', '408': '408' };
                  return (
                    <div key={subj} style={{ marginBottom: 'var(--space-lg)' }}>
                      <h3 style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: 'var(--text-base)',
                        marginBottom: 'var(--space-md)',
                        color: `var(--color-subject-${subj})`,
                      }}>
                        ● {labels[subj]}
                      </h3>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: 'var(--space-md)',
                      }}>
                        {items.map((preset) => (
                          <PresetCard
                            key={preset.id}
                            id={preset.id}
                            name={preset.name}
                            subject={preset.subject as Subject}
                            subSubject={preset.subSubject as SubSubject | null}
                            durationMinutes={preset.durationMinutes}
                            onClick={() => handleSelectPreset(preset)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PageShell>
    );
  }

  // ======================
  // RENDER: Adjust Duration
  // ======================
  if (step === 'adjust-duration' && selectedPreset) {
    return (
      <PageShell maxWidth={600}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-lg)' }}>
          🍅 调整时长
        </h2>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
            {/* Preset info */}
            <div style={{
              padding: 'var(--space-md)',
              backgroundColor: 'var(--color-border-light)',
              borderRadius: 'var(--radius-md)',
            }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                已选预设
              </p>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{selectedPreset.name}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                原始时长：{selectedPreset.durationMinutes} 分钟
              </p>
            </div>

            {/* Duration selector */}
            <div>
              <p style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-md)',
              }}>
                本次专注时长
              </p>
              <DurationSelector value={durationMinutes} onChange={setDurationMinutes} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setStep('select-preset'); setSelectedPreset(null); }}>
                返回
              </Button>
              <Button variant="primary" size="lg" onClick={handleStartFocus} loading={actionLoading}>
                开始专注 🍅
              </Button>
            </div>
          </div>
        </Card>
      </PageShell>
    );
  }

  // ======================
  // RENDER: Active Session
  // ======================
  if (step === 'active' && activeSession) {
    return (
      <PageShell maxWidth={600}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-xl)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-xl)',
            margin: 0,
            textAlign: 'center',
          }}>
            {activeSession.presetNameSnapshot}
          </h2>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RingCountdown
              totalSeconds={getTotalPlannedSeconds()}
              remainingSeconds={getRemainingSeconds()}
              mode="focus"
            />
          </div>

          {/* Round counter */}
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            第 {roundCount} 轮
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="secondary" size="lg" onClick={handleComplete} loading={actionLoading}>
              提前完成 ✓
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
              取消 ✕
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ======================
  // RENDER: Completed
  // ======================
  if (step === 'completed') {
    return (
      <PageShell maxWidth={600}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-xl)',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '4rem' }}>🎉</span>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', margin: 0 }}>
            专注完成！
          </h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            很棒！你已经完成了第 {roundCount} 轮专注。
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={handleContinue}>
              继续专注
            </Button>
            <Button variant="secondary" onClick={() => handleStartBreak('short')}>
              短休息 {SHORT_BREAK_MINUTES} 分钟
            </Button>
            {showLongBreak && (
              <Button variant="secondary" onClick={() => handleStartBreak('long')}>
                长休息 {LONG_BREAK_MINUTES} 分钟
              </Button>
            )}
            <Button variant="ghost" onClick={handleNoBreak}>
              不休息
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  return null;
}
