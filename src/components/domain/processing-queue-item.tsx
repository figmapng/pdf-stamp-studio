import React from 'react';
import { Eye, FileText } from 'lucide-react';
import type { DocumentResult, ProcessingJob, UploadedPdfFile } from '../../types';
import { Button } from '../ui/button';
import { DetectionStatusBadge } from './detection-status';

export interface ProcessingQueueItemProps {
  file: UploadedPdfFile;
  job?: ProcessingJob;
  result?: DocumentResult;
  openReviewLabel: string;
  onOpenReview: (documentId: string) => void;
}

export const ProcessingQueueItem: React.FC<ProcessingQueueItemProps> = ({
  file,
  job,
  result,
  openReviewLabel,
  onOpenReview,
}) => {
  const displayStatus = result?.status ?? job?.status ?? 'QUEUED';
  const errors = result?.errors.length ? result.errors : (job?.errors ?? []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3 shadow-[var(--shadow-xs)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
            {file.fileName}
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
            {result?.classification ?? 'PDF'} · {result?.pageCount ?? file.pageCount ?? '—'}p
          </p>
          {errors.length > 0 && (
            <p className="mt-0.5 text-[11px] font-medium text-[var(--color-danger)]">
              {errors.join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DetectionStatusBadge status={displayStatus} />
        {result && (
          <Button variant="outline" size="sm" onClick={() => onOpenReview(file.id)}>
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {openReviewLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
