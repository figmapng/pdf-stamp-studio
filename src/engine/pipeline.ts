import type {
  DetectionThresholds,
  DocumentResult,
  DocumentSignatureEntry,
  DocumentStampEntry,
  OcrConfig,
  PageAnalysis,
  PdfIntegrityInfo,
  PersonProfile,
  Placement,
  PngAsset,
  ResolvedStampOwner,
  SignatureAnchor,
  SignerConfig,
  StampConfig,
  StampPolicy,
} from '../types';
import {
  DEFAULT_THRESHOLDS,
  resolveMultiSignatureAnchors,
  resolveSignatureAnchors,
} from './anchor-detection';
import {
  evaluateDocumentConfidenceAndStatus,
  evaluateMultiDocumentConfidenceAndStatus,
} from './confidence';
import { preprocessScannedRgbaForOcr } from './image-processing';
import {
  detectHorizontalLinesFromRgba,
  detectHorizontalLinesWithOpenCV,
  scoreAndClassifyLineCandidates,
  type OpenCvLike,
} from './line-detection';
import type { OcrProvider } from './ocr';
import {
  analyzeDigitalPage,
  classifyDocument,
  getPageGeometriesFromPdfLib,
  inspectPdfIntegrity,
  loadPdfJs,
  type PdfJsPageProxy,
} from './pdf-parser';
import {
  DEFAULT_STAMP_POLICY,
  resolveMultiStampPlacements,
  resolveStampPolicy,
} from './stamp-policy';

export interface PageRasterizer {
  renderPageToRgba: (
    page: PdfJsPageProxy,
    scale: number,
  ) => Promise<{ rgba: Uint8ClampedArray; width: number; height: number }>;
}

/**
 * Default browser/worker rasterizer using OffscreenCanvas (or HTMLCanvasElement fallback).
 */
export const browserPageRasterizer: PageRasterizer = {
  async renderPageToRgba(page, scale) {
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create 2D context on OffscreenCanvas.');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imgData = ctx.getImageData(0, 0, width, height);
      return { rgba: imgData.data, width, height };
    }

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create 2D context on canvas.');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imgData = ctx.getImageData(0, 0, width, height);
      return { rgba: imgData.data, width, height };
    }

    throw new Error('No Canvas implementation available in this runtime for scanned page rendering.');
  },
};

export interface AnalyzeDocumentOptions {
  documentId: string;
  fileName: string;
  bytes: Uint8Array;
  signers?: SignerConfig[];
  stamps?: StampConfig[];
  profileA?: PersonProfile;
  profileB?: PersonProfile;
  assets?: {
    signatureA: PngAsset | null;
    signatureB: PngAsset | null;
    stamp: PngAsset | null;
  };
  stampPolicy?: StampPolicy;
  thresholds?: DetectionThresholds;
  ocrConfig?: OcrConfig;
  ocrProvider?: OcrProvider | null;
  openCv?: OpenCvLike | null;
  rasterizer?: PageRasterizer | null;
  disablePdfJsWorker?: boolean;
  onPageProgress?: (pagesAnalyzed: number, pagesTotal: number) => void;
  signal?: AbortSignal;
}

/**
 * Analyzes a single PDF end-to-end: integrity check -> per-page digital extraction
 * -> scanned/mixed OCR & CV line detection -> anchor resolution -> stamp policy -> confidence evaluation.
 */
