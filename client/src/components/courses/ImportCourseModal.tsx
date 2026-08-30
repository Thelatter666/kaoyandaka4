/**
 * 网课导入弹窗（设计文档 8.5）
 *
 * 三步向导（粘贴 → 预览 → 确认）带步骤指示器；
 * 未识别行警示色高亮 + 行号；解析/预览/确认流程与 API 调用保持现状。
 */
import React, { useState, useEffect } from 'react';
import { Check, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SubjectBadge } from '../ui/SubjectBadge';
import { Dropdown } from '../ui/Dropdown';
import { showToast } from '../ui/Toast';
import { FileUpload } from '../ui/FileUpload';
import { coursesApi, ParseResult } from '../../api/courses';
import { formatDurationHuman } from '../../utils/duration';
import type { Subject, SubSubject } from '@shared/types';
import './ImportCourseModal.css';

const STEPS = ['粘贴', '预览', '确认'] as const;

export interface ImportZone {
  label: string;
  subject: Subject;
  subSubject: SubSubject | null;
}

interface ImportCourseModalProps {
  isOpen: boolean;
  zone: ImportZone | null;
  /** 可导入的全部分区（下拉选项） */
  zones: ImportZone[];
  /** 弹窗内切换目标分区 → 同步父级 */
  onZoneChange: (zone: ImportZone) => void;
  onClose: () => void;
  onImported: () => void;
}

const zoneKey = (z: ImportZone) => `${z.subject}:${z.subSubject ?? ''}`;

