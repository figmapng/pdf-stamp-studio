import type {
  DetectionThresholds,
  DocumentResult,
  OcrConfig,
  PersonProfile,
  PngAsset,
  ProcessingJob,
  SignerConfig,
  StampConfig,
  StampPolicy,
  UploadedPdfFile,
} from '../types';
import { createTesseractOcrProvider, type OcrProvider } from '../engine/ocr';
import { analyzePdfDocument } from '../engine/pipeline';

export interface BatchAnalysisCallbacks {
  onJobUpdate: (job: ProcessingJob) => void;
  onDocumentResult: (result: DocumentResult) => void;
}

export interface BatchRunHandle {
  cancel: () => void;
  promise: Promise<void>;
}

/**
 * Bounded-concurrency queue for analyzing uploaded PDFs without blocking the UI thread.
 * PDF.js offloads parsing/rendering to its own Web Worker (`/wasm/pdfjs/pdf.worker.min.mjs`),
 * and Tesseract.js offloads OCR to its own Web Worker (`/wasm/tesseract/worker.min.js`).
 */
export function startBatchAnalysis(params: {
  files: UploadedPdfFile[];
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
  thresholds: DetectionThresholds;
  ocrConfig: OcrConfig;
  enableOpenCv: boolean;
  maxConcurrency?: number;
  callbacks: BatchAnalysisCallbacks;
}): BatchRunHandle {
  const {
    files,
    signers,
    stamps,
    profileA,
    profileB,
    assets,
    stampPolicy,
    thresholds,
    ocrConfig,
    maxConcurrency = 2,
    callbacks,
  } = params;

  let cancelled = false;
  const abortController = new AbortController();
  let sharedOcrProvider: OcrProvider | null = null;

  const lazyOcrProvider: OcrProvider = {
    async recognizeRgba(rgba, width, height, pageIndex, renderScale) {
      if (!sharedOcrProvider) {
        try {
          sharedOcrProvider = await createTesseractOcrProvider(ocrConfig);
        } catch (err) {
          return {
            textBlocks: [],
            warnings: [
              `OCR initialization skipped: ${err instanceof Error ? err.message : String(err)}`,
            ],
          };
        }
      }
      return sharedOcrProvider.recognizeRgba(rgba, width, height, pageIndex, renderScale);
    },
    async terminate() {
      if (sharedOcrProvider) {
        await sharedOcrProvider.terminate().catch(() => undefined);
        sharedOcrProvider = null;
      }
    },
  };

  const cancel = () => {
    cancelled = true;
    abortController.abort();
    void lazyOcrProvider.terminate();
  };

  const runSingle = async (file: UploadedPdfFile, job: ProcessingJob) => {
    if (cancelled) {
      callbacks.onJobUpdate({ ...job, status: 'FAILED', errors: ['CANCELLED'] });
      return;
    }

    try {
      const result = await analyzePdfDocument({
        documentId: file.id,
        fileName: file.fileName,
        bytes: file.bytes,
        signers,
        stamps,
        profileA,
        profileB,
        assets,
        stampPolicy,
        thresholds,
        ocrConfig,
        ocrProvider: lazyOcrProvider,
        signal: abortController.signal,
        onPageProgress(pagesAnalyzed, pagesTotal) {
          callbacks.onJobUpdate({
            ...job,
            status: 'ANALYZING',
            pagesAnalyzed,
            pagesTotal,
          });
        },
      });

      const detectedSignatures = result.signerResults
        ? result.signerResults.filter((s) => !s.skipped && Boolean(s.anchor)).length
        : (result.signatures.personA ? 1 : 0) + (result.signatures.personB ? 1 : 0);

      callbacks.onDocumentResult(result);
      callbacks.onJobUpdate({
        ...job,
        status:
          result.status === 'AUTO_READY'
            ? 'READY_TO_EXPORT'
            : result.status === 'BLOCKED'
              ? 'BLOCKED'
              : 'REVIEW_REQUIRED',
        pagesTotal: result.pageCount,
        pagesAnalyzed: result.pageCount,
        signaturesDetected: detectedSignatures,
        stampCount: result.stamp.count,
        errors: result.errors,
        warnings: result.warnings,
      });
    } catch (err) {
      callbacks.onJobUpdate({
        ...job,
        status: 'FAILED',
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  };

  const promise = (async () => {
    const queue = [...files];
    const workerCount = Math.min(maxConcurrency, Math.max(1, queue.length));

    const runners = Array.from({ length: workerCount }, async () => {
      while (queue.length > 0 && !cancelled) {
        const file = queue.shift();
        if (!file) break;
        const initialJob: ProcessingJob = {
          id: `job-${file.id}`,
          fileName: file.fileName,
          status: 'ANALYZING',
          pagesTotal: file.pageCount ?? 0,
          pagesAnalyzed: 0,
          signaturesDetected: 0,
          stampCount: 0,
          errors: [],
          warnings: [],
        };
        callbacks.onJobUpdate(initialJob);
        await runSingle(file, initialJob);
      }
    });

    await Promise.all(runners);
    await lazyOcrProvider.terminate();
  })();

  return { cancel, promise };
}
