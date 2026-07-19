import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { showToast } from '../components/ui/Toast';
import { coursesApi, Course, ParseResult } from '../api/courses';
import { formatDurationHuman } from '../utils/duration';
import type { Subject, SubSubject } from '@shared/types';

interface CoursesPageProps { navigate: (hash: string) => void; }

type CourseZone = {
  key: string;
  label: string;
  subject: Subject;
  subSubject: SubSubject | null;
  icon: string;
};

const COURSE_ZONES: CourseZone[] = [
  { key: 'math', label: '数学', subject: 'math', subSubject: null, icon: '∑' },
  { key: 'english', label: '英语', subject: 'english', subSubject: null, icon: 'Aa' },
  { key: '408-general', label: '408 · 未分类', subject: '408', subSubject: null, icon: '</>' },
  { key: '408-ds', label: '408 · 数据结构', subject: '408', subSubject: 'data_structure', icon: '🌲' },
  { key: '408-co', label: '408 · 计算机组成', subject: '408', subSubject: 'computer_organization', icon: '💻' },
  { key: '408-os', label: '408 · 操作系统', subject: '408', subSubject: 'operating_system', icon: '⚙️' },
  { key: '408-cn', label: '408 · 计算机网络', subject: '408', subSubject: 'computer_network', icon: '🌐' },
];

export function CoursesPage({ navigate }: CoursesPageProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importZone, setImportZone] = useState<CourseZone | null>(null);
  const [rawText, setRawText] = useState('');
  const [courseName, setCourseName] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

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

  const openImport = (zone: CourseZone) => {
    setImportZone(zone);
    setRawText('');
    setCourseName('');
    setParseResult(null);
    setParseError(null);
    setImportOpen(true);
  };

  const handleParse = async () => {
    if (!rawText.trim() || !importZone) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await coursesApi.parse({ rawText: rawText.trim(), subject: importZone.subject, subSubject: importZone.subSubject || undefined });
      setParseResult(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '解析失败');
      setParseResult(null);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || !importZone || !courseName.trim()) return;
    setImporting(true);
    try {
      await coursesApi.create({
        name: courseName.trim(),
        subject: importZone.subject,
        subSubject: importZone.subSubject || undefined,
        lockedSubject: importZone.subject,
        lockedSubSubject: importZone.subSubject || undefined,
        episodes: parseResult.episodes,
      });
      showToast('success', `已导入「${courseName}」`);
      setImportOpen(false);
      fetchCourses();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0 }}>📺 网课管理</h2>
        <Button variant="primary" onClick={() => openImport(COURSE_ZONES[0])}>导入网课</Button>
      </div>

      {loading ? <LoadingState message="加载课程中..." /> :
       error ? <ErrorState message={error} onRetry={fetchCourses} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 'var(--space-lg)' }}>
          {COURSE_ZONES.slice(0, 2).map((zone) => (
            <ZoneSection key={zone.key} zone={zone} courses={getCoursesForZone(zone)} onImport={() => openImport(zone)} onNavigate={navigate} onDelete={setDeleteTarget} span={6} />
          ))}
          <ZoneSection key="408-general" zone={COURSE_ZONES[2]} courses={getCoursesForZone(COURSE_ZONES[2])} onImport={() => openImport(COURSE_ZONES[2])} onNavigate={navigate} onDelete={setDeleteTarget} span={6} />
          {COURSE_ZONES.slice(3).map((zone) => (
            <ZoneSection key={zone.key} zone={zone} courses={getCoursesForZone(zone)} onImport={() => openImport(zone)} onNavigate={navigate} onDelete={setDeleteTarget} span={3} />
          ))}
        </div>
      )}

      {/* Import Modal */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title={`导入${importZone?.label || ''}课程`} size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, display: 'block', marginBottom: 4 }}>课程名称</label>
            <input type="text" value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="例如：2026 张宇线性代数" maxLength={200}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-base)', outline: 'none' }} />
          </div>

          {!parseResult ? (
            <>
              <div>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, display: 'block', marginBottom: 4 }}>粘贴集数列表（格式：标题 + 时长 MM:SS）</label>
                <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="第一集 概述&#10;31:43&#10;第二集 线性表&#10;59:19" rows={8}
                  style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)', resize: 'vertical', outline: 'none' }} />
              </div>
              {parseError && <p style={{ color: 'var(--color-accent-primary)', fontSize: 'var(--text-sm)' }}>{parseError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)' }}>
                <Button variant="secondary" onClick={() => setImportOpen(false)}>取消</Button>
                <Button variant="primary" onClick={handleParse} loading={parsing} disabled={!rawText.trim()}>解析预览</Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--color-text-secondary)' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--color-text-secondary)' }}>标题</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--color-text-secondary)' }}>时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.episodes.map((ep, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px' }}>{ep.title}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDurationHuman(ep.durationSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseResult.unrecognizedLines.length > 0 && (
                <div style={{ padding: 'var(--space-md)', backgroundColor: 'var(--color-accent-warning-light)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                  <p style={{ fontWeight: 600, color: 'var(--color-accent-warning)', marginBottom: 4 }}>⚠ 未识别的行：</p>
                  {parseResult.unrecognizedLines.map((line, i) => (
                    <p key={i} style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{line}</p>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  共 {parseResult.totalEpisodes} 集 · {formatDurationHuman(parseResult.totalDurationSeconds)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)' }}>
                <Button variant="secondary" onClick={() => { setParseResult(null); setParseError(null); }}>重新编辑</Button>
                <Button variant="primary" onClick={handleImport} loading={importing} disabled={!courseName.trim()}>确认导入</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="删除课程" message={`确定要删除「${deleteTarget?.name}」吗？`}
        detail="该课程下的所有集数将被删除，但已产生的学习记录和统计数据将保留。"
        confirmLabel="删除" destructive />
    </PageShell>
  );
}

function ZoneSection({ zone, courses, onImport, onNavigate, onDelete, span }: {
  zone: CourseZone; courses: Course[]; onImport: () => void; onNavigate: (hash: string) => void; onDelete: (c: Course) => void; span: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: `var(--color-subject-${zone.subject})`, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{zone.icon}</span> {zone.label}
        </h3>
        {courses.length === 0 && (
          <Button variant="ghost" size="sm" onClick={onImport}>+ 导入</Button>
        )}
      </div>
      {courses.length === 0 ? (
        <Card padding="var(--space-lg)" style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer' }} onClick={onImport}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>点击导入课程</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {courses.map((course) => (
            <Card key={course.id} padding="var(--space-md)" onClick={() => onNavigate(`#/courses/${course.id}`)} hoverable>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.name}</h4>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(course); }} aria-label={`删除 ${course.name}`}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)', flexShrink: 0 }}>✕</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  <span>{course.episodeCount} 集 · {formatDurationHuman(course.totalDurationSeconds)}</span>
                </div>
                <ProgressBar value={course.completedEpisodeCount} max={course.episodeCount || 1} color="var(--color-accent-success)" label={`集数进度 ${course.completedEpisodeCount}/${course.episodeCount}`} icon="📊" size="sm" />
                <ProgressBar value={course.watchedDurationSeconds} max={course.totalDurationSeconds || 1} color="var(--color-accent-primary)" label={`时长进度 ${formatDurationHuman(course.watchedDurationSeconds)}/${formatDurationHuman(course.totalDurationSeconds)}`} icon="⏱" size="sm" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
