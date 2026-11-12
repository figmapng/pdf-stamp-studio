import React from 'react';
import { CheckCheck, Eye, RefreshCw, Square } from 'lucide-react';
import type { DocumentResult, ProcessingJob, UploadedPdfFile } from '../../types';
import type { Translations } from '../../i18n';
import { canBatchApproveDocument } from '../../engine/validation';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Progress,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '../ui';
import { DetectionStatusBadge } from '../domain';

interface BatchQueuePanelProps {
  files: UploadedPdfFile[];
  jobs: Record<string, ProcessingJob>;
  results: Record<string, DocumentResult>;
  isRunning: boolean;
  onStartOrReanalyze: () => void;
  onCancel: () => void;
  onOpenReview: (documentId: string) => void;
  onPrev: () => void;
  onApproveAll: () => void;
  onGoToReview: () => void;
  onGoToExport: () => void;
  t: Translations;
}

export const BatchQueuePanel: React.FC<BatchQueuePanelProps> = ({
  files,
  jobs,
  results,
  isRunning,
  onStartOrReanalyze,
  onCancel,
  onOpenReview,
  onPrev,
  onApproveAll,
  onGoToReview,
  onGoToExport,
  t,
}) => {
  const { pushToast } = useToast();
  const jobList = files.map((f) => jobs[f.id]);
  const total = files.length;
  const completedAnalysis = Object.keys(results).length;
  const autoReadyCount = Object.values(results).filter(
    (r) => r.status === 'AUTO_READY' || r.status === 'COMPLETED',
  ).length;
  const reviewCount = Object.values(results).filter((r) => r.status === 'REVIEW_REQUIRED').length;
  const approvableCount = Object.values(results).filter(canBatchApproveDocument).length;
  const blockedCount = Object.values(results).filter((r) => r.status === 'BLOCKED').length;
  const failedCount = jobList.filter((j) => j?.status === 'FAILED').length;
  const firstReviewDoc =
    Object.values(results).find(
      (r) => r.status === 'REVIEW_REQUIRED' || r.status === 'BLOCKED',
    ) ?? Object.values(results)[0];

  return (
    <section aria-labelledby="analyze-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analyze-heading" className="text-base font-bold text-[var(--color-text-primary)]">
          {t.analyze.heading}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={onCancel}>
              <Square className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t.analyze.cancelBtn}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onStartOrReanalyze} disabled={total === 0}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t.analyze.reanalyzeBtn}
            </Button>
          )}
        </div>
      </div>

      {/* Compact Progress & Stats */}
      <Card>
        <CardContent className="space-y-3 p-3.5">
          <Progress
            label={`${t.analyze.summaryAnalyzed}: ${completedAnalysis} / ${total}`}
            max={Math.max(1, total)}
            value={isRunning && completedAnalysis === 0 ? undefined : completedAnalysis}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] px-2.5 py-1 font-medium text-[var(--color-text-secondary)]">
              {t.analyze.summaryTotal}: <strong className="font-mono tabular-nums text-[var(--color-text-primary)]">{total}</strong>
            </span>
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle)] px-2.5 py-1 font-medium text-[var(--color-success)]">
              {t.analyze.summaryAutoReady}: <strong className="font-mono tabular-nums">{autoReadyCount}</strong>
            </span>
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] px-2.5 py-1 font-medium text-[var(--color-warning)]">
              {t.analyze.summaryReview}: <strong className="font-mono tabular-nums">{reviewCount}</strong>
            </span>
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-2.5 py-1 font-medium text-[var(--color-danger)]">
              {t.analyze.summaryBlocked}: <strong className="font-mono tabular-nums">{blockedCount}</strong>
            </span>
            {failedCount > 0 && (
              <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-muted)] px-2.5 py-1 font-medium text-[var(--color-text-secondary)]">
                {t.analyze.summaryFailed}: <strong className="font-mono tabular-nums">{failedCount}</strong>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {!isRunning && (approvableCount > 0 || (autoReadyCount === 0 && (reviewCount > 0 || blockedCount > 0) && firstReviewDoc)) && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-[var(--color-warning-subtle)] px-3.5 py-2.5 text-xs font-medium text-[var(--color-warning)]"
        >
          <span>{t.analyze.reviewActionBanner}</span>
          <div className="flex flex-wrap items-center gap-2">
            {approvableCount > 0 && (
              <Button
                variant="success"
                size="sm"
                onClick={() => {
                  onApproveAll();
                  pushToast({ variant: 'success', title: `${t.analyze.approvedToastTitle} (${approvableCount})` });
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {t.analyze.approveAllBtn} ({approvableCount})
              </Button>
            )}
            {firstReviewDoc && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onOpenReview(firstReviewDoc.documentId)}
                className="bg-[var(--color-warning)] hover:bg-[var(--color-warning-hover)]"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {t.analyze.goToReviewBtn} ({reviewCount + blockedCount})
              </Button>
            )}
          </div>
        </div>
      )}

      {total === 0 ? (
        <EmptyState title={t.analyze.noFilesYet} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableCaption>{t.analyze.heading}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t.analyze.colFile}</TableHead>
                <TableHead>{t.analyze.colType}</TableHead>
                <TableHead>{t.analyze.colPages}</TableHead>
                <TableHead>{t.analyze.colPersonA}</TableHead>
                <TableHead>{t.analyze.colPersonB}</TableHead>
                <TableHead>{t.analyze.colStamp}</TableHead>
                <TableHead>{t.analyze.colStatus}</TableHead>
                <TableHead className="sticky right-0 z-[var(--z-sticky)] bg-[var(--color-bg-subtle)] text-right">
                  {t.analyze.colAction}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const job = jobs[file.id];
                const res = results[file.id];
                const displayStatus = res?.status ?? job?.status ?? 'QUEUED';
                const errList = res?.errors.length ? res.errors : (job?.errors ?? []);

                return (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">
                      <span className="block max-w-[190px] truncate">{file.fileName}</span>
                      {errList.length > 0 && (
                        <span className="mt-0.5 block text-xs text-[var(--color-danger)]">
                          {errList
                            .map((err) => t.issues[err as keyof typeof t.issues] ?? err)
                            .join(', ')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                      {res ? (t.docTypes[res.classification] ?? res.classification) : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {job?.status === 'ANALYZING'
                        ? `${job.pagesAnalyzed}/${job.pagesTotal || file.pageCount || '?'}`
                        : (res?.pageCount ?? file.pageCount ?? '—')}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {res?.signatures.personA ? (
                        <span className="font-medium text-[var(--color-primary)]">
                          {res.signatures.personA.pageIndex + 1}-{t.analyze.pageSuffix} (
                          {Math.round(res.signatures.personA.confidence * 100)}%)
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {res?.signatures.personB ? (
                        <span className="font-medium text-[var(--color-success)]">
                          {res.signatures.personB.pageIndex + 1}-{t.analyze.pageSuffix} (
                          {Math.round(res.signatures.personB.confidence * 100)}%)
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap tabular-nums">
                      {res
                        ? `${t.stampOwners[res.stamp.owner as keyof typeof t.stampOwners] ?? res.stamp.owner} (${res.stamp.count})`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <DetectionStatusBadge status={displayStatus} labels={t.statusLabels} />
                    </TableCell>
                    <TableCell className="sticky right-0 z-[var(--z-sticky)] bg-[var(--color-bg-surface)] text-right">
                      {res && (
                        <Button variant="outline" size="sm" onClick={() => onOpenReview(file.id)}>
                          <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {t.analyze.openReview}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-3">
        <Button variant="outline" size="md" onClick={onPrev}>
          {t.profiles.prevStep}
        </Button>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Button variant="outline" size="md" onClick={onGoToReview} disabled={!firstReviewDoc}>
              <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {t.analyze.goToReviewBtn}
            </Button>
          )}
          <Button size="md" onClick={onGoToExport} disabled={autoReadyCount === 0}>
            {t.analyze.nextToExportBtn}
          </Button>
        </div>
      </div>
    </section>
  );
};
