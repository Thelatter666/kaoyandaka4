import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { showToast } from '../components/ui/Toast';
import { coursesApi, CourseDetail, Episode } from '../api/courses';
import { formatDurationHuman } from '../utils/duration';
import type { Subject, SubSubject } from '@shared/types';

interface CourseDetailPageProps { courseId: string; }

export function CourseDetailPage({ courseId }: CourseDetailPageProps) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setCourse(await coursesApi.getById(courseId)); }
    catch (err) { setError(err instanceof Error ? err.message : '加载课程详情失败'); }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const handleToggleEpisode = async (episodeId: string) => {
    try {
      const updated = await coursesApi.toggleEpisode(courseId, episodeId);
      setCourse((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          episodes: prev.episodes.map((ep) => ep.id === episodeId ? { ...ep, isCompleted: updated.isCompleted, completedAt: updated.completedAt } : ep),
          completedEpisodeCount: updated.isCompleted ? prev.completedEpisodeCount + 1 : prev.completedEpisodeCount - 1,
          watchedDurationSeconds: updated.isCompleted
            ? prev.watchedDurationSeconds + (prev.episodes.find((e) => e.id === episodeId)?.durationSeconds || 0)
            : prev.watchedDurationSeconds - (prev.episodes.find((e) => e.id === episodeId)?.durationSeconds || 0),
        } as CourseDetail;
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '操作失败');
    }
  };

  if (loading) return <PageShell><LoadingState message="加载课程详情..." /></PageShell>;
  if (error) return <PageShell><ErrorState message={error} onRetry={fetchCourse} /></PageShell>;
  if (!course) return <PageShell><EmptyState icon="📺" title="课程不存在" /></PageShell>;

  return (
    <PageShell>
      {/* Back button */}
      <a href="#/courses" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textDecoration: 'none', marginBottom: 'var(--space-lg)', display: 'inline-block' }}>
        ← 返回网课列表
      </a>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0 }}>{course.name}</h2>
          <SubjectBadge subject={course.subject as Subject} subSubject={course.subSubject as SubSubject | null} size="md" />
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
          <StatCard label="总集数" value={`${course.episodeCount} 集`} />
          <StatCard label="总时长" value={formatDurationHuman(course.totalDurationSeconds)} />
          <StatCard label="已完成集数" value={`${course.completedEpisodeCount} / ${course.episodeCount}`} />
          <StatCard label="已观看时长" value={formatDurationHuman(course.watchedDurationSeconds)} />
        </div>

        {/* Progress Bars */}
        <Card style={{ marginTop: 'var(--space-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <ProgressBar value={course.completedEpisodeCount} max={course.episodeCount || 1} color="var(--color-accent-success)" label={`集数进度 ${course.completedEpisodeCount}/${course.episodeCount}`} icon="📊" />
            <ProgressBar value={course.watchedDurationSeconds} max={course.totalDurationSeconds || 1} color="var(--color-accent-primary)" label={`时长进度 ${formatDurationHuman(course.watchedDurationSeconds)}/${formatDurationHuman(course.totalDurationSeconds)}`} icon="⏱" />
          </div>
        </Card>
      </div>

      {/* Episodes List */}
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-md)' }}>📖 集数列表</h3>
      {course.episodes.length === 0 ? (
        <Card><p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>暂无集数</p></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {course.episodes.map((ep, i) => (
            <Card key={ep.id} padding="12px 16px" onClick={() => handleToggleEpisode(ep.id)} hoverable>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleEpisode(ep.id); }}
                  aria-label={ep.isCompleted ? '标记为未完成' : '标记为已完成'}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${ep.isCompleted ? 'var(--color-accent-success)' : 'var(--color-border)'}`,
                    backgroundColor: ep.isCompleted ? 'var(--color-accent-success)' : 'transparent',
                    cursor: 'pointer', color: 'white', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {ep.isCompleted && '✓'}
                </button>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', minWidth: 28 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 'var(--text-base)', textDecoration: ep.isCompleted ? 'line-through' : 'none', color: ep.isCompleted ? 'var(--color-text-muted)' : 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ep.title}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  {formatDurationHuman(ep.durationSeconds)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="var(--space-md)">
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</p>
    </Card>
  );
}