export function ImportCourseModal({ isOpen, zone, zones, onZoneChange, onClose, onImported }: ImportCourseModalProps) {
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState('');
  const [courseName, setCourseName] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // 每次打开时重置向导状态
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setRawText('');
      setCourseName('');
      setParseResult(null);
      setParseError(null);
      setUploadedFile(null);
    }
  }, [isOpen]);

  // 切换目标分区：清空输入/解析结果回到第一步，防止解析结果错位到其他分区
  const handleZoneChange = (value: string) => {
    const next = zones.find((z) => zoneKey(z) === value);
    if (!next || !zone || zoneKey(next) === zoneKey(zone)) return;
    setStep(1);
    setRawText('');
    setCourseName('');
    setParseResult(null);
    setParseError(null);
    setUploadedFile(null);
    onZoneChange(next);
  };

  const handleParse = async () => {
    if ((!rawText.trim() && !uploadedFile) || !zone) return;
    
    setParsing(true);
    setParseError(null);
    try {
      let textToParse = rawText.trim();
      
      // 如果上传了文件，读取并解析 JSON
      if (uploadedFile) {
        const fileContent = JSON.parse(await uploadedFile.text());
        // 将 JSON 数据转换为原始文本格式（假设 JSON 包含 episodes 数组）
        if (fileContent.episodes && Array.isArray(fileContent.episodes)) {
          textToParse = fileContent.episodes
            .map((ep: { title: string; durationSeconds: number }) => `${ep.title}\n${formatDurationHuman(ep.durationSeconds)}`)
            .join('\n');
        }
      }
      
      const result = await coursesApi.parse({ rawText: textToParse, subject: zone.subject, subSubject: zone.subSubject || undefined });
      setParseResult(result);
      setStep(2);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '解析失败');
      setParseResult(null);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || !zone || !courseName.trim()) return;
    setImporting(true);
    try {
      await coursesApi.create({
        name: courseName.trim(),
        subject: zone.subject,
        subSubject: zone.subSubject || undefined,
        lockedSubject: zone.subject,
        lockedSubSubject: zone.subSubject || undefined,
        episodes: parseResult.episodes,
      });
      showToast('success', `已导入「${courseName.trim()}」`);
      onClose();
      onImported();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-base)',
    outline: 'none',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`导入${zone?.label || ''}课程`} size="lg">
      {/* 步骤指示器：粘贴 → 预览 → 确认 */}
      <ol className="import-steps" aria-hidden="true">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const state = num < step ? 'done' : num === step ? 'current' : 'todo';
          return (
            <li key={label} className={`import-steps__item import-steps__item--${state}`}>
              <span className="import-steps__dot">
                {state === 'done' ? <Check size={14} strokeWidth={2} /> : num}
              </span>
              <span className="import-steps__label">{label}</span>
              {num < STEPS.length && <span className="import-steps__line" />}
            </li>
          );
        })}
      </ol>
      <p className="sr-only">第 {step} 步，共 {STEPS.length} 步：{STEPS[step - 1]}</p>

      <div key={step} className="import-modal__body import-pane">
        {step === 1 && (
          <>
            {/* 目标分区选择：右上角/卡片入口均可在此切换 */}
            <div className="import-modal__zone">
              <label htmlFor="import-zone" className="import-modal__label">目标分区</label>
              <div className="import-modal__zone-control">
                <Dropdown
                  block
                  className="import-modal__zone-dropdown"
                  value={zone ? zoneKey(zone) : ''}
                  onChange={handleZoneChange}
                  options={zones.map((z) => ({ value: zoneKey(z), label: z.label }))}
                  ariaLabel="目标分区"
                />
                {zone && (
                  <SubjectBadge subject={zone.subject} subSubject={zone.subSubject} size="md" />
                )}
              </div>
            </div>

            {/* 文件上传区域 */}
            <div className="import-modal__upload-section">
              <FileUpload 
                accept={{ '.json': ['application/json'] }}
                onChange={(files) => {
                  if (files.length > 0) {
                    setUploadedFile(files[0]);
                  }
                }}
              />
            </div>
            
            {/* OR 手动粘贴 */}
            <div className="import-modal__divider">
              <span>OR</span>
            </div>
            
            <div className="import-modal__manual-input">
              <label htmlFor="import-rawtext" className="import-modal__label">
                或直接粘贴集数列表（格式：标题 + 时长 MM:SS）
              </label>
              <textarea
                id="import-rawtext"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="第一集 概述&#10;31:43&#10;第二集 线性表&#10;59:19"
                rows={8}
                style={{ ...fieldStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
              />
            </div>
            
            {parseError && (
              <p className="import-modal__error">
                <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                {parseError}
              </p>
            )}
            <div className="import-modal__footer">
              <Button variant="glass" onClick={onClose}>取消</Button>
              <Button 
                variant="primary" 
                onClick={handleParse} 
                loading={parsing} 
                disabled={!rawText.trim() && !uploadedFile}
              >
                解析预览
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          </>
        )}

        {step === 2 && parseResult && (
          <>
            <div className="import-modal__preview">
              <table className="import-modal__table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>#</th>
                    <th style={{ textAlign: 'left' }}>标题</th>
                    <th style={{ textAlign: 'right' }}>时长</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.episodes.map((ep, i) => (
                    <tr key={i}>
                      <td className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</td>
                      <td>{ep.title}</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {formatDurationHuman(ep.durationSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 未识别行：警示色高亮 + 行号 */}
            {parseResult.unrecognizedLines.length > 0 && (
              <div className="import-modal__unrecognized">
                <p className="import-modal__unrecognized-title">
                  <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                  {parseResult.unrecognizedLines.length} 行未识别（已跳过）
                </p>
                <ul className="import-modal__unrecognized-list">
                  {parseResult.unrecognizedLines.map((line, i) => (
                    <li key={i}>
                      <span className="import-modal__line-no tabular-nums">{i + 1}</span>
                      <span className="import-modal__line-text">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="import-modal__summary">
              共 <strong className="tabular-nums">{parseResult.totalEpisodes}</strong> 集 · {formatDurationHuman(parseResult.totalDurationSeconds)}
            </p>

            <div className="import-modal__footer">
              <Button variant="glass" onClick={() => { setParseResult(null); setParseError(null); setStep(1); }}>
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                重新编辑
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                下一步
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          </>
        )}

        {step === 3 && parseResult && (
          <>
            <div>
              <label htmlFor="import-course-name" className="import-modal__label">课程名称</label>
              <input
                id="import-course-name"
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="例如：2026 张宇线性代数"
                maxLength={200}
                style={fieldStyle}
              />
            </div>

            {/* 确认摘要：分区 + 集数/时长/未识别行数 */}
            <div className="import-modal__confirm glass-1">
              <div className="import-modal__confirm-row">
                <span className="import-modal__confirm-label">导入分区</span>
                <SubjectBadge subject={zone?.subject ?? 'math'} subSubject={zone?.subSubject} size="md" />
              </div>
              <div className="import-modal__confirm-row">
                <span className="import-modal__confirm-label">集数</span>
                <span className="tabular-nums">{parseResult.totalEpisodes} 集</span>
              </div>
              <div className="import-modal__confirm-row">
                <span className="import-modal__confirm-label">总时长</span>
                <span className="tabular-nums">{formatDurationHuman(parseResult.totalDurationSeconds)}</span>
              </div>
              {parseResult.unrecognizedLines.length > 0 && (
                <div className="import-modal__confirm-row">
                  <span className="import-modal__confirm-label">未识别行</span>
                  <span className="import-modal__confirm-warning tabular-nums">
                    <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                    {parseResult.unrecognizedLines.length} 行（不导入）
                  </span>
                </div>
              )}
            </div>

            <div className="import-modal__footer">
              <Button variant="glass" onClick={() => setStep(2)} disabled={importing}>
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                上一步
              </Button>
              <Button variant="primary" onClick={handleImport} loading={importing} disabled={!courseName.trim()}>
                确认导入
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