export async function analyzePdfDocument(options: AnalyzeDocumentOptions): Promise<DocumentResult> {
  const {
    documentId,
    fileName,
    bytes,
    signers,
    stamps = [],
    profileA,
    profileB,
    assets,
    stampPolicy = DEFAULT_STAMP_POLICY,
    thresholds = DEFAULT_THRESHOLDS,
    ocrConfig,
    ocrProvider = null,
    openCv = null,
    rasterizer = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined'
      ? browserPageRasterizer
      : null,
    disablePdfJsWorker = false,
    onPageProgress,
    signal,
  } = options;

  const isMultiMode = signers !== undefined;

  const inspection = await inspectPdfIntegrity(bytes);
  if (!inspection.isValid || inspection.integrity.isEncrypted) {
    if (isMultiMode) {
      const signerEntries: DocumentSignatureEntry[] = (signers ?? []).map((s, idx) => ({
        signerId: s.id,
        label: s.profile.label || s.profile.fullName.trim() || `${idx + 1}`,
        anchor: null,
      }));
      const stampEntries: DocumentStampEntry[] = stamps.map((st) => ({
        stampId: st.id,
        label: st.label,
        owner: st.policy.owner === 'MANUAL_PER_DOCUMENT' ? 'MANUAL' : st.policy.owner,
        placement: null,
      }));
      const blockedMulti = evaluateMultiDocumentConfidenceAndStatus({
        fileName,
        integrity: inspection.integrity,
        signers: signers ?? [],
        stamps,
        signerEntries,
        stampResult: {
          entries: stampEntries,
          requiresManualConfirmation: true,
          warnings: [],
          errors: [],
        },
        hasConflict: false,
        manualApprovalConfirmed: false,
        cryptoSignatureAcknowledged: false,
        anchorErrors: [],
        anchorWarnings: [],
      });

      return {
        documentId,
        fileName,
        pageCount: inspection.pageCount ?? 0,
        classification: 'DIGITAL_PDF',
        pageTypes: [],
        pages: [],
        integrity: inspection.integrity,
        signatures: { personA: null, personB: null },
        stamp: { owner: 'MANUAL', placement: null, count: 0 },
        signerResults: signerEntries,
        stampResults: stampEntries,
        status: blockedMulti.status,
        manualApprovalConfirmed: false,
        cryptoSignatureAcknowledged: false,
        errors: blockedMulti.errors,
        warnings: blockedMulti.warnings,
        issues: blockedMulti.issues,
      };
    }

    const blockedEval = evaluateDocumentConfidenceAndStatus({
      fileName,
      integrity: inspection.integrity,
      profileA: profileA!,
      profileB: profileB!,
      personA: null,
      personB: null,
      hasConflict: false,
      stampResult: {
        owner: 'MANUAL',
        placement: null,
        count: 0,
        requiresManualConfirmation: true,
        warnings: [],
        errors: [],
      },
      manualApprovalConfirmed: false,
      cryptoSignatureAcknowledged: false,
      hasAllPngAssets: Boolean(assets?.signatureA && assets?.signatureB && assets?.stamp),
      anchorErrors: [],
      anchorWarnings: [],
    });

    return {
      documentId,
      fileName,
      pageCount: inspection.pageCount ?? 0,
      classification: 'DIGITAL_PDF',
      pageTypes: [],
      pages: [],
      integrity: inspection.integrity,
      signatures: { personA: null, personB: null },
      stamp: { owner: 'MANUAL', placement: null, count: 0 },
      status: blockedEval.status,
      manualApprovalConfirmed: false,
      cryptoSignatureAcknowledged: false,
      errors: blockedEval.errors,
      warnings: blockedEval.warnings,
      issues: blockedEval.issues,
    };
  }

  const geometries = await getPageGeometriesFromPdfLib(bytes);
  const pdfJs = await loadPdfJs({ disableWorker: disablePdfJsWorker });
  const loadingTask = pdfJs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: disablePdfJsWorker,
    cMapUrl: '/wasm/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/wasm/pdfjs/standard_fonts/',
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const pages: PageAnalysis[] = [];

  try {
    const total = pdfDoc.numPages;
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      if (signal?.aborted) {
        throw new Error('CANCELLED');
      }

      const geom = geometries[pageIndex];
      const { pageAnalysis } = await analyzeDigitalPage(pdfJs, pdfDoc, pageIndex, geom);

      const needsVisionOrOcr =
        pageAnalysis.pageType === 'SCANNED' ||
        (pageAnalysis.pageType === 'MIXED' && pageAnalysis.extractedText.length < 3);

      if (needsVisionOrOcr && rasterizer) {
        const renderScale = ocrConfig?.renderScale ?? 2.0;
        const page = await pdfDoc.getPage(pageIndex + 1);
        try {
          const rendered = await rasterizer.renderPageToRgba(page, renderScale);
          const preprocessed = preprocessScannedRgbaForOcr(
            rendered.rgba,
            rendered.width,
            rendered.height,
          );

          // 1. Computer vision horizontal line detection (OpenCV when available, else TS morphological)
          let visionLines = [];
          if (openCv && typeof ImageData !== 'undefined') {
            try {
              const imgData = new ImageData(
                new Uint8ClampedArray(rendered.rgba),
                rendered.width,
                rendered.height,
              );
              visionLines = detectHorizontalLinesWithOpenCV(openCv, imgData, renderScale);
              pageAnalysis.cvMethod = 'OPENCV';
            } catch {
              visionLines = detectHorizontalLinesFromRgba(
                rendered.rgba,
                rendered.width,
                rendered.height,
                renderScale,
              );
              pageAnalysis.cvMethod = 'FALLBACK_TS';
            }
          } else {
            visionLines = detectHorizontalLinesFromRgba(
              rendered.rgba,
              rendered.width,
              rendered.height,
              renderScale,
            );
            pageAnalysis.cvMethod = 'FALLBACK_TS';
          }

          // 2. OCR text extraction when OCR provider is supplied
          if (ocrProvider) {
            const ocrRes = await ocrProvider.recognizeRgba(
              preprocessed,
              rendered.width,
              rendered.height,
              pageIndex,
              renderScale,
            );
            pageAnalysis.ocrExecuted = true;
            if (ocrRes.textBlocks.length > 0) {
              pageAnalysis.extractedText = [
                ...pageAnalysis.extractedText,
                ...ocrRes.textBlocks,
              ];
            }
            pageAnalysis.warnings.push(...ocrRes.warnings);
          } else {
            pageAnalysis.warnings.push('OCR provider unavailable for scanned page; manual review required.');
          }

          pageAnalysis.candidateLines = scoreAndClassifyLineCandidates(
            [...pageAnalysis.candidateLines, ...visionLines],
            pageAnalysis.extractedText,
            pageAnalysis.width,
            pageAnalysis.height,
          );
        } finally {
          page.cleanup();
        }
      }

      pages.push(pageAnalysis);
      onPageProgress?.(pageIndex + 1, total);
    }
  } finally {
    await pdfDoc.cleanup().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }

  if (isMultiMode) {
    return buildMultiDocumentResultFromPages({
      documentId,
      fileName,
      pages,
      integrity: inspection.integrity,
      signers: signers ?? [],
      stamps,
      thresholds,
    });
  }

  return buildDocumentResultFromPages({
    documentId,
    fileName,
    pages,
    integrity: inspection.integrity,
    profileA: profileA!,
    profileB: profileB!,
    assets: assets!,
    stampPolicy,
    thresholds,
  });
}

