import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Download,
  Sparkles,
} from 'lucide-react';
import type {
  BatchExportReport,
  DocumentResult,
  ProcessingJob,
  SignerConfig,
  StampConfig,
  UploadedPdfFile,
} from '../../types';
import type { Translations } from '../../i18n';
import {
  buildExportZip,
  exportStampedPdf,
  type StampedPdfOutput,
} from '../../engine/placement/pdfExporter';
import { makeUniqueFileName, validateMultiDocumentForExport } from '../../engine/validation';
import {
  Badge,
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
} from '../ui';

interface ExportPanelProps {
  files: UploadedPdfFile[];
  results: Record<string, DocumentResult>;
  jobs: Record<string, ProcessingJob>;
  signers: SignerConfig[];
  stamps: StampConfig[];
  onMarkCompleted: (documentId: string, output: StampedPdfOutput, objectUrl: string) => void;
  onMarkFailed: (documentId: string, error: string) => void;
  /** clears the current documents and returns to the upload step (signatures/stamps stay) */
  onStartOver: () => void;
  t: Translations;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves a file. In the Windows app the embedded browser cannot download by itself, so the app's
 * own "Save as" dialog is used; in a normal browser a regular download starts.
 */
async function triggerBrowserDownload(urlOrBlob: string | Blob, fileName: string): Promise<string | null> {
  const desktopApi = (
    window as unknown as {
      pywebview?: { api?: { saveFile?: (b64: string, name: string) => Promise<{ success: boolean; cancelled?: boolean; error?: string; path?: string }> } };
    }
  ).pywebview?.api;

  if (desktopApi?.saveFile) {
    const blob = urlOrBlob instanceof Blob ? urlOrBlob : await (await fetch(urlOrBlob)).blob();
    const res = await desktopApi.saveFile(await blobToBase64(blob), fileName);
    if (!res.success && !res.cancelled) throw new Error(res.error || 'Save failed');
    return res.success ? (res.path ?? null) : null;
  }

  const isBlob = urlOrBlob instanceof Blob;
  const href = isBlob ? URL.createObjectURL(urlOrBlob) : urlOrBlob;
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (isBlob) {
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }
  return null;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  files,
  results,
  jobs,
  signers,
  stamps,
  onMarkCompleted,
  onMarkFailed,
  onStartOver,
  t,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(() => new Set());

  const docList = useMemo(() => Object.values(results), [results]);

  const eligibleDocs = useMemo(
    () =>
      docList.filter(
        (doc) => validateMultiDocumentForExport(doc, signers, stamps).canExport,
      ),
    [docList, signers, stamps],
  );

  const completedDocs = useMemo(
    () => docList.filter((d) => d.status === 'COMPLETED' && jobs[d.documentId]?.exportedUrl),
    [docList, jobs],
  );

  const allDownloaded =
    completedDocs.length > 0 && completedDocs.every((d) => downloadedIds.has(d.documentId));

  const handleStartOver = () => {
    if (completedDocs.length > 0 && !allDownloaded && !window.confirm(t.exportPanel.startOverConfirm)) {
      return;
    }
    onStartOver();
  };

  const blockedOrPendingDocs = useMemo(
    () =>
      docList.filter(
        (d) =>
          d.status !== 'COMPLETED' &&
          !validateMultiDocumentForExport(d, signers, stamps).canExport,
      ),
    [docList, signers, stamps],
  );

  const buildReport = (): BatchExportReport => ({
    generatedAt: new Date().toISOString(),
    totalDocuments: docList.length,
    completedCount: completedDocs.length,
    reviewRequiredCount: docList.filter((d) => d.status === 'REVIEW_REQUIRED').length,
    blockedCount: docList.filter((d) => d.status === 'BLOCKED').length,
    failedCount: Object.values(jobs).filter((j) => j.status === 'FAILED').length,
    documents: docList.map((d) => {
      const placedSigners =
        d.signerResults?.filter((s) => !s.skipped && s.anchor).length ?? 0;
      const placedStamps =
        d.stampResults?.filter((s) => !s.skipped && s.placement).length ?? d.stamp.count;
      return {
        documentId: d.documentId,
        fileName: d.fileName,
        status:
          jobs[d.documentId]?.status ??
          (d.status === 'COMPLETED' ? 'COMPLETED' : 'REVIEW_REQUIRED'),
        classification: d.classification,
        pageCount: d.pageCount,
        personAStatus: d.signatures.personA?.status ?? 'MISSING',
        personBStatus: d.signatures.personB?.status ?? 'MISSING',
        signerCount: d.signerResults?.filter((s) => !s.skipped).length ?? 0,
        signaturesPlaced: placedSigners,
        stampOwner: d.stamp.owner,
        stampCount: placedStamps,
        warnings: d.warnings,
        errors: d.errors,
      };
    }),
  });

  const handleGenerateAll = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportProgress(0);

    try {
      const usedNames = new Set<string>();
      for (let i = 0; i < eligibleDocs.length; i++) {
        const doc = eligibleDocs[i]!;
        const source = files.find((f) => f.id === doc.documentId);
        if (!source) continue;

        try {
          const stamped = await exportStampedPdf({
            sourceBytes: source.bytes,
            documentResult: doc,
            signers,
            stamps,
          });
          const uniqueOutName = makeUniqueFileName(`stamped-${stamped.fileName}`, usedNames);
          const copy = new Uint8Array(stamped.bytes.byteLength);
          copy.set(stamped.bytes);
          const blob = new Blob([copy], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          onMarkCompleted(doc.documentId, { ...stamped, fileName: uniqueOutName }, url);
        } catch (err) {
          onMarkFailed(doc.documentId, err instanceof Error ? err.message : String(err));
        }

        setExportProgress(Math.round(((i + 1) / Math.max(1, eligibleDocs.length)) * 100));
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadZip = async () => {
    setExportError(null);
    setSavedNote(null);
    const completedOutputs: StampedPdfOutput[] = [];
    for (const doc of completedDocs) {
      const job = jobs[doc.documentId];
      if (!job?.exportedBytes) continue;
      completedOutputs.push({
        fileName: doc.fileName,
        bytes: job.exportedBytes,
        pageCount: doc.pageCount,
      });
    }
    if (completedOutputs.length === 0) return;
    const zipBytes = await buildExportZip({
      completedOutputs,
      report: buildReport(),
    });
    const zipCopy = new Uint8Array(zipBytes.byteLength);
    zipCopy.set(zipBytes);
    try {
      setSaving(true);
      const path = await triggerBrowserDownload(
        new Blob([zipCopy], { type: 'application/zip' }),
        `pdf-stamp-studio-export-${Date.now()}.zip`,
      );
      if (path) setSavedNote(path);
      setDownloadedIds(new Set(completedDocs.map((d) => d.documentId)));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="export-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="export-heading" className="text-base font-bold text-[var(--color-text-primary)]">
            {t.exportPanel.heading}
          </h2>
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            {t.exportPanel.readyCount}:{' '}
            <strong className="font-mono tabular-nums">{eligibleDocs.length}</strong>
          </span>
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
            {t.exportPanel.completedCount}:{' '}
            <strong className="font-mono tabular-nums">{completedDocs.length}</strong>
          </span>
          {blockedOrPendingDocs.length > 0 && (
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
              {t.exportPanel.blockedCount}:{' '}
              <strong className="font-mono tabular-nums">{blockedOrPendingDocs.length}</strong>
            </span>
          )}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button
            size="sm"
            isLoading={isExporting}
            disabled={isExporting || eligibleDocs.length === 0}
            onClick={handleGenerateAll}
            className="w-full sm:w-auto"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t.exportPanel.generateAllBtn} ({eligibleDocs.length})
          </Button>

          <Button
            variant="success"
            size="sm"
            disabled={completedDocs.length === 0}
            onClick={handleDownloadZip}
            className="w-full sm:w-auto"
          >
            <Archive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t.exportPanel.downloadZipBtn} ({completedDocs.length})
          </Button>

          {completedDocs.length > 0 && !allDownloaded && (
            <Button variant="outline" size="sm" onClick={handleStartOver} className="w-full sm:w-auto">
              {t.exportPanel.startOverBtn}
            </Button>
          )}
        </div>
      </div>

      {allDownloaded && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-emerald-200 bg-[var(--color-success-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-0.5">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-success)]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t.exportPanel.allSavedTitle}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">{t.exportPanel.allSavedHint}</p>
          </div>
          <Button size="md" onClick={handleStartOver}>
            {t.exportPanel.startOverBtn}
          </Button>
        </div>
      )}

      {isExporting && (
        <Card>
          <CardContent className="p-4">
            <Progress label={t.exportPanel.exportingLabel} value={exportProgress} max={100} />
          </CardContent>
        </Card>
      )}

      {saving && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-primary-subtle)] p-3 text-xs"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
          />
          {t.exportPanel.savingLabel}
        </div>
      )}

      {savedNote && !saving && (
        <div
          role="status"
          className="rounded-[var(--radius-lg)] border border-emerald-200 bg-[var(--color-success-subtle)] p-3 text-xs font-medium text-[var(--color-success)]"
        >
          {t.exportPanel.savedTo}: {savedNote}
        </div>
      )}

      {exportError && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-rose-200 bg-[var(--color-danger-subtle)] p-3 text-xs text-[var(--color-danger)]"
        >
          {exportError}
        </div>
      )}

      {eligibleDocs.length === 0 && completedDocs.length === 0 && (
        <EmptyState title={t.exportPanel.notReadyHint} />
      )}

      {/* Ready & Completed files list */}
      {(eligibleDocs.length > 0 || completedDocs.length > 0) && (
        <Card className="overflow-hidden">
          <Table>
            <TableCaption>{t.exportPanel.heading}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t.analyze.colFile}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.analyze.colPages}</TableHead>
                <TableHead className="hidden md:table-cell">{t.analyze.colStamp}</TableHead>
                <TableHead>{t.analyze.colStatus}</TableHead>
                <TableHead className="text-right">{t.upload.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docList
                .filter(
                  (d) =>
                    (d.status === 'COMPLETED' && Boolean(jobs[d.documentId]?.exportedUrl)) ||
                    validateMultiDocumentForExport(d, signers, stamps).canExport,
                )
                .map((doc) => {
                  const job = jobs[doc.documentId];
                  const isGenerated = doc.status === 'COMPLETED' && Boolean(job?.exportedUrl);
                  const sigPlaced =
                    doc.signerResults?.filter((s) => !s.skipped && s.anchor).length ?? 0;
                  const stampPlaced =
                    doc.stampResults?.filter((s) => !s.skipped && s.placement).length ?? 0;
                  return (
                    <TableRow key={doc.documentId}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {isGenerated ? (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-[var(--color-success)]"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          ) : (
                            <Clock
                              className="h-4 w-4 shrink-0 text-[var(--color-primary)]"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          )}
                          <span className="max-w-[115px] truncate sm:max-w-[300px]">{doc.fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs tabular-nums sm:table-cell">{doc.pageCount}</TableCell>
                      <TableCell className="hidden text-xs text-[var(--color-text-secondary)] md:table-cell">
                        {sigPlaced} {t.review.placedCountLabel} · {stampPlaced}{' '}
                        {t.review.stampsCountLabel}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isGenerated ? 'success' : 'primary'}>
                          {isGenerated ? t.statusLabels.COMPLETED : t.exportPanel.readyCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {job?.exportedUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={t.exportPanel.downloadSingle}
                            onClick={() => {
                              setExportError(null);
                              setSavedNote(null);
                              setSaving(true);
                              void triggerBrowserDownload(job.exportedUrl!, `stamped-${doc.fileName}`)
                                .then((path) => {
                                  if (path) setSavedNote(path);
                                  setDownloadedIds((prev) => new Set(prev).add(doc.documentId));
                                })
                                .catch((err: unknown) =>
                                  setExportError(err instanceof Error ? err.message : String(err)),
                                )
                                .finally(() => setSaving(false));
                            }}
                          >
                            <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            <span className="hidden sm:inline">{t.exportPanel.downloadSingle}</span>
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

      {/* Blocked / Incomplete files list */}
      {blockedOrPendingDocs.length > 0 && (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-rose-200 bg-[var(--color-danger-subtle)] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)]">
            <AlertCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t.exportPanel.blockedCount}
          </h3>
          <ul className="space-y-1 text-xs text-[var(--color-danger)]">
            {blockedOrPendingDocs.map((doc) => {
              const validationReasons = validateMultiDocumentForExport(
                doc,
                signers,
                stamps,
              ).reasons;
              const displayErrors =
                doc.errors.length > 0 ? doc.errors : validationReasons;
              return (
                <li key={doc.documentId} className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{doc.fileName}</span>
                  <span>
                    {displayErrors.length
                      ? displayErrors
                          .map((e) => t.issues[e as keyof typeof t.issues] ?? e)
                          .join(', ')
                      : (t.statusLabels[doc.status as keyof typeof t.statusLabels] ?? doc.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};
