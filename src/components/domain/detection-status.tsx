import React from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock } from 'lucide-react';
import type { DocumentResultStatus, JobStatus, SignatureAnchor } from '../../types';
import { Badge } from '../ui/badge';

export interface DetectionStatusBadgeProps {
  status: DocumentResultStatus | JobStatus | string;
  labels?: Partial<Record<string, string>>;
}

export const DetectionStatusBadge: React.FC<DetectionStatusBadgeProps> = ({ status, labels }) => {
  const display = labels?.[status] ?? status;
  switch (status) {
    case 'AUTO_READY':
    case 'COMPLETED':
    case 'READY_TO_EXPORT':
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {display}
        </Badge>
      );
    case 'REVIEW_REQUIRED':
      return (
        <Badge variant="warning">
          <AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {display}
        </Badge>
      );
    case 'BLOCKED':
    case 'FAILED':
      return (
        <Badge variant="danger">
          <Ban className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {display}
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral">
          <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {display}
        </Badge>
      );
  }
};

export interface DetectionStatusProps {
  label: string;
  anchor: SignatureAnchor | null;
  scoreLabels: {
    name: string;
    role: string;
    context: string;
    line: string;
  };
  notFoundLabel?: string;
}

export const DetectionStatus: React.FC<DetectionStatusProps> = ({
  label,
  anchor,
  scoreLabels,
  notFoundLabel = 'Not found',
}) => {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-xs">
      <div className="flex items-center justify-between gap-2 font-semibold text-[var(--color-text-primary)]">
        <span>{label}</span>
        {anchor ? (
          <span className="font-mono tabular-nums">
            {Math.round(anchor.confidence * 100)}%
          </span>
        ) : (
          <span className="text-[var(--color-danger)]">{notFoundLabel}</span>
        )}
      </div>

      {anchor && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-secondary)]">
            <span className="tabular-nums">
              {scoreLabels.name}: {Math.round(anchor.scores.nameMatch * 100)}%
            </span>
            <span className="tabular-nums">
              {scoreLabels.role}: {Math.round(anchor.scores.roleMatch * 100)}%
            </span>
            <span className="tabular-nums">
              {scoreLabels.context}: {Math.round(anchor.scores.contextMatch * 100)}%
            </span>
            <span className="tabular-nums">
              {scoreLabels.line}: {Math.round(anchor.scores.lineMatch * 100)}%
            </span>
          </div>
          {anchor.matchedNameText && (
            <p className="truncate rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-[11px] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]">
              “{anchor.matchedNameText}”
            </p>
          )}
        </div>
      )}
    </div>
  );
};
