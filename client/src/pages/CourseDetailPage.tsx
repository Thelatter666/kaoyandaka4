/**
 * 课程详情页（设计文档 8.6）
 *
 * 顶部课程信息卡 glass-1（课程名宋体 24px + 科目徽章 + 双进度条 + 统计数字行）；
 * 集数列表 glass-1 行卡（28px 完成圆点 Check 填充松绿 / 标题 / 原始时长 / 开始学习 Play 按钮）；
 * 完成行动效 160ms；删除入口 danger 幽灵按钮 + 确认弹窗。
 * 集数完成切换、删除确认与保留历史记录规则不变。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Check, Play, Trash2, ListVideo, MonitorPlay } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { showToast } from '../components/ui/Toast';
import { DualProgressBars } from '../components/courses/DualProgressBars';
import { coursesApi, CourseDetail } from '../api/courses';
import { formatDurationHuman } from '../utils/duration';
import type { Subject, SubSubject } from '@shared/types';
import './CourseDetailPage.css';

interface CourseDetailPageProps { courseId: string; }

export function CourseDetailPage({ courseId }: CourseDetailPageProps) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  const handleDeleteCourse = async () => {
    try {
      await coursesApi.delete(courseId);
      showToast('success', '课程已删除');
      window.location.hash = '#/courses';
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  if (loading) return <PageShell><LoadingState message="加载课程详情..." /></PageShell>;
  if (error) return <PageShell><ErrorState message={error} onRetry={fetchCourse} /></PageShell>;
  if (!course) return (
    <PageShell>
      <EmptyState
        icon={<MonitorPlay size={40} strokeWidth={1.75} />}
        title="课程不存在"
        description="它可能已被删除"
        actionLabel="返回网课列表"
        onAction={() => { window.location.hash = '#/courses'; }}
      />
    </PageShell>
  );

  return (
    <PageShell>
      {/* 返回 */}
      <a href="#/courses" className="course-detail__back">
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        返回网课列表
      </a>

      {/* 顶部课程信息卡 glass-1 */}
      <Card className="course-detail__info">
        <div className="course-detail__head">
          <h2 className="course-detail__name">{course.name}</h2>
          <SubjectBadge subject={course.subject as Subject} subSubject={course.subSubject as SubSubject | null} size="md" />
        </div>

        {/* 双进度条：集数（松绿系）/ 时长（珊瑚系） */}
        <DualProgressBars
          completedEpisodes={course.completedEpisodeCount}
          totalEpisodes={course.episodeCount}
          watchedSeconds={course.watchedDurationSeconds}
          totalSeconds={course.totalDurationSeconds}
        />

        {/* 统计数字行 */}
        <dl className="course-detail__stats">
          <div className="course-detail__stat">
            <dt>总集数</dt>
            <dd className="tabular-nums">{course.episodeCount} 集</dd>
          </div>
          <div className="course-detail__stat">
            <dt>总时长</dt>
            <dd className="tabular-nums">{formatDurationHuman(course.totalDurationSeconds)}</dd>
          </div>
          <div className="course-detail__stat">
            <dt>已完成</dt>
            <dd className="tabular-nums">{course.completedEpisodeCount} / {course.episodeCount}</dd>
          </div>
          <div className="course-detail__stat">
            <dt>已观看</dt>
            <dd className="tabular-nums">{formatDurationHuman(course.watchedDurationSeconds)}</dd>
          </div>
        </dl>

        {/* 删除入口：danger 幽灵按钮 */}
        <div className="course-detail__danger-zone">
          <Button variant="ghost" className="course-detail__delete" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            删除课程
          </Button>
        </div>
      </Card>

      {/* 集数列表 */}
      <h3 className="course-detail__episodes-title">
        <ListVideo size={20} strokeWidth={1.75} aria-hidden="true" />
        集数列表
      </h3>
      {course.episodes.length === 0 ? (
        <Card><p className="course-detail__empty">暂无集数</p></Card>
      ) : (
        <ul className="course-detail__episodes">
          {course.episodes.map((ep, i) => (
            <li key={ep.id} className={`episode-row glass-1${ep.isCompleted ? ' episode-row--done' : ''}`}>
              {/* 28px 完成圆点（44px 触控区），Check 填充松绿 */}
              <button
                type="button"
                className="episode-row__toggle"
                onClick={() => handleToggleEpisode(ep.id)}
                aria-label={`${ep.isCompleted ? '标记为未完成' : '标记为已完成'}：${ep.title}`}
                aria-pressed={ep.isCompleted}
              >
                <span className="episode-row__dot" aria-hidden="true">
                  {ep.isCompleted && <Check size={16} strokeWidth={2.5} />}
                </span>
              </button>
              <span className="episode-row__index tabular-nums" aria-hidden="true">{i + 1}</span>
              <span className="episode-row__title truncate">{ep.title}</span>
              <span className="episode-row__duration tabular-nums">{ep.durationText}</span>
              <Button
                variant="glass"
                className="episode-row__play"
                onClick={() => { window.location.hash = '#/pomodoro'; }}
                aria-label={`开始学习：${ep.title}`}
              >
                <Play size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="episode-row__play-text">开始学习</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* 删除确认：danger 动词化文案；历史记录保留规则不变 */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteCourse}
        title="删除课程"
        message={`确定要删除「${course.name}」吗？`}
        detail="该课程下的所有集数将被删除，但已产生的学习记录和统计数据将保留。"
        confirmLabel="删除课程"
        destructive
      />
    </PageShell>
  );
}
