import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  FolderArchive,
  Layers,
  Lock,
  MoreHorizontal,
  Play,
  Settings,
  Stamp,
} from 'lucide-react';
import type {
  AppLanguage,
  DetectionThresholds,
  DocumentResult,
  DocumentSignatureEntry,
  DocumentStampEntry,
  OcrConfig,
  Placement,
  ProcessingJob,
  SignatureAnchor,
  SignerConfig,
  StampConfig,
  UploadedPdfFile,
  PngAsset,
} from '../types';
import { getTranslations } from '../i18n';
import { inspectPngBytes } from '../engine/image-processing';
import { DEFAULT_THRESHOLDS } from '../engine/anchor-detection';
import { createDefaultStampPolicy, DEFAULT_STAMP_POLICY } from '../engine/stamp-policy';
import { revalidateMultiDocumentResult } from '../engine/pipeline';
import { canBatchApproveDocument } from '../engine/validation';
import type { StampedPdfOutput } from '../engine/placement/pdfExporter';
import { startBatchAnalysis, type BatchRunHandle } from '../workers/batchRunner';
import {
  clearPreferences,
  hydrateSignerConfig,
  hydrateStampConfig,
  loadPreferences,
  savePreferences,
  serializeSignerConfig,
  serializeStampConfig,
} from '../store/preferencesDb';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ToastProvider,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui';
import { PdfUploader } from '../components/uploader/PdfUploader';
import { ProfileSetupPanel } from '../components/profile-setup/ProfileSetupPanel';
import {
  ManualReviewCenter,
  type DocumentUpdatePatch,
} from '../components/review-center/ManualReviewCenter';
import { ExportPanel } from '../components/export-panel/ExportPanel';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { DesignSystemShowcase } from '../components/showcase/DesignSystemShowcase';
import { ExcelInstallModal } from '../components/modals/ExcelInstallModal';

type ActiveTab =
  | 'upload'
  | 'profiles'
  | 'review'
  | 'export'
  | 'settings'
  | 'design-system';

const DEFAULT_OCR_CONFIG: OcrConfig = {
  languages: ['kaz', 'rus', 'eng'],
  renderScale: 2.0,
  langPath: '/tessdata',
  allowCdnFallback: false,
};

function makeSignerConfig(id: string, fullName = '', roleNames: string[] = []): SignerConfig {
  return {
    id,
    profile: {
      id,
      fullName,
      nameVariants: [],
      roleNames,
      signatureAssetId: null,
      enabled: true,
    },
    asset: null,
  };
}

async function loadDefaultEcologyProfiles(): Promise<{ signers: SignerConfig[]; stamps: StampConfig[] }> {
  const loadAsset = async (url: string, fileName: string, kind: 'SIGNATURE' | 'STAMP'): Promise<PngAsset | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const inspection = await inspectPngBytes(bytes);
      if (!inspection.isValid) return null;
      const blob = new Blob([bytes], { type: 'image/png' });
      return {
        id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind,
        fileName,
        fileSize: bytes.byteLength,
        bytes,
        objectUrl: URL.createObjectURL(blob),
        naturalWidth: inspection.width,
        naturalHeight: inspection.height,
        opaqueBounds: inspection.opaqueBounds,
        transparentPaddingRatio: inspection.transparentPaddingRatio,
        hasAlphaTransparency: inspection.hasAlphaTransparency,
      };
    } catch {
      return null;
    }
  };

  const [sig1Asset, sig2Asset, stampAsset] = await Promise.all([
    loadAsset('/demo-assets/sig_zatybek.png', 'sig_zatybek.png', 'SIGNATURE'),
    loadAsset('/demo-assets/sig_satybaldina.png', 'sig_satybaldina.png', 'SIGNATURE'),
    loadAsset('/demo-assets/stamp.png', 'stamp.png', 'STAMP'),
  ]);

  const signers: SignerConfig[] = [
    {
      id: 'SIGNER_1',
      profile: {
        id: 'SIGNER_1',
        label: 'Инженер-химик',
        fullName: 'Затыбек А. А.',
        nameVariants: ['Затыбек', 'Инженер-химик', 'Затыбек А.А.'],
        roleNames: ['Инженер-химик'],
        signatureAssetId: sig1Asset?.id ?? null,
        enabled: true,
      },
      asset: sig1Asset,
    },
    {
      id: 'SIGNER_2',
      profile: {
        id: 'SIGNER_2',
        label: 'Заведующий лабораторией',
        fullName: 'Сатыбалдина З. С.',
        nameVariants: ['Сатыбалдина', 'Заведующий лабораторией', 'Сатыбалдина З.С.'],
        roleNames: ['Заведующий лабораторией'],
        signatureAssetId: sig2Asset?.id ?? null,
        enabled: true,
      },
      asset: sig2Asset,
    },
  ];

  const stamps: StampConfig[] = [
    {
      id: 'STAMP_1',
      label: 'Печать ТОО Ecology Expert',
      policy: createDefaultStampPolicy('SIGNER_2'),
      asset: stampAsset,
    },
  ];

  return { signers, stamps };
}

