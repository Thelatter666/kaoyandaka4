import React from 'react';
import { Card } from '../ui/Card';
import { SubjectBadge } from '../ui/SubjectBadge';
import type { Subject, SubSubject } from '@shared/types';

interface PresetCardProps {
  id: string;
  name: string;
  subject: Subject;
  subSubject: SubSubject | null;
  durationMinutes: number;
  isSelected?: boolean;
  isRecentlyUsed?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  compact?: boolean;
}

export function PresetCard({
  name,
  subject,
  subSubject,
  durationMinutes,
  isSelected = false,
  isRecentlyUsed = false,
  onClick,
  onDelete,
  onEdit,
  compact = false,
}: PresetCardProps) {
  return (
    <Card
      onClick={onClick}
      padding={compact ? 'var(--space-md)' : 'var(--space-lg)'}
      style={{
        border: isSelected ? '2px solid var(--color-accent-primary)' : undefined,
        transform: isSelected ? 'scale(1.02)' : undefined,
        position: 'relative',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 'var(--space-sm)' : 'var(--space-md)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-sm)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: compact ? 'var(--text-base)' : 'var(--text-lg)',
              fontWeight: 500,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {name}
            </h4>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', flexShrink: 0 }}>
            <SubjectBadge subject={subject} subSubject={subSubject} />
            {isRecentlyUsed && (
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-accent-success)',
                backgroundColor: 'var(--color-accent-success-light)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 500,
              }}>
                最近
              </span>
            )}
            {isSelected && (
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-inverse)',
                backgroundColor: 'var(--color-accent-primary)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 500,
              }}>
                已选
              </span>
            )}
          </div>
        </div>

        {/* Duration */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          fontSize: compact ? 'var(--text-sm)' : 'var(--text-base)',
          color: 'var(--color-text-secondary)',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}>
            {durationMinutes} 分钟
          </span>
        </div>

        {/* Actions */}
        {(onEdit || onDelete) && (
          <div style={{
            display: 'flex',
            gap: 'var(--space-sm)',
            marginTop: 'var(--space-xs)',
          }}>
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                aria-label={`编辑 ${name}`}
                style={{
                  padding: '4px 12px',
                  fontSize: 'var(--text-xs)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                }}
              >
                编辑
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                aria-label={`删除 ${name}`}
                style={{
                  padding: '4px 12px',
                  fontSize: 'var(--text-xs)',
                  border: '1px solid var(--color-accent-primary)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-accent-primary)',
                }}
              >
                删除
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