export function buildMultiDocumentResultFromPages(params: {
  documentId: string;
  fileName: string;
  pages: PageAnalysis[];
  integrity: PdfIntegrityInfo;
  signers: SignerConfig[];
  stamps: StampConfig[];
  thresholds?: DetectionThresholds;
}): DocumentResult {
  const {
    documentId,
    fileName,
    pages,
    integrity,
    signers,
    stamps,
    thresholds = DEFAULT_THRESHOLDS,
  } = params;

  const profiles = signers.map((s) => s.profile);
  const assetsBySignerId: Record<string, PngAsset | null> = {};
  for (const s of signers) {
    assetsBySignerId[s.id] = s.asset;
  }

  const anchorRes = resolveMultiSignatureAnchors(profiles, assetsBySignerId, pages, thresholds);

  const signerEntries: DocumentSignatureEntry[] = signers.map((s, idx) => ({
    signerId: s.id,
    label: s.profile.label || s.profile.fullName.trim() || `${idx + 1}`,
    anchor: anchorRes.anchors[s.id] ?? null,
    skipped: false,
  }));

  const stampRes = resolveMultiStampPlacements({
    stamps,
    anchorsBySignerId: anchorRes.anchors,
    pages,
  });

  const evalRes = evaluateMultiDocumentConfidenceAndStatus({
    fileName,
    integrity,
    signers,
    stamps,
    signerEntries,
    stampResult: stampRes,
    hasConflict: anchorRes.hasConflict,
    manualApprovalConfirmed: false,
    cryptoSignatureAcknowledged: false,
    anchorErrors: anchorRes.errors,
    anchorWarnings: anchorRes.warnings,
  });

  const pageTypes = pages.map((p) => p.pageType);
  const firstStamp = stampRes.entries[0];

  return {
    documentId,
    fileName,
    pageCount: pages.length,
    classification: classifyDocument(pageTypes),
    pageTypes,
    pages,
    integrity,
    signatures: {
      personA: signerEntries[0]?.anchor ?? null,
      personB: signerEntries[1]?.anchor ?? null,
    },
    stamp: {
      owner: firstStamp?.owner ?? 'MANUAL',
      placement: firstStamp?.placement ?? null,
      count: stampRes.entries.filter((s) => !s.skipped && s.placement).length,
    },
    signerResults: signerEntries,
    stampResults: stampRes.entries,
    status: evalRes.status,
    manualApprovalConfirmed: false,
    cryptoSignatureAcknowledged: false,
    errors: evalRes.errors,
    warnings: evalRes.warnings,
    issues: evalRes.issues,
  };
}

