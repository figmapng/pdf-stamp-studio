import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, RefreshCw, Square } from 'lucide-react';
import type {
  DocumentResult,
  DocumentSignatureEntry,
  DocumentStampEntry,
  ProcessingJob,
  Rect,
  ResolvedStampOwner,
  SignatureAnchor,
  SignerConfig,
  StampConfig,
  UploadedPdfFile,
} from '../../types';
import type { Translations } from '../../i18n';
import { loadPdfJs, type PdfJsDocumentProxy } from '../../engine/pdf-parser';
import { canBatchApproveDocument } from '../../engine/validation';
import { AlertDialog, Badge, Button, Card, CardContent, EmptyState, Progress, useToast } from '../ui';
import { DetectionStatusBadge, PDFViewerToolbar, ReviewPanel } from '../domain';
import {
  PdfPageCanvas,
  type CanvasSignerItem,
  type CanvasStampItem,
  type ReviewEditTool,
} from '../pdf-viewer/PdfPageCanvas';

export interface DocumentUpdatePatch {
  nextSignerEntries?: DocumentSignatureEntry[];
  nextStampEntries?: DocumentStampEntry[];
  manualApprovalConfirmed?: boolean;
  cryptoSignatureAcknowledged?: boolean;
  forceBlocked?: boolean;
}

interface ManualReviewCenterProps {
  files: UploadedPdfFile[];
  jobs: Record<string, ProcessingJob>;
  results: Record<string, DocumentResult>;
  isRunning: boolean;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  signers: SignerConfig[];
  stamps: StampConfig[];
  onUpdateDocument: (documentId: string, patch: DocumentUpdatePatch) => void;
  onApplyLayoutToAll: (sourceDocumentId: string) => void;
  onApproveAll: () => void;
  onStartOrReanalyze: () => void;
  onCancelAnalysis: () => void;
  t: Translations;
}

