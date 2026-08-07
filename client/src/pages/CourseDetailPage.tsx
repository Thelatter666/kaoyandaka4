/**
 * 课程详情页（设计文档 8.6 / v2 12.4）
 *
 * v2 Bento 构图：课程信息卡 span 12 hero 化（Card hero 变体 = 玻璃罩光斑
 * + 大标题 + 双进度条横排），为本页唯一主角卡；集数列表为功能卡区，
 * 仅列表容器 .reveal 入场一次（13.3：列表内大量集项不做 stagger）。
 * 集数行卡 glass-1（28px 完成圆点 Check 填充松绿 / 标题 / 原始时长 / 开始学习 Play 按钮）；
 * 完成行动效 160ms；删除入口 danger 幽灵按钮 + 确认弹窗。
 * 集数完成切换、删除确认与保留历史记录规则、统计/进度数据口径不变。
 *
 * 性能优化（2026-08）：集数列表启用 window 滚动虚拟化（@tanstack/react-virtual
 * useWindowVirtualizer）——仅渲染可见行 + overscan，滚动帧率不受总行数影响；
 * 行高固定 68px（60px 行 + 8px gap），行渲染抽为 EpisodeRow 子组件。
 */
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { ChevronLeft, Trash2, ListVideo, MonitorPlay } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { showToast } from '../components/ui/Toast';
import { DualProgressBars } from '../components/courses/DualProgressBars';
import { EpisodeRow } from '../components/courses/EpisodeRow';
import { coursesApi, CourseDetail } from '../api/courses';
import { formatDurationHuman } from '../utils/duration';
import type { Subject, SubSubject } from '@shared/types';
import './CourseDetailPage.css';

interface CourseDetailPageProps { courseId: string; }

/** 虚拟化固定行高：60px 集数行 + 8px 间距（--space-sm） */
const EPISODE_ROW_HEIGHT = 68;
/** 可视窗口外上下各多渲染的行数（滚动缓冲，防空白闪现） */
const EPISODE_OVERSCAN = 8;

export function CourseDetailPage({ courseId }: CourseDetailPageProps) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const listSectionRef = useRef<HTMLElement>(null);
  const [listOffsetTop, setListOffsetTop] = useState(0);

  /* window 滚动虚拟化：仅渲染可视区 + overscan 行；scrollMargin = 列表在文档中的起始偏移 */
  const virtualizer = useWindowVirtualizer({
    count: course?.episodes.length ?? 0,
    estimateSize: () => EPISODE_ROW_HEIGHT,
    overscan: EPISODE_OVERSCAN,
    scrollMargin: listOffsetTop,
  });

  /* 内容渲染后测量列表起始偏移（reveal 动画结束后复核一次，消除 transform 偏差） */
  useLayoutEffect(() => {
    const el = listSectionRef.current;
    if (!el) return;
    const measure = () => setListOffsetTop(el.getBoundingClientRect().top + window.scrollY);
    measure();
    const t = window.setTimeout(measure, 600);
    return () => window.clearTimeout(t);
  }, [course]);

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

  if (loading) return (
    <PageShell>
      {/* 返回 */}
      <a href="#/courses" className="course-detail__back">
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        返回网课列表
      </a>

      {/* 骨架屏：与最终布局同构（hero 卡 + 集数列表），数据返回后无缝替换，避免空白突变 */}
      <div className="bento-grid">
        <div className="bento-span-12 course-detail__skeleton-hero glass-1" aria-hidden="true">
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--badge" />
          <div className="skeleton skeleton--bar" />
          <div className="skeleton skeleton--bar skeleton--bar-short" />
          <div className="course-detail__skeleton-stats">
            <div className="skeleton skeleton--stat" />
            <div className="skeleton skeleton--stat" />
            <div className="skeleton skeleton--stat" />
            <div className="skeleton skeleton--stat" />
          </div>
        </div>
        <div className="bento-span-12 course-detail__skeleton-list glass-1" aria-hidden="true">
          <div className="skeleton skeleton--heading" />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton skeleton--row" />
          ))}
        </div>
      </div>
      <p className="sr-only">加载课程详情中...</p>
    </PageShell>
  );
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

      <div className="bento-grid">
      {/* 课程信息卡（span 12，唯一主角卡）：hero 变体 = 玻璃罩光斑 + 大标题 + 双进度条横排 */}
      <Card
        hero
        className="bento-span-12 course-detail__info reveal"
        style={{ '--i': 0 } as React.CSSProperties}
      >
        <div className="course-detail__head">
          <h2 className="course-detail__name">{course.name}</h2>
          <SubjectBadge subject={course.subject as Subject} subSubject={course.subSubject as SubSubject | null} size="md" />
        </div>

        {/* 双进度条横排：集数（松绿系）/ 时长（珊瑚系） */}
        <DualProgressBars
          completedEpisodes={course.completedEpisodeCount}
          totalEpisodes={course.episodeCount}
          watchedSeconds={course.watchedDurationSeconds}
          totalSeconds={course.totalDurationSeconds}
          layout="row"
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

      {/* 集数列表（span 12 功能卡区）：仅容器 reveal 入场一次；window 滚动虚拟化渲染可见行 */}
      <section
        ref={listSectionRef}
        className="bento-span-12 course-detail__episodes-section reveal"
        style={{ '--i': 1 } as React.CSSProperties}
        aria-label="集数列表"
      >
      <h3 className="course-detail__episodes-title">
        <ListVideo size={20} strokeWidth={1.75} aria-hidden="true" />
        集数列表
      </h3>
      {course.episodes.length === 0 ? (
        <Card><p className="course-detail__empty">暂无集数</p></Card>
      ) : (
        <ul className="course-detail__episodes" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const ep = course.episodes[vi.index];
            return (
              <li
                key={ep.id}
                className="course-detail__episode-virtual"
                data-index={vi.index}
                style={{ transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}
              >
                <EpisodeRow
                  episode={ep}
                  index={vi.index}
                  onToggle={handleToggleEpisode}
                  onStart={() => { window.location.hash = '#/pomodoro'; }}
                />
              </li>
            );
          })}
        </ul>
      )}
      </section>
      </div>

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