export function revalidateMultiDocumentResult(params: {
  doc: DocumentResult;
  signers: SignerConfig[];
  stamps: StampConfig[];
  nextSignerEntries?: DocumentSignatureEntry[];
  nextStampEntries?: DocumentStampEntry[];
  manualApprovalConfirmed?: boolean;
  cryptoSignatureAcknowledged?: boolean;
}): DocumentResult {
  const {
    doc,
    signers,
    stamps,
    nextSignerEntries = doc.signerResults ?? [],
    nextStampEntries = doc.stampResults ?? [],
    manualApprovalConfirmed = doc.manualApprovalConfirmed,
    cryptoSignatureAcknowledged = doc.cryptoSignatureAcknowledged,
  } = params;

  const anchorsBySignerId: Record<string, SignatureAnchor | null> = {};
  const skippedSignerIds = new Set<string>();
  for (const entry of nextSignerEntries) {
    anchorsBySignerId[entry.signerId] = entry.anchor;
    if (entry.skipped) skippedSignerIds.add(entry.signerId);
  }

  const existingStampEntries: Record<string, DocumentStampEntry> = {};
  for (const sEntry of nextStampEntries) {
    existingStampEntries[sEntry.stampId] = sEntry;
  }

  const stampRes = resolveMultiStampPlacements({
    stamps,
    anchorsBySignerId,
    skippedSignerIds,
    existingStampEntries,
    pages: doc.pages,
    manualApprovalConfirmed,
  });

  const evalRes = evaluateMultiDocumentConfidenceAndStatus({
    fileName: doc.fileName,
    integrity: doc.integrity,
    signers,
    stamps,
    signerEntries: nextSignerEntries,
    stampResult: stampRes,
    hasConflict: false,
    manualApprovalConfirmed,
    cryptoSignatureAcknowledged,
    anchorErrors: [],
    anchorWarnings: [],
  });

  const firstStamp = stampRes.entries[0];

  return {
    ...doc,
    signatures: {
      personA: nextSignerEntries[0]?.skipped ? null : (nextSignerEntries[0]?.anchor ?? null),
      personB: nextSignerEntries[1]?.skipped ? null : (nextSignerEntries[1]?.anchor ?? null),
    },
    stamp: {
      owner: firstStamp?.owner ?? 'MANUAL',
      placement: firstStamp?.placement ?? null,
      count: stampRes.entries.filter((s) => !s.skipped && s.placement).length,
      isManuallyAdjusted: stampRes.entries.some((s) => s.isManuallyAdjusted),
    },
    signerResults: nextSignerEntries,
    stampResults: stampRes.entries,
    status: evalRes.status,
    manualApprovalConfirmed,
    cryptoSignatureAcknowledged,
    errors: evalRes.errors,
    warnings: evalRes.warnings,
    issues: evalRes.issues,
  };
}