export const ManualReviewCenter: React.FC<ManualReviewCenterProps> = ({
  files,
  jobs,
  results,
  isRunning,
  selectedDocumentId,
  onSelectDocument,
  signers,
  stamps,
  onUpdateDocument,
  onApplyLayoutToAll,
  onApproveAll,
  onStartOrReanalyze,
  onCancelAnalysis,
  t,
}) => {
  const { pushToast } = useToast();
  const [pageIndex, setPageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'PLACED' | 'SINGLE'>('SINGLE');
  const [zoom, setZoom] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640
      ? Number(Math.max(0.45, Math.min(0.85, (window.innerWidth - 52) / 595)).toFixed(2))
      : 1.1,
  );
  const [sharedPdfDoc, setSharedPdfDoc] = useState<PdfJsDocumentProxy | null>(null);
  const viewerScrollRef = useRef<HTMLDivElement | null>(null);
  const viewerContentRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const pageWrapperRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [activeTool, setActiveTool] = useState<ReviewEditTool>(() =>
    stamps[0]
      ? { kind: 'STAMP', id: stamps[0].id }
      : signers[0]
        ? { kind: 'SIGNER', id: signers[0].id }
        : null,
  );
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [applyAllOpen, setApplyAllOpen] = useState(false);

  const docList = useMemo(() => Object.values(results), [results]);
  const completedCount = docList.length;
  const totalCount = files.length;
  const autoReadyCount = useMemo(
    () =>
      docList.filter(
        (r) => r.status === 'AUTO_READY' || r.status === 'COMPLETED' || r.manualApprovalConfirmed,
      ).length,
    [docList],
  );
  const reviewCount = useMemo(
    () => docList.filter((r) => r.status === 'REVIEW_REQUIRED').length,
    [docList],
  );
  const blockedCount = useMemo(
    () => docList.filter((r) => r.status === 'BLOCKED').length,
    [docList],
  );

  const activeDoc = selectedDocumentId
    ? (results[selectedDocumentId] ?? docList[0] ?? null)
    : (docList[0] ?? null);
  const activeFile = activeDoc
    ? (files.find((f) => f.id === activeDoc.documentId) ?? null)
    : null;

  const placedPages = useMemo(() => {
    if (!activeDoc) return [];
    const set = new Set<number>();
    for (const s of activeDoc.signerResults ?? []) {
      if (!s.skipped && s.anchor) set.add(s.anchor.pageIndex);
    }
    for (const st of activeDoc.stampResults ?? []) {
      if (!st.skipped && st.placement) set.add(st.placement.pageIndex);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [activeDoc]);

  useEffect(() => {
    if (
      !activeFile ||
      activeFile.bytes.byteLength === 0 ||
      activeDoc?.integrity.isEncrypted ||
      activeDoc?.integrity.errorCode === 'INVALID_PDF'
    ) {
      setSharedPdfDoc(null);
      return;
    }

    let cancelled = false;
    let docInstance: PdfJsDocumentProxy | null = null;
    let taskInstance: { promise: Promise<PdfJsDocumentProxy>; destroy: () => Promise<void> } | null =
      null;

    const loadDoc = async () => {
      try {
        const pdfJs = await loadPdfJs();
        const task = pdfJs.getDocument({
          data: new Uint8Array(activeFile.bytes),
          cMapUrl: '/wasm/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/wasm/pdfjs/standard_fonts/',
          isEvalSupported: false,
        });
        taskInstance = task;
        docInstance = await task.promise;
        if (cancelled) {
          await docInstance.cleanup().catch(() => undefined);
          await task.destroy().catch(() => undefined);
          return;
        }
        setSharedPdfDoc(docInstance);
      } catch {
        if (!cancelled) setSharedPdfDoc(null);
      }
    };

    void loadDoc();

    return () => {
      cancelled = true;
      setSharedPdfDoc(null);
      if (docInstance) {
        void docInstance.cleanup().catch(() => undefined);
      }
      if (taskInstance) {
        void taskInstance.destroy().catch(() => undefined);
      }
    };
  }, [activeFile?.id, activeFile?.bytes, activeDoc?.integrity.isEncrypted, activeDoc?.integrity.errorCode]);

  // Keep activeTool pointing to an existing signer or stamp in the active document
  useEffect(() => {
    const sEntries = activeDoc?.signerResults ?? [];
    const stEntries = activeDoc?.stampResults ?? [];

    const stillValid =
      activeTool &&
      ((activeTool.kind === 'SIGNER' && sEntries.some((s) => s.signerId === activeTool.id && !s.skipped)) ||
        (activeTool.kind === 'STAMP' && stEntries.some((s) => s.stampId === activeTool.id && !s.skipped)));

    if (stillValid) return;

    const nextSt = stEntries.find((s) => !s.skipped) ?? stEntries[0];
    const nextSig = sEntries.find((s) => !s.skipped) ?? sEntries[0];
    if (nextSt && !nextSt.skipped) {
      setActiveTool({ kind: 'STAMP', id: nextSt.stampId });
    } else if (nextSig && !nextSig.skipped) {
      setActiveTool({ kind: 'SIGNER', id: nextSig.signerId });
    } else if (stamps[0]) {
      setActiveTool({ kind: 'STAMP', id: stamps[0].id });
    } else if (signers[0]) {
      setActiveTool({ kind: 'SIGNER', id: signers[0].id });
    } else {
      setActiveTool(null);
    }
  }, [activeDoc?.documentId, activeDoc?.signerResults, activeDoc?.stampResults, signers, stamps]);

  useEffect(() => {
    if (!activeDoc) return;
    userScrolledRef.current = false;
    const firstStampPage = activeDoc.stampResults?.find((s) => !s.skipped && s.placement)?.placement
      ?.pageIndex;
    const firstSignerPage = activeDoc.signerResults?.find((s) => !s.skipped && s.anchor)?.anchor
      ?.pageIndex;
    const initialPage =
      firstStampPage ?? firstSignerPage ?? Math.max(0, activeDoc.pageCount - 1);
    setPageIndex(Math.max(0, Math.min(Math.max(0, activeDoc.pageCount - 1), initialPage)));
    setViewMode(placedPages.length > 1 ? 'PLACED' : 'SINGLE');
  }, [activeDoc?.documentId]);

  // Automatically scroll the PDF preview so placed signatures and stamps appear in view immediately
  useEffect(() => {
    if (!activeDoc || compareOriginal) return;

    const focusPlacedItemsInView = () => {
      if (userScrolledRef.current) return;
      const container = viewerScrollRef.current;
      if (!container) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>('[data-overlay-item]'));
      if (items.length === 0) return;

      const containerRect = container.getBoundingClientRect();
      if (containerRect.height <= 0) return;

      let minTop = Infinity;
      let maxBottom = -Infinity;
      for (const el of items) {
        const rect = el.getBoundingClientRect();
        const topInScroll = rect.top - containerRect.top + container.scrollTop;
        const bottomInScroll = topInScroll + rect.height;
        if (topInScroll < minTop) minTop = topInScroll;
        if (bottomInScroll > maxBottom) maxBottom = bottomInScroll;
      }

      if (!Number.isFinite(minTop) || !Number.isFinite(maxBottom)) return;
      const span = maxBottom - minTop;
      const rawTarget =
        span <= container.clientHeight - 40
          ? (minTop + maxBottom) / 2 - container.clientHeight / 2
          : minTop - 48;

      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = Math.max(0, Math.min(maxScroll, rawTarget));
    };

    const rafId = requestAnimationFrame(focusPlacedItemsInView);
    const timerId = setTimeout(focusPlacedItemsInView, 160);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && viewerContentRef.current) {
      observer = new ResizeObserver(() => {
        focusPlacedItemsInView();
      });
      observer.observe(viewerContentRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      observer?.disconnect();
    };
  }, [activeDoc?.documentId, sharedPdfDoc, viewMode, pageIndex, zoom, compareOriginal]);

  const canvasSigners: CanvasSignerItem[] = useMemo(() => {
    const entries = activeDoc?.signerResults ?? [];
    return entries.map((entry, idx) => {
      const cfg = signers.find((s) => s.id === entry.signerId);
      const label = cfg?.profile.fullName.trim() || `${idx + 1}-${t.review.placedCountLabel}`;
      return {
        id: entry.signerId,
        label,
        anchor: entry.anchor,
        asset: cfg?.asset ?? null,
        skipped: entry.skipped,
      };
    });
  }, [activeDoc?.signerResults, signers, t.review.placedCountLabel]);

  const canvasStamps: CanvasStampItem[] = useMemo(() => {
    const entries = activeDoc?.stampResults ?? [];
    return entries.map((entry, idx) => {
      const cfg = stamps.find((s) => s.id === entry.stampId);
      const label = cfg?.label || `${t.stamp.cardTitle} ${idx + 1}`;
      return {
        id: entry.stampId,
        label,
        placement: entry.placement,
        asset: cfg?.asset ?? null,
        skipped: entry.skipped,
      };
    });
  }, [activeDoc?.stampResults, stamps, t.stamp.cardTitle]);

  const handleMoveItem = (
    tool: NonNullable<ReviewEditTool>,
    nextBounds: Rect,
    targetPage: number,
  ) => {
    if (!activeDoc) return;
    if (tool.kind === 'SIGNER') {
      const entries = activeDoc.signerResults ?? [];
      const nextEntries = entries.map((entry) => {
        if (entry.signerId !== tool.id) return entry;
        const nextAnchor: SignatureAnchor = entry.anchor
          ? {
              ...entry.anchor,
              pageIndex: targetPage,
              placementBounds: nextBounds,
              status: 'AUTO_READY',
              isManuallyAdjusted: true,
            }
          : {
              personId: entry.signerId,
              pageIndex: targetPage,
              lineBounds: {
                x: nextBounds.x,
                y: nextBounds.y + nextBounds.height * 0.8,
                width: nextBounds.width,
                height: 1.5,
              },
              placementBounds: nextBounds,
              confidence: 1,
              scores: {
                nameMatch: 1,
                roleMatch: 1,
                contextMatch: 1,
                lineMatch: 1,
                geometryMatch: 1,
              },
              detectionMethod: 'HYBRID',
              status: 'AUTO_READY',
              evidence: [{ type: 'LAYOUT', description: 'Manually placed by user' }],
              candidateCount: 1,
              isManuallyAdjusted: true,
            };
        return { ...entry, anchor: nextAnchor, skipped: false };
      });
      onUpdateDocument(activeDoc.documentId, { nextSignerEntries: nextEntries });
    } else {
      const entries = activeDoc.stampResults ?? [];
      const cfg = stamps.find((s) => s.id === tool.id);
      const nextEntries = entries.map((entry) => {
        if (entry.stampId !== tool.id) return entry;
        return {
          ...entry,
          skipped: false,
          isManuallyAdjusted: true,
          placement: {
            pageIndex: targetPage,
            bounds: nextBounds,
            rotation: entry.placement?.rotation ?? cfg?.policy.defaultRotation ?? 0,
          },
        };
      });
      onUpdateDocument(activeDoc.documentId, { nextStampEntries: nextEntries });
    }
  };

  const handleToggleSkipSigner = (signerId: string, skipped: boolean) => {
    if (!activeDoc) return;
    const entries = activeDoc.signerResults ?? [];
    const nextEntries = entries.map((e) => (e.signerId === signerId ? { ...e, skipped } : e));
    onUpdateDocument(activeDoc.documentId, { nextSignerEntries: nextEntries });
  };

  const handleToggleSkipStamp = (stampId: string, skipped: boolean) => {
    if (!activeDoc) return;
    const entries = activeDoc.stampResults ?? [];
    const nextEntries = entries.map((e) => (e.stampId === stampId ? { ...e, skipped } : e));
    onUpdateDocument(activeDoc.documentId, { nextStampEntries: nextEntries });
  };

  const handleStampOwnerChange = (stampId: string, owner: ResolvedStampOwner) => {
    if (!activeDoc) return;
    const entries = activeDoc.stampResults ?? [];
    const nextEntries = entries.map((e) =>
      e.stampId === stampId
        ? {
            ...e,
            owner,
            isManuallyAdjusted: false,
            placement: null,
          }
        : e,
    );
    onUpdateDocument(activeDoc.documentId, { nextStampEntries: nextEntries });
  };

  const approvableCount = useMemo(
    () => Object.values(results).filter(canBatchApproveDocument).length,
    [results],
  );

  return (
    <section aria-labelledby="review-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="review-heading" className="text-lg font-bold text-[var(--color-text-primary)]">
            {t.review.heading}
          </h2>
          {totalCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)]">
                {t.analyze.summaryTotal}:{' '}
                <strong className="font-mono tabular-nums text-[var(--color-text-primary)]">
                  {totalCount}
                </strong>
              </span>
              <span className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle)] px-2 py-0.5 font-medium text-[var(--color-success)]">
                {t.analyze.summaryAutoReady}: <strong className="font-mono tabular-nums">{autoReadyCount}</strong>
              </span>
              {reviewCount > 0 && (
                <span className="rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] px-2 py-0.5 font-medium text-[var(--color-warning)]">
                  {t.analyze.summaryReview}: <strong className="font-mono tabular-nums">{reviewCount}</strong>
                </span>
              )}
              {blockedCount > 0 && (
                <span className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-2 py-0.5 font-medium text-[var(--color-danger)]">
                  {t.analyze.summaryBlocked}: <strong className="font-mono tabular-nums">{blockedCount}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={onCancelAnalysis}>
              <Square className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t.analyze.cancelBtn}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onStartOrReanalyze}
              disabled={totalCount === 0 || (signers.length === 0 && stamps.length === 0)}
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t.analyze.reanalyzeBtn}
            </Button>
          )}
          {!isRunning && approvableCount > 0 && (
            <Button
              variant="success"
              size="sm"
              onClick={() => {
                onApproveAll();
                pushToast({
                  variant: 'success',
                  title: `${t.analyze.approvedToastTitle} (${approvableCount})`,
                });
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t.analyze.approveAllBtn} ({approvableCount})
            </Button>
          )}
        </div>
      </div>

      {isRunning && totalCount > 0 && (
        <Card>
          <CardContent className="p-3">
            <Progress
              label={`${t.analyze.summaryAnalyzed}: ${completedCount} / ${totalCount}`}
              max={Math.max(1, totalCount)}
              value={completedCount === 0 ? undefined : completedCount}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Left Document List (compact horizontal strip on mobile, vertical sidebar on desktop) */}
        <aside className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-2.5 shadow-[var(--shadow-xs)] sm:p-3 lg:col-span-3 lg:max-h-[75vh] lg:overflow-y-auto">
          {files.length === 0 ? (
            <p className="p-4 text-center text-xs text-[var(--color-text-muted)]">
              {t.analyze.noFilesYet}
            </p>
          ) : (
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
              {files.map((file) => {
                const doc = results[file.id];
                const job = jobs[file.id];
                const displayStatus = doc?.status ?? job?.status ?? 'QUEUED';
                const isSelected = activeDoc?.documentId === file.id;
                const placedSigners =
                  doc?.signerResults?.filter((s) => !s.skipped && s.anchor).length ?? 0;
                const activeSignerTotal =
                  doc?.signerResults?.filter((s) => !s.skipped).length ?? 0;
                const placedStamps =
                  doc?.stampResults?.filter((s) => !s.skipped && s.placement).length ?? 0;
                const activeStampTotal =
                  doc?.stampResults?.filter((s) => !s.skipped).length ?? 0;

                return (
                  <li key={file.id} className="w-56 shrink-0 lg:w-full">
                    <button
                      type="button"
                      disabled={!doc}
                      onClick={() => doc && onSelectDocument(doc.documentId)}
                      className={`w-full cursor-pointer rounded-[var(--radius-md)] border p-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70 ${
                        isSelected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
                          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-canvas)]'
                      }`}
                    >
                      <div className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                        {file.fileName}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <DetectionStatusBadge status={displayStatus} labels={t.statusLabels} />
                        <Badge variant="neutral" className="text-[10px]">
                          {doc
                            ? `${t.docTypes[doc.classification] ?? doc.classification} · ${doc.pageCount} ${t.analyze.pageSuffix}`
                            : `${file.pageCount ?? '?'} ${t.analyze.pageSuffix}`}
                        </Badge>
                      </div>
                      {doc && (activeSignerTotal > 0 || activeStampTotal > 0) && (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] tabular-nums text-[var(--color-text-secondary)]">
                          {activeSignerTotal > 0 && (
                            <span
                              className={
                                placedSigners === activeSignerTotal
                                  ? 'text-[var(--color-success)]'
                                  : 'text-[var(--color-warning)]'
                              }
                            >
                              {placedSigners}/{activeSignerTotal} {t.review.placedCountLabel}
                            </span>
                          )}
                          {activeStampTotal > 0 && (
                            <span
                              className={
                                placedStamps === activeStampTotal
                                  ? 'text-[var(--color-primary)]'
                                  : 'text-[var(--color-warning)]'
                              }
                            >
                              {placedStamps}/{activeStampTotal} {t.review.stampsCountLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Center Interactive PDF Preview */}
        <div className="space-y-3 lg:col-span-6">
          {activeDoc &&
          activeFile &&
          activeFile.bytes.byteLength > 0 &&
          !activeDoc.integrity.isEncrypted &&
          activeDoc.integrity.errorCode !== 'INVALID_PDF' ? (
            <>
              <PDFViewerToolbar
                pageIndex={pageIndex}
                pageCount={activeDoc.pageCount}
                zoom={zoom}
                compareOriginal={compareOriginal}
                viewMode={placedPages.length > 1 ? viewMode : 'SINGLE'}
                placedPageCount={placedPages.length}
                placedPagesLabel={t.review.placedPagesView}
                singlePageLabel={t.review.singlePageView}
                onViewModeChange={setViewMode}
                pageLabel={t.review.pageNav}
                ofPagesLabel={t.review.ofPages}
                zoomInLabel={t.review.zoomIn}
                zoomOutLabel={t.review.zoomOut}
                compareOriginalLabel={t.review.compareOriginal}
                compareStampedLabel={t.review.compareStamped}
                onPrevPage={() => setPageIndex((p) => Math.max(0, p - 1))}
                onNextPage={() => setPageIndex((p) => Math.min(activeDoc.pageCount - 1, p + 1))}
                onZoomIn={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
                onZoomOut={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
                onToggleCompare={() => setCompareOriginal((v) => !v)}
              />

              <div
                ref={viewerScrollRef}
                onWheel={() => {
                  userScrolledRef.current = true;
                }}
                onTouchMove={() => {
                  userScrolledRef.current = true;
                }}
                className="max-h-[58vh] overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] p-2 text-center sm:p-4 lg:max-h-[72vh]"
              >
                <div ref={viewerContentRef}>
                  {viewMode === 'PLACED' && placedPages.length > 1 ? (
                    <div className="space-y-2.5">
                      {placedPages.map((pIdx) => (
                        <div
                          key={pIdx}
                          ref={(el) => {
                            pageWrapperRefs.current[pIdx] = el;
                          }}
                          data-review-page={pIdx + 1}
                          className="space-y-1.5"
                        >
                          <div className="flex items-center justify-center">
                            <span className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)] shadow-[var(--shadow-xs)]">
                              {pIdx + 1}
                              {t.review.pageTagSuffix}
                            </span>
                          </div>
                          <PdfPageCanvas
                            pdfBytes={activeFile.bytes}
                            sharedPdfDoc={sharedPdfDoc}
                            pageIndex={pIdx}
                            zoom={zoom}
                            signers={canvasSigners}
                            stamps={canvasStamps}
                            activeTool={activeTool}
                            compareOriginal={compareOriginal}
                            onSelectTool={setActiveTool}
                            onMoveItem={handleMoveItem}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <PdfPageCanvas
                      pdfBytes={activeFile.bytes}
                      sharedPdfDoc={sharedPdfDoc}
                      pageIndex={pageIndex}
                      zoom={zoom}
                      signers={canvasSigners}
                      stamps={canvasStamps}
                      activeTool={activeTool}
                      compareOriginal={compareOriginal}
                      onSelectTool={setActiveTool}
                      onMoveItem={handleMoveItem}
                    />
                  )}
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)]">{t.review.clickPageHint}</p>
            </>
          ) : (
            <Card className="flex h-96 items-center justify-center p-6 text-sm text-[var(--color-text-muted)]">
              {activeDoc?.errors.length
                ? activeDoc.errors.map((e) => t.issues[e as keyof typeof t.issues] ?? e).join(', ')
                : isRunning
                  ? `${t.statusLabels.ANALYZING}...`
                  : t.review.selectDocHint}
            </Card>
          )}
        </div>

        {/* Right Inspector & Actions */}
        <div className="lg:col-span-3">
          {activeDoc ? (
            <ReviewPanel
              doc={activeDoc}
              signers={signers}
              stamps={stamps}
              activeTool={activeTool}
              onActiveToolChange={(tool, jumpToPage) => {
                setActiveTool(tool);
                if (jumpToPage !== undefined && jumpToPage >= 0) {
                  const clamped = Math.min(Math.max(0, activeDoc.pageCount - 1), jumpToPage);
                  if (viewMode === 'PLACED' && placedPages.includes(clamped)) {
                    pageWrapperRefs.current[clamped]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    });
                  } else {
                    setPageIndex(clamped);
                  }
                }
              }}
              onToggleSkipSigner={handleToggleSkipSigner}
              onToggleSkipStamp={handleToggleSkipStamp}
              onStampOwnerChange={handleStampOwnerChange}
              onCryptoAckChange={(ack) =>
                onUpdateDocument(activeDoc.documentId, { cryptoSignatureAcknowledged: ack })
              }
              onApprove={() =>
                onUpdateDocument(activeDoc.documentId, { manualApprovalConfirmed: true })
              }
              onApplyToAll={() => setApplyAllOpen(true)}
              onExclude={() =>
                onUpdateDocument(activeDoc.documentId, {
                  manualApprovalConfirmed: false,
                  forceBlocked: true,
                })
              }
              t={t}
            />
          ) : (
            <EmptyState title={t.review.selectDocHint} />
          )}
        </div>
      </div>

      {activeDoc && (
        <AlertDialog
          open={applyAllOpen}
          onOpenChange={setApplyAllOpen}
          title={t.review.applyToAllConfirmTitle}
          description={t.review.applyToAllConfirmBody}
          cancelLabel={t.review.confirmCancel}
          confirmLabel={t.review.confirmYes}
          onConfirm={() => onApplyLayoutToAll(activeDoc.documentId)}
        />
      )}
    </section>
  );
};
