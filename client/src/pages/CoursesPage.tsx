/**
 * 网课管理页（设计文档 8.5）
 *
 * 7 分区 grid: repeat(auto-fill, minmax(320px, 1fr))；
 * 分区卡 glass-1（图标 + 名称 + 进度百分比 + 双进度条 + 课程列表/空态导入）；
 * 导入弹窗三步（粘贴 → 预览 → 确认）；删除确认 ConfirmDialog（danger 动词化文案）。
 * 7 分区展示、导入解析/预览/确认流程、删除确认与保留历史记录规则不变。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, MonitorPlay } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { showToast } from '../components/ui/Toast';
import { CourseZoneCard } from '../components/courses/CourseZoneCard';
import { ImportCourseModal, ImportZone } from '../components/courses/ImportCourseModal';
import { coursesApi, Course } from '../api/courses';
import './CoursesPage.css';

interface CoursesPageProps { navigate: (hash: string) => void; }

type CourseZone = ImportZone & { key: string };

const COURSE_ZONES: CourseZone[] = [
  { key: 'math', label: '数学', subject: 'math', subSubject: null },
  { key: 'english', label: '英语', subject: 'english', subSubject: null },
  { key: '408-general', label: '408 · 未分类', subject: '408', subSubject: null },
  { key: '408-ds', label: '408 · 数据结构', subject: '408', subSubject: 'data_structure' },
  { key: '408-co', label: '408 · 计算机组成', subject: '408', subSubject: 'computer_organization' },
  { key: '408-os', label: '408 · 操作系统', subject: '408', subSubject: 'operating_system' },
  { key: '408-cn', label: '408 · 计算机网络', subject: '408', subSubject: 'computer_network' },
];

export function CoursesPage({ navigate }: CoursesPageProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Import modal
  const [importZone, setImportZone] = useState<CourseZone | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setCourses(await coursesApi.getAll()); }
    catch (err) { setError(err instanceof Error ? err.message : '加载课程失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await coursesApi.delete(deleteTarget.id);
      showToast('success', '课程已删除');
      setDeleteTarget(null);
      fetchCourses();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  const getCoursesForZone = (zone: CourseZone) => courses.filter((c) => {
    if (c.subject !== zone.subject) return false;
    if (zone.subSubject) return c.subSubject === zone.subSubject;
    return c.subSubject === null;
  });

  return (
    <PageShell>
      {/* 标题区：宋体 30px + 引导文案 */}
      <header className="courses-header">
        <div>
          <h2 className="courses-title">
            <MonitorPlay size={26} strokeWidth={1.75} aria-hidden="true" />
            网课管理
          </h2>
          <p className="courses-subtitle">按 7 个分区整理网课，跟踪每门课的集数与时长进度</p>
        </div>
        <Button variant="primary" onClick={() => setImportZone(COURSE_ZONES[0])}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          导入网课
        </Button>
      </header>

      {loading ? <LoadingState message="加载课程中..." /> :
       error ? <ErrorState message={error} onRetry={fetchCourses} /> : (
        <div className="courses-grid">
          {COURSE_ZONES.map((zone) => (
            <CourseZoneCard
              key={zone.key}
              label={zone.label}
              subject={zone.subject}
              courses={getCoursesForZone(zone)}
              onImport={() => setImportZone(zone)}
              onNavigate={navigate}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* 导入弹窗：三步（粘贴 → 预览 → 确认） */}
      <ImportCourseModal
        isOpen={!!importZone}
        zone={importZone}
        onClose={() => setImportZone(null)}
        onImported={fetchCourses}
      />

      {/* 删除确认：danger 动词化文案；历史记录保留规则不变 */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除课程"
        message={`确定要删除「${deleteTarget?.name}」吗？`}
        detail="该课程下的所有集数将被删除，但已产生的学习记录和统计数据将保留。"
        confirmLabel="删除课程"
        destructive
      />
    </PageShell>
  );
}