export const App: React.FC = () => {
  const [language, setLanguage] = useState<AppLanguage>('ru');
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  const [files, setFiles] = useState<UploadedPdfFile[]>([]);
  const [signers, setSigners] = useState<SignerConfig[]>([]);
  const [stamps, setStamps] = useState<StampConfig[]>([]);

  const [thresholds, setThresholds] = useState<DetectionThresholds>(DEFAULT_THRESHOLDS);
  const [ocrConfig, setOcrConfig] = useState<OcrConfig>(DEFAULT_OCR_CONFIG);
  const [enableOpenCv, setEnableOpenCv] = useState(false);
  const [rememberProfiles, setRememberProfiles] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [jobs, setJobs] = useState<Record<string, ProcessingJob>>({});
  const [results, setResults] = useState<Record<string, DocumentResult>>({});
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');

  const nextIdSeqRef = useRef(1);
  const batchHandleRef = useRef<BatchRunHandle | null>(null);
  const t = getTranslations(language);

  // Keep <html lang> and <title> synchronized
  useEffect(() => {
    document.documentElement.lang = language;
    const tabTitle = activeTab === 'design-system' ? 'Design System' : t.nav[activeTab];
    document.title = `${t.app.title} — ${tabTitle}`;
  }, [language, activeTab, t]);

  // Load saved preferences (including persisted signatories, stamps & PNG images) from IndexedDB on mount
  useEffect(() => {
    let active = true;
    loadPreferences().then((saved) => {
      if (!active) return;
      if (saved) {
        setLanguage(saved.language);
        setThresholds(saved.thresholds);
        setOcrConfig(saved.ocrConfig);
        setEnableOpenCv(saved.enableOpenCv);
        setRememberProfiles(saved.rememberProfileTextsOptIn);
        if (saved.rememberProfileTextsOptIn) {
          let maxSeq = 0;
          const bumpSeq = (id: string) => {
            const m = id.match(/_(\d+)$/);
            if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
          };

          if (saved.savedSignerConfigs && saved.savedSignerConfigs.length > 0) {
            const hydratedSigners = saved.savedSignerConfigs.map(hydrateSignerConfig);
            hydratedSigners.forEach((s) => bumpSeq(s.id));
            setSigners(hydratedSigners);
          } else if (saved.savedSigners && saved.savedSigners.length > 0) {
            setSigners(
              saved.savedSigners.map((p) => {
                bumpSeq(p.id);
                return {
                  id: p.id,
                  profile: { ...p, signatureAssetId: null, enabled: true },
                  asset: null,
                };
              }),
            );
          }

          if (saved.savedStampConfigs && saved.savedStampConfigs.length > 0) {
            const hydratedStamps = saved.savedStampConfigs.map(hydrateStampConfig);
            hydratedStamps.forEach((st) => bumpSeq(st.id));
            setStamps(hydratedStamps);
          } else if (saved.savedStamps && saved.savedStamps.length > 0) {
            setStamps(
              saved.savedStamps.map((st) => {
                bumpSeq(st.id);
                return {
                  id: st.id,
                  label: st.label,
                  policy: st.policy,
                  asset: null,
                };
              }),
            );
          }

          if (maxSeq >= nextIdSeqRef.current) {
            nextIdSeqRef.current = maxSeq + 1;
          }
        }
      }

      // If no saved signers yet, initialize with default Ecology Expert profiles
      if (!saved || (!saved.savedSignerConfigs?.length && !saved.savedSigners?.length)) {
        loadDefaultEcologyProfiles().then((def) => {
          if (!active) return;
          if (def.signers.length > 0) {
            setSigners(def.signers);
            setStamps(def.stamps);
            nextIdSeqRef.current = 3;
          }
          setPrefsLoaded(true);
        });
        return;
      }

      setPrefsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist settings, signatories, stamps, and their PNGs locally in IndexedDB
  useEffect(() => {
    if (!prefsLoaded) return;
    void savePreferences({
      language,
      stampPolicy: stamps[0]?.policy ?? DEFAULT_STAMP_POLICY,
      thresholds,
      ocrConfig,
      enableOpenCv,
      rememberProfileTextsOptIn: rememberProfiles,
      savedSignerConfigs: rememberProfiles ? signers.map(serializeSignerConfig) : undefined,
      savedStampConfigs: rememberProfiles ? stamps.map(serializeStampConfig) : undefined,
    });
  }, [
    prefsLoaded,
    language,
    thresholds,
    ocrConfig,
    enableOpenCv,
    rememberProfiles,
    signers,
    stamps,
  ]);

  const latestUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls: string[] = [];
    for (const s of signers) {
      if (s.asset?.objectUrl) urls.push(s.asset.objectUrl);
    }
    for (const st of stamps) {
      if (st.asset?.objectUrl) urls.push(st.asset.objectUrl);
    }
    for (const job of Object.values(jobs)) {
      if (job.exportedUrl) urls.push(job.exportedUrl);
    }
    latestUrlsRef.current = urls;
  }, [signers, stamps, jobs]);

  // Clean up Object URLs on unmount
  useEffect(() => {
    return () => {
      for (const u of latestUrlsRef.current) {
        URL.revokeObjectURL(u);
      }
    };
  }, []);

  const handleAddSigner = () => {
    const seq = nextIdSeqRef.current++;
    const id = `SIGNER_${seq}`;
    setSigners((prev) => [...prev, makeSignerConfig(id)]);
  };

  const handleUpdateSigner = (id: string, next: SignerConfig) => {
    setSigners((prev) => prev.map((s) => (s.id === id ? next : s)));
  };

  const handleRemoveSigner = (id: string) => {
    setSigners((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.asset?.objectUrl) URL.revokeObjectURL(target.asset.objectUrl);
      return prev.filter((s) => s.id !== id);
    });
    setStamps((prev) =>
      prev.map((st) =>
        st.policy.owner === id
          ? {
              ...st,
              policy: {
                ...st.policy,
                owner: 'MANUAL_PER_DOCUMENT',
                placementMode: 'MANUAL',
              },
            }
          : st,
      ),
    );
  };

  const handleAddStamp = () => {
    const seq = nextIdSeqRef.current++;
    const id = `STAMP_${seq}`;
    const defaultOwner = signers[0]?.id ?? 'MANUAL_PER_DOCUMENT';
    setStamps((prev) => [
      ...prev,
      {
        id,
        label: '',
        policy: createDefaultStampPolicy(defaultOwner),
        asset: null,
      },
    ]);
  };

  const handleUpdateStamp = (id: string, next: StampConfig) => {
    setStamps((prev) => prev.map((st) => (st.id === id ? next : st)));
  };

  const handleRemoveStamp = (id: string) => {
    setStamps((prev) => {
      const target = prev.find((st) => st.id === id);
      if (target?.asset?.objectUrl) URL.revokeObjectURL(target.asset.objectUrl);
      return prev.filter((st) => st.id !== id);
    });
  };

  const handleReleaseAllExportUrls = () => {
    setJobs((prev) => {
      const next: Record<string, ProcessingJob> = {};
      for (const [id, job] of Object.entries(prev)) {
        if (job.exportedUrl) URL.revokeObjectURL(job.exportedUrl);
        next[id] = { ...job, exportedUrl: undefined, exportedBytes: undefined };
      }
      return next;
    });
    setResults((prev) => {
      const next: Record<string, DocumentResult> = {};
      for (const [id, doc] of Object.entries(prev)) {
        next[id] = doc.status === 'COMPLETED' ? { ...doc, status: 'AUTO_READY' } : doc;
      }
      return next;
    });
  };

  const handleAddFiles = (added: UploadedPdfFile[]) => {
    setFiles((prev) => [...prev, ...added]);
    setLiveStatus(`${added.length} PDF added`);
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setResults((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setJobs((prev) => {
      const copy = { ...prev };
      if (copy[id]?.exportedUrl) URL.revokeObjectURL(copy[id]!.exportedUrl!);
      delete copy[id];
      return copy;
    });
  };

  const handleClearFiles = () => {
    handleReleaseAllExportUrls();
    setFiles([]);
    setResults({});
    setJobs({});
    setSelectedReviewId(null);
  };

  const startAnalysis = () => {
    if (files.length === 0 || (signers.length === 0 && stamps.length === 0)) return;
    handleReleaseAllExportUrls();
    setResults({});
    setJobs({});
    setSelectedReviewId(files[0]?.id ?? null);
    setIsAnalyzing(true);
    setActiveTab('review');

    const handle = startBatchAnalysis({
      files,
      signers,
      stamps,
      thresholds,
      ocrConfig,
      enableOpenCv,
      callbacks: {
        onJobUpdate(job) {
          const docId = job.id.replace(/^job-/, '');
          setJobs((prev) => ({ ...prev, [docId]: job }));
        },
        onDocumentResult(result) {
          setResults((prev) => ({ ...prev, [result.documentId]: result }));
        },
      },
    });

    batchHandleRef.current = handle;
    void handle.promise.finally(() => {
      setIsAnalyzing(false);
      setLiveStatus('Analysis completed');
    });
  };

  const cancelAnalysis = () => {
    batchHandleRef.current?.cancel();
    setIsAnalyzing(false);
    setLiveStatus('Analysis cancelled');
  };

  const handleUpdateDocument = (documentId: string, patch: DocumentUpdatePatch) => {
    setResults((prev) => {
      const doc = prev[documentId];
      if (!doc) return prev;

      if (patch.forceBlocked) {
        return {
          ...prev,
          [documentId]: {
            ...doc,
            status: 'BLOCKED',
            manualApprovalConfirmed: false,
            errors: Array.from(new Set([...doc.errors, 'EXCLUDED_BY_USER'])),
          },
        };
      }

      const nextDoc = revalidateMultiDocumentResult({
        doc,
        signers,
        stamps,
        nextSignerEntries: patch.nextSignerEntries,
        nextStampEntries: patch.nextStampEntries,
        manualApprovalConfirmed: patch.manualApprovalConfirmed,
        cryptoSignatureAcknowledged: patch.cryptoSignatureAcknowledged,
      });

      return { ...prev, [documentId]: nextDoc };
    });
  };

  const handleApplyLayoutToAll = (sourceDocumentId: string) => {
    const source = results[sourceDocumentId];
    if (!source) return;

    const srcSignerMap = new Map(
      (source.signerResults ?? []).map((s) => [s.signerId, s]),
    );

    setResults((prev) => {
      const next: Record<string, DocumentResult> = { ...prev };
      for (const [id, doc] of Object.entries(prev)) {
        if (id === sourceDocumentId || doc.integrity.isEncrypted || doc.integrity.errorCode === 'INVALID_PDF') {
          continue;
        }
        const clampPage = (pIdx: number) => Math.max(0, Math.min(Math.max(0, doc.pageCount - 1), pIdx));

        const copyAnchorWithRelativeOffset = (
          srcAnchor: SignatureAnchor | null,
          dstAnchor: SignatureAnchor | null,
        ): SignatureAnchor | null => {
          if (!srcAnchor) return null;
          if (dstAnchor) {
            const dx = srcAnchor.placementBounds.x - srcAnchor.lineBounds.x;
            const dy = srcAnchor.placementBounds.y - srcAnchor.lineBounds.y;
            return {
              ...dstAnchor,
              placementBounds: {
                x: dstAnchor.lineBounds.x + dx,
                y: dstAnchor.lineBounds.y + dy,
                width: srcAnchor.placementBounds.width,
                height: srcAnchor.placementBounds.height,
              },
              status: 'AUTO_READY',
              isManuallyAdjusted: true,
            };
          }
          return {
            ...srcAnchor,
            pageIndex: clampPage(srcAnchor.pageIndex),
            status: 'AUTO_READY',
            isManuallyAdjusted: true,
          };
        };

        const dstSignerMap = new Map(
          (doc.signerResults ?? []).map((s) => [s.signerId, s]),
        );

        const nextSignerEntries: DocumentSignatureEntry[] = (source.signerResults ?? []).map(
          (srcEntry) => {
            if (srcEntry.skipped) {
              return { ...srcEntry, anchor: null, skipped: true };
            }
            const dstEntry = dstSignerMap.get(srcEntry.signerId);
            return {
              signerId: srcEntry.signerId,
              label: srcEntry.label,
              anchor: copyAnchorWithRelativeOffset(
                srcEntry.anchor,
                dstEntry?.anchor ?? null,
              ),
              skipped: false,
            };
          },
        );

        const nextSignerMap = new Map(
          nextSignerEntries.map((s) => [s.signerId, s]),
        );

        const nextStampEntries: DocumentStampEntry[] = (source.stampResults ?? []).map(
          (srcStamp) => {
            if (srcStamp.skipped) {
              return { ...srcStamp, placement: null, skipped: true, isManuallyAdjusted: true };
            }
            if (!srcStamp.placement) {
              return { ...srcStamp, placement: null, isManuallyAdjusted: false };
            }
            const srcOwnerAnchor =
              srcStamp.owner !== 'MANUAL' ? srcSignerMap.get(srcStamp.owner)?.anchor ?? null : null;
            const dstOwnerAnchor =
              srcStamp.owner !== 'MANUAL' ? nextSignerMap.get(srcStamp.owner)?.anchor ?? null : null;

            let copiedPlacement: Placement;
            if (srcOwnerAnchor && dstOwnerAnchor) {
              const stampDx = srcStamp.placement.bounds.x - srcOwnerAnchor.placementBounds.x;
              const stampDy = srcStamp.placement.bounds.y - srcOwnerAnchor.placementBounds.y;
              copiedPlacement = {
                pageIndex: dstOwnerAnchor.pageIndex,
                bounds: {
                  x: dstOwnerAnchor.placementBounds.x + stampDx,
                  y: dstOwnerAnchor.placementBounds.y + stampDy,
                  width: srcStamp.placement.bounds.width,
                  height: srcStamp.placement.bounds.height,
                },
                rotation: srcStamp.placement.rotation,
              };
            } else {
              copiedPlacement = {
                ...srcStamp.placement,
                pageIndex: clampPage(srcStamp.placement.pageIndex),
              };
            }

            return {
              ...srcStamp,
              placement: copiedPlacement,
              isManuallyAdjusted: true,
            };
          },
        );

        next[id] = revalidateMultiDocumentResult({
          doc,
          signers,
          stamps,
          nextSignerEntries,
          nextStampEntries,
          manualApprovalConfirmed:
            source.manualApprovalConfirmed &&
            (!doc.integrity.hasDigitalSignature || doc.cryptoSignatureAcknowledged),
        });
      }
      return next;
    });
    setLiveStatus('Layout applied to all eligible documents');
  };

  const handleApproveAll = () => {
    let approved = 0;
    setResults((prev) => {
      const next: Record<string, DocumentResult> = { ...prev };
      for (const [id, doc] of Object.entries(prev)) {
        if (!canBatchApproveDocument(doc)) continue;
        approved++;
        next[id] = revalidateMultiDocumentResult({
          doc,
          signers,
          stamps,
          manualApprovalConfirmed: true,
        });
      }
      return next;
    });
    if (approved > 0) {
      setLiveStatus(`Approved ${approved} documents`);
    }
  };

  const handleMarkCompleted = (documentId: string, output: StampedPdfOutput, objectUrl: string) => {
    setResults((prev) => {
      const doc = prev[documentId];
      if (!doc) return prev;
      return { ...prev, [documentId]: { ...doc, status: 'COMPLETED' } };
    });
    setJobs((prev) => {
      const existing = prev[documentId];
      if (existing?.exportedUrl) URL.revokeObjectURL(existing.exportedUrl);
      return {
        ...prev,
        [documentId]: {
          ...(existing ?? {
            id: `job-${documentId}`,
            fileName: output.fileName,
            pagesTotal: output.pageCount,
            pagesAnalyzed: output.pageCount,
            signaturesDetected: 2,
            stampCount: 1,
            errors: [],
            warnings: [],
          }),
          status: 'COMPLETED',
          exportedBytes: output.bytes,
          exportedUrl: objectUrl,
        },
      };
    });
  };

  const handleMarkFailed = (documentId: string, error: string) => {
    setJobs((prev) => {
      const existing = prev[documentId];
      return {
        ...prev,
        [documentId]: {
          ...(existing ?? {
            id: `job-${documentId}`,
            fileName: documentId,
            pagesTotal: 0,
            pagesAnalyzed: 0,
            signaturesDetected: 0,
            stampCount: 0,
            warnings: [],
          }),
          status: 'FAILED',
          errors: [error],
        },
      };
    });
  };

  const navTabs: Array<{ id: ActiveTab; label: string }> = [
    { id: 'upload', label: t.nav.upload },
    { id: 'profiles', label: t.nav.profiles },
    { id: 'review', label: t.nav.review },
    { id: 'export', label: t.nav.export },
  ];

  const containerWidth =
    activeTab === 'review' || activeTab === 'design-system'
      ? 'max-w-[1380px]'
      : activeTab === 'profiles'
        ? 'max-w-6xl'
        : 'max-w-5xl';
  const activeStepIndex = navTabs.findIndex((tab) => tab.id === activeTab);
  const hasValidPdf = files.some((f) => f.isValid);

  return (
    <ToastProvider>
      <TooltipProvider>
        <div className="min-h-screen flex flex-col overflow-x-clip bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
          <a href="#main-content" className="skip-link visually-hidden">
            {t.app.skipToContent}
          </a>

          <div aria-live="polite" className="visually-hidden">
            {liveStatus}
          </div>

          {/* Harmonized Header + Dedicated Horizontal Stepper */}
          <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/95 backdrop-blur-xs">
            <div className={`mx-auto flex h-13 w-full ${containerWidth} items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5`}>
              <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-secondary)] text-indigo-300">
                  <Stamp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h1 className="truncate text-sm font-bold tracking-tight text-[var(--color-text-primary)]">
                  {t.app.title}
                </h1>
              </div>

              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setExcelModalOpen(true)}
                  className="hidden sm:inline-flex h-8 items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2} />
                  {language === 'ru' ? '⚡ Кнопка в Excel' : '⚡ Excel батырмасы'}
                </Button>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="hidden h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-emerald-200 bg-[var(--color-success-subtle)] px-2.5 text-xs font-medium text-[var(--color-success)] transition-opacity hover:opacity-85 sm:inline-flex"
                    >
                      <Lock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {t.app.localOnlyBadge}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 space-y-1 text-xs">
                    <p className="font-semibold text-[var(--color-text-primary)]">{t.app.legalBannerTitle}</p>
                    <p className="text-[var(--color-text-secondary)]">{t.app.legalBannerBody}</p>
                  </PopoverContent>
                </Popover>

                <div
                  role="group"
                  aria-label={t.app.languageLabel}
                  className="inline-flex h-8 items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-0.5"
                >
                  {(['kk', 'ru'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      aria-pressed={language === lang}
                      onClick={() => setLanguage(lang)}
                      className={`inline-flex h-6.5 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] px-2.5 text-[11px] font-bold uppercase transition-colors ${
                        language === lang
                          ? 'bg-[var(--color-bg-surface)] text-[var(--color-primary)] shadow-[var(--shadow-xs)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      variant={activeTab === 'settings' ? 'primary' : 'ghost'}
                      size="sm"
                      aria-label={t.nav.settings}
                      icon={<Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                      onClick={() => setActiveTab('settings')}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{t.nav.settings}</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={t.app.moreOptions}
                      icon={<MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setExcelModalOpen(true)}>
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} aria-hidden="true" />
                      {language === 'ru' ? '⚡ Установить кнопку в Excel' : '⚡ Excel-ге батырма орнату'}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href="/download/Excel_Addin_Installer.zip"
                        download="Excel_Addin_Installer.zip"
                        className="flex w-full items-center gap-2 text-xs font-medium text-emerald-600"
                      >
                        <FolderArchive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        {language === 'ru' ? 'Установщик Excel (.zip, 300 КБ)' : 'Excel орнатқышы (.zip)'}
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href="/download/PdfStampSetup.exe"
                        download="PdfStampSetup.exe"
                        className="flex w-full items-center gap-2 text-xs font-medium text-[var(--color-primary)]"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        {language === 'ru' ? 'Программа для Windows (.exe)' : 'Windows бағдарламасы (.exe)'}
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setActiveTab('settings')}>
                      <Settings className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {t.nav.settings}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setActiveTab('design-system')}>
                      <Layers className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {t.nav.designSystem}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)]/70">
              <nav
                aria-label="Primary"
                className={`mx-auto flex w-full ${containerWidth} items-center gap-0.5 overflow-x-auto px-3 py-1.5 sm:gap-1 sm:px-5 sm:py-2`}
              >
                {navTabs.map((tab, idx) => {
                  const isCurrent = activeTab === tab.id;
                  const isCompleted = activeStepIndex > idx;
                  const isLocked = idx > 0 && !hasValidPdf;
                  const shortTitle = tab.label.replace(/^\d+\.\s*/, '');

                  return (
                    <React.Fragment key={tab.id}>
                      <button
                        type="button"
                        aria-label={tab.label}
                        aria-current={isCurrent ? 'step' : undefined}
                        disabled={isLocked}
                        onClick={() => setActiveTab(tab.id)}
                        className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-1 py-1 text-left transition-colors hover:bg-[var(--color-bg-surface)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent sm:gap-2 sm:px-1.5"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors sm:h-6 sm:w-6 sm:text-xs ${
                            isCurrent
                              ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-xs)]'
                              : isCompleted
                                ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                                : 'border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]'
                          }`}
                        >
                          {isCompleted ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} /> : idx + 1}
                        </span>
                        <span
                          className={`text-xs whitespace-nowrap transition-colors ${
                            isCurrent
                              ? 'font-bold text-[var(--color-primary)]'
                              : isCompleted
                                ? 'hidden font-semibold text-[var(--color-text-primary)] sm:inline'
                                : 'hidden font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] sm:inline'
                          }`}
                        >
                          {shortTitle}
                        </span>
                      </button>

                      {idx < navTabs.length - 1 && (
                        <div
                          aria-hidden="true"
                          className={`mx-0.5 h-px min-w-2 flex-1 transition-colors sm:mx-1 sm:min-w-4 ${
                            isCompleted ? 'bg-[var(--color-primary)]/40' : 'bg-[var(--color-border-default)]'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>
          </header>

          {/* Main Content */}
          <main id="main-content" tabIndex={-1} className={`mx-auto w-full ${containerWidth} flex-1 space-y-4 px-3 py-3 sm:px-5 sm:py-4`}>
          {activeTab === 'design-system' && <DesignSystemShowcase />}

          {activeTab === 'upload' && (
          <PdfUploader
            files={files}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            onClearFiles={handleClearFiles}
            t={t}
          />
        )}

        {activeTab === 'profiles' && (
          <ProfileSetupPanel
            signers={signers}
            stamps={stamps}
            rememberInBrowser={rememberProfiles}
            onRememberInBrowserChange={setRememberProfiles}
            onAddSigner={handleAddSigner}
            onUpdateSigner={handleUpdateSigner}
            onRemoveSigner={handleRemoveSigner}
            onAddStamp={handleAddStamp}
            onUpdateStamp={handleUpdateStamp}
            onRemoveStamp={handleRemoveStamp}
            t={t}
          />
        )}

        {activeTab === 'review' && (
          <ManualReviewCenter
            files={files}
            jobs={jobs}
            results={results}
            isRunning={isAnalyzing}
            selectedDocumentId={selectedReviewId}
            onSelectDocument={setSelectedReviewId}
            signers={signers}
            stamps={stamps}
            onUpdateDocument={handleUpdateDocument}
            onApplyLayoutToAll={handleApplyLayoutToAll}
            onApproveAll={handleApproveAll}
            onStartOrReanalyze={startAnalysis}
            onCancelAnalysis={cancelAnalysis}
            t={t}
          />
        )}

        {activeTab === 'export' && (
          <ExportPanel
            files={files}
            results={results}
            jobs={jobs}
            signers={signers}
            stamps={stamps}
            onMarkCompleted={handleMarkCompleted}
            onMarkFailed={handleMarkFailed}
            t={t}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            ocrConfig={ocrConfig}
            onOcrConfigChange={setOcrConfig}
            enableOpenCv={enableOpenCv}
            onEnableOpenCvChange={setEnableOpenCv}
            thresholds={thresholds}
            onThresholdsChange={setThresholds}
            rememberProfiles={rememberProfiles}
            onRememberProfilesChange={setRememberProfiles}
            onClearSavedPreferences={() => {
              setRememberProfiles(false);
              void clearPreferences();
              setLiveStatus('Saved preferences cleared');
            }}
            t={t}
          />
        )}
      </main>

      {(activeTab === 'upload' ||
        activeTab === 'profiles' ||
        activeTab === 'review' ||
        activeTab === 'export') && (
        <div className="sticky bottom-0 z-[var(--z-sticky)] mt-auto border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xs">
          <div className={`mx-auto flex h-14 w-full ${containerWidth} items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5`}>
            <div>
              {activeTab === 'profiles' && (
                <Button variant="outline" size="md" onClick={() => setActiveTab('upload')}>
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {t.profiles.prevStep}
                </Button>
              )}
              {activeTab === 'review' && (
                <Button variant="outline" size="md" onClick={() => setActiveTab('profiles')}>
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {t.profiles.prevStep}
                </Button>
              )}
              {activeTab === 'export' && (
                <Button variant="outline" size="md" onClick={() => setActiveTab('review')}>
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {t.profiles.prevStep}
                </Button>
              )}
            </div>

            <div>
              {activeTab === 'upload' && (
                <Button
                  size="md"
                  disabled={!hasValidPdf}
                  onClick={() => setActiveTab('profiles')}
                >
                  {t.upload.nextStep}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              )}
              {activeTab === 'profiles' && (
                <Button
                  size="md"
                  onClick={startAnalysis}
                  disabled={!hasValidPdf || (signers.length === 0 && stamps.length === 0)}
                >
                  <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {t.stamp.startAnalysisBtn}
                </Button>
              )}
              {activeTab === 'review' && (
                <Button
                  size="md"
                  onClick={() => setActiveTab('export')}
                  disabled={
                    !Object.values(results).some(
                      (r) =>
                        r.status === 'AUTO_READY' ||
                        r.status === 'COMPLETED' ||
                        r.manualApprovalConfirmed,
                    )
                  }
                >
                  {t.analyze.nextToExportBtn}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      <ExcelInstallModal
        open={excelModalOpen}
        onOpenChange={setExcelModalOpen}
        t={t}
        language={language}
      />
    </div>
    </TooltipProvider>
    </ToastProvider>
  );
};
