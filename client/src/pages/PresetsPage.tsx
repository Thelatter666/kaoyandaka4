import React, { useState, useCallback, useEffect } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SubjectBadge } from '../components/ui/SubjectBadge';
import { DurationSelector } from '../components/presets/DurationSelector';
import { PresetCard } from '../components/presets/PresetCard';
import { showToast } from '../components/ui/Toast';
import { presetsApi, Preset } from '../api/presets';
import type { Subject, SubSubject } from '@shared/types';

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  '408': '408',
};

const SUBJECT_ORDER: Subject[] = ['math', 'english', '408'];

interface PresetFormData {
  name: string;
  subject: Subject;
  subSubject: SubSubject | null;
  durationMinutes: number;
}

const emptyForm = (lockedSubject?: Subject): PresetFormData => ({
  name: '',
  subject: lockedSubject || 'math',
  subSubject: null,
  durationMinutes: 45,
});

const SUB_SUBJECT_OPTIONS: { value: SubSubject; label: string }[] = [
  { value: 'data_structure', label: '数据结构' },
  { value: 'computer_organization', label: '计算机组成' },
  { value: 'operating_system', label: '操作系统' },
  { value: 'computer_network', label: '计算机网络' },
];

export function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [formData, setFormData] = useState<PresetFormData>(emptyForm());
  const [lockedSubject, setLockedSubject] = useState<Subject | undefined>();
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Preset | null>(null);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await presetsApi.getAll();
      setPresets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载预设失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const openCreate = (lockedSubject?: Subject) => {
    setEditingPreset(null);
    setLockedSubject(lockedSubject);
    setFormData(emptyForm(lockedSubject));
    setModalOpen(true);
  };

  const openEdit = (preset: Preset) => {
    setEditingPreset(preset);
    setLockedSubject(undefined);
    setFormData({
      name: preset.name,
      subject: preset.subject as Subject,
      subSubject: preset.subSubject as SubSubject | null,
      durationMinutes: preset.durationMinutes,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      if (editingPreset) {
        await presetsApi.update(editingPreset.id, {
          name: formData.name,
          subject: formData.subject,
          subSubject: formData.subSubject,
          durationMinutes: formData.durationMinutes,
        });
        showToast('success', '预设已更新');
      } else {
        await presetsApi.create({
          name: formData.name,
          subject: formData.subject,
          subSubject: formData.subSubject || undefined,
          durationMinutes: formData.durationMinutes,
          lockedSubject,
        });
        showToast('success', '预设已创建');
      }
      setModalOpen(false);
      fetchPresets();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await presetsApi.delete(deleteTarget.id);
      showToast('success', '预设已删除');
      setDeleteTarget(null);
      fetchPresets();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  // Group by subject
  const grouped = SUBJECT_ORDER.map((subj) => ({
    subject: subj,
    label: SUBJECT_LABELS[subj],
    items: presets.filter((p) => p.subject === subj),
  }));

  const selectStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-base)',
    width: '100%',
    outline: 'none',
  };

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-base)',
    width: '100%',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    marginBottom: 4,
  };

  return (
    <PageShell>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-xl)',
        flexWrap: 'wrap',
        gap: 'var(--space-md)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 700,
          margin: 0,
        }}>
          ⚙️ 学习预设
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => openCreate()}>
            新建预设
          </Button>
          <Button variant="secondary" onClick={() => openCreate('math')}>
            ＋数学
          </Button>
          <Button variant="secondary" onClick={() => openCreate('english')}>
            ＋英语
          </Button>
          <Button variant="secondary" onClick={() => openCreate('408')}>
            ＋408
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState message="加载预设中..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchPresets} />
      ) : presets.length === 0 ? (
        <EmptyState
          icon="📋"
          title="还没有学习预设"
          description="创建一个预设来快速开始专注学习"
          actionLabel="创建第一个预设"
          onAction={() => openCreate()}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {grouped.map((group) => (
            <div key={group.subject}>
              <h3 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                marginBottom: 'var(--space-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
              }}>
                <span style={{ color: `var(--color-subject-${group.subject})` }}>●</span>
                {group.label}
                <span style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-muted)',
                  fontWeight: 400,
                }}>
                  ({group.items.length})
                </span>
              </h3>
              {group.items.length === 0 ? (
                <Card>
                  <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-md)' }}>
                    暂无{group.label}预设
                  </p>
                </Card>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 'var(--space-md)',
                }}>
                  {group.items.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      id={preset.id}
                      name={preset.name}
                      subject={preset.subject as Subject}
                      subSubject={preset.subSubject as SubSubject | null}
                      durationMinutes={preset.durationMinutes}
                      isRecentlyUsed={false}
                      onEdit={() => openEdit(preset)}
                      onDelete={() => setDeleteTarget(preset)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPreset ? '编辑预设' : '新建预设'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Name */}
          <div>
            <label htmlFor="preset-name" style={labelStyle}>预设名称</label>
            <input
              id="preset-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="例如：数学上午刷题"
              maxLength={200}
              style={inputStyle}
            />
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="preset-subject" style={labelStyle}>科目</label>
            {lockedSubject ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <SubjectBadge subject={lockedSubject} size="md" />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  （已锁定）
                </span>
              </div>
            ) : (
              <select
                id="preset-subject"
                value={formData.subject}
                onChange={(e) => setFormData((prev) => ({
                  ...prev,
                  subject: e.target.value as Subject,
                  subSubject: null,
                }))}
                style={selectStyle}
              >
                <option value="math">数学</option>
                <option value="english">英语</option>
                <option value="408">408 计算机综合</option>
              </select>
            )}
          </div>

          {/* Sub-subject (only for 408) */}
          {formData.subject === '408' && (
            <div>
              <label htmlFor="preset-subsubject" style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                子科目
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 'var(--text-xs)' }}>（可选）</span>
              </label>
              <select
                id="preset-subsubject"
                value={formData.subSubject || ''}
                onChange={(e) => setFormData((prev) => ({
                  ...prev,
                  subSubject: (e.target.value || null) as SubSubject | null,
                }))}
                style={selectStyle}
              >
                <option value="">不限</option>
                {SUB_SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Duration */}
          <div>
            <label style={labelStyle}>专注时长</label>
            <DurationSelector
              value={formData.durationMinutes}
              onChange={(v) => setFormData((prev) => ({ ...prev, durationMinutes: v }))}
            />
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-md)',
            marginTop: 'var(--space-md)',
          }}>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!formData.name.trim()}
            >
              {editingPreset ? '保存修改' : '创建预设'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除预设"
        message={`确定要删除预设「${deleteTarget?.name}」吗？`}
        detail="删除后不可恢复，但已产生的学习记录和统计数据将保留。"
        confirmLabel="删除"
      />
    </PageShell>
  );
}