export function buildDocumentResultFromPages(params: {
  documentId: string;
  fileName: string;
  pages: PageAnalysis[];
  integrity: PdfIntegrityInfo;
  profileA: PersonProfile;
  profileB: PersonProfile;
  assets: {
    signatureA: PngAsset | null;
    signatureB: PngAsset | null;
    stamp: PngAsset | null;
  };
  stampPolicy: StampPolicy;
  thresholds?: DetectionThresholds;
}): DocumentResult {
  const {
    documentId,
    fileName,
    pages,
    integrity,
    profileA,
    profileB,
    assets,
    stampPolicy,
    thresholds = DEFAULT_THRESHOLDS,
  } = params;

  const anchorRes = resolveSignatureAnchors(
    profileA,
    profileB,
    pages,
    assets.signatureA,
    assets.signatureB,
    thresholds,
  );

  const stampRes = resolveStampPolicy({
    policy: stampPolicy,
    personA: anchorRes.personA,
    personB: anchorRes.personB,
    pages,
    stampAsset: assets.stamp,
  });

  const evalRes = evaluateDocumentConfidenceAndStatus({
    fileName,
    integrity,
    profileA,
    profileB,
    personA: anchorRes.personA,
    personB: anchorRes.personB,
    hasConflict: anchorRes.hasConflict,
    stampResult: stampRes,
    manualApprovalConfirmed: false,
    cryptoSignatureAcknowledged: false,
    hasAllPngAssets: Boolean(assets.signatureA && assets.signatureB && assets.stamp),
    anchorErrors: anchorRes.errors,
    anchorWarnings: anchorRes.warnings,
  });

  const pageTypes = pages.map((p) => p.pageType);

  return {
    documentId,
    fileName,
    pageCount: pages.length,
    classification: classifyDocument(pageTypes),
    pageTypes,
    pages,
    integrity,
    signatures: {
      personA: anchorRes.personA,
      personB: anchorRes.personB,
    },
    stamp: {
      owner: stampRes.owner,
      placement: stampRes.placement,
      count: stampRes.count,
    },
    status: evalRes.status,
    manualApprovalConfirmed: false,
    cryptoSignatureAcknowledged: false,
    errors: evalRes.errors,
    warnings: evalRes.warnings,
    issues: evalRes.issues,
  };
}

/**
 * Re-validates a DocumentResult after the user edits signatures, stamp owner,
 * stamp placement, or confirmation flags in Manual Review Center.
 */
export function revalidateDocumentResult(params: {
  doc: DocumentResult;
  profileA: PersonProfile;
  profileB: PersonProfile;
  assets: {
    signatureA: PngAsset | null;
    signatureB: PngAsset | null;
    stamp: PngAsset | null;
  };
  stampPolicy: StampPolicy;
  nextPersonA?: SignatureAnchor | null;
  nextPersonB?: SignatureAnchor | null;
  nextStampOwner?: ResolvedStampOwner;
  nextStampPlacement?: Placement | null;
  manualApprovalConfirmed?: boolean;
  cryptoSignatureAcknowledged?: boolean;
}): DocumentResult {
  const {
    doc,
    profileA,
    profileB,
    assets,
    stampPolicy,
    nextPersonA = doc.signatures.personA,
    nextPersonB = doc.signatures.personB,
    nextStampOwner = doc.stamp.owner,
    nextStampPlacement = doc.stamp.placement,
    manualApprovalConfirmed = doc.manualApprovalConfirmed,
    cryptoSignatureAcknowledged = doc.cryptoSignatureAcknowledged,
  } = params;

  const stampRes = resolveStampPolicy({
    policy: stampPolicy,
    personA: nextPersonA,
    personB: nextPersonB,
    pages: doc.pages,
    stampAsset: assets.stamp,
    manualOwnerOverride: nextStampOwner,
    manualPlacementOverride: nextStampPlacement,
    manualApprovalConfirmed,
  });

  const evalRes = evaluateDocumentConfidenceAndStatus({
    fileName: doc.fileName,
    integrity: doc.integrity,
    profileA,
    profileB,
    personA: nextPersonA,
    personB: nextPersonB,
    hasConflict: false,
    stampResult: stampRes,
    manualApprovalConfirmed,
    cryptoSignatureAcknowledged,
    hasAllPngAssets: Boolean(assets.signatureA && assets.signatureB && assets.stamp),
    anchorErrors: [],
    anchorWarnings: [],
  });

  return {
    ...doc,
    signatures: {
      personA: nextPersonA,
      personB: nextPersonB,
    },
    stamp: {
      owner: stampRes.owner,
      placement: stampRes.placement,
      count: stampRes.count,
      isManuallyAdjusted: doc.stamp.isManuallyAdjusted,
    },
    status: evalRes.status,
    manualApprovalConfirmed,
    cryptoSignatureAcknowledged,
    errors: evalRes.errors,
    warnings: evalRes.warnings,
    issues: evalRes.issues,
  };
}
