export type AppLanguage = 'kk' | 'ru';

export type PersonId = string;

export type PageType = 'DIGITAL' | 'SCANNED' | 'MIXED';

export type DocumentClassification = 'DIGITAL_PDF' | 'SCANNED_PDF' | 'MIXED_PDF';

export type DetectionMethod = 'DIGITAL_TEXT' | 'OCR' | 'VISION' | 'HYBRID';

export type AnchorStatus = 'AUTO_READY' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type DocumentResultStatus =
  | 'AUTO_READY'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED'
  | 'COMPLETED';

export type JobStatus =
  | 'QUEUED'
  | 'ANALYZING'
  | 'DETECTING'
  | 'REVIEW_REQUIRED'
  | 'READY_TO_EXPORT'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED';

export type StampOwner = string;

export type ResolvedStampOwner = string;

export type StampPlacementMode = 'ADAPTIVE' | 'MANUAL' | 'CUSTOM';

export type StampRelation = 'OVERLAP' | 'BESIDE' | 'CUSTOM';

export type StampAnchorPosition =
  | 'AUTO'
  | 'OVERLAP_LEFT'
  | 'OVERLAP_CENTER'
  | 'OVERLAP_RIGHT'
  | 'BESIDE_LEFT'
  | 'BESIDE_RIGHT'
  | 'BELOW';

export type ProcessingErrorCode =
  | 'INVALID_PDF'
  | 'ENCRYPTED_PDF'
  | 'UNSUPPORTED_PDF_FEATURE'
  | 'OCR_FAILED'
  | 'PERSON_A_NOT_FOUND'
  | 'PERSON_B_NOT_FOUND'
  | 'AMBIGUOUS_PERSON_MATCH'
  | 'SIGNATURE_ANCHOR_NOT_FOUND'
  | 'MULTIPLE_ANCHORS_FOUND'
  | 'STAMP_OWNER_NOT_FOUND'
  | 'STAMP_PLACEMENT_FAILED'
  | 'DUPLICATE_STAMP_PREVENTED'
  | 'PDF_EXPORT_FAILED'
  | 'MEMORY_LIMIT';

/**
 * Canonical visual coordinate rectangle in PDF points (1/72 inch) relative to
 * the visible page (post-CropBox, post-page-rotation), top-left origin (x right, y down).
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundingBox = Rect;

export interface Placement {
  pageIndex: number;
  bounds: Rect;
  /** Clockwise rotation in visual page space, in degrees. */
  rotation: number;
}

export interface PersonProfile {
  id: PersonId;
  label?: string;
  fullName: string;
  nameVariants: string[];
  roleNames: string[];
  signatureAssetId: string | null;
  enabled: boolean;
}

export interface SignerConfig {
  id: string;
  profile: PersonProfile;
  asset: PngAsset | null;
}

export interface StampConfig {
  id: string;
  label: string;
  policy: StampPolicy;
  asset: PngAsset | null;
}

export interface PngAsset {
  id: string;
  kind: 'SIGNATURE_A' | 'SIGNATURE_B' | 'SIGNATURE' | 'STAMP';
  fileName: string;
  fileSize: number;
  bytes: Uint8Array;
  objectUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Non-transparent bounding box inside the PNG image (in pixels). */
  opaqueBounds: Rect;
  /** Percentage of empty transparent padding around the graphic (0..100). */
  transparentPaddingRatio: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  hasAlphaTransparency: boolean;
}

export interface TextBlock {
  id: string;
  text: string;
  normalizedText: string;
  bounds: Rect;
  pageIndex: number;
  source: 'DIGITAL_TEXT' | 'OCR';
  confidence?: number;
}

export interface LineCandidate {
  id: string;
  bounds: Rect;
  length: number;
  thickness: number;
  source: 'VECTOR' | 'VISION' | 'UNDERSCORE_TEXT';
  /** Heuristic score 0..1 indicating likelihood this is a signature line vs table border. */
  lineQualityScore: number;
  isLikelyTableBorder: boolean;
}

export interface PageGeometry {
  pageIndex: number;
  /** Visual width in PDF points at scale 1 (post-rotation, post-CropBox). */
  width: number;
  /** Visual height in PDF points at scale 1 (post-rotation, post-CropBox). */
  height: number;
  /** PDF page rotation in degrees (0, 90, 180, 270). */
  rotation: 0 | 90 | 180 | 270;
  mediaBox: Rect;
  cropBox: Rect;
}

export interface PageAnalysis {
  pageIndex: number;
  pageType: PageType;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  mediaBox: Rect;
  cropBox: Rect;
  extractedText: TextBlock[];
  candidateLines: LineCandidate[];
  warnings: string[];
  ocrExecuted: boolean;
  cvMethod?: 'OPENCV' | 'FALLBACK_TS' | 'VECTOR_ONLY';
}

export interface DetectionEvidence {
  type: 'NAME' | 'ROLE' | 'SPATIAL' | 'LINE' | 'LAYOUT';
  description: string;
  bounds?: Rect;
  score?: number;
}

export interface DetectionScores {
  nameMatch: number;
  roleMatch: number;
  contextMatch: number;
  lineMatch: number;
  geometryMatch: number;
}

export interface SignatureCandidate {
  personId: PersonId;
  pageIndex: number;
  lineBounds: Rect;
  placementBounds: Rect;
  scores: DetectionScores;
  /** Uncalibrated heuristic composite score in [0, 1]. */
  heuristicScore: number;
  detectionMethod: DetectionMethod;
  evidence: DetectionEvidence[];
  matchedNameText?: string;
  matchedRoleText?: string;
  matchedBySurnameOnly: boolean;
}

export interface SignatureAnchor {
  personId: PersonId;
  pageIndex: number;
  lineBounds: BoundingBox;
  placementBounds: BoundingBox;
  /** Heuristic score in [0, 1]; explicitly not a calibrated probability. */
  confidence: number;
  scores: DetectionScores;
  detectionMethod: DetectionMethod;
  status: AnchorStatus;
  evidence: DetectionEvidence[];
  candidateCount: number;
  isManuallyAdjusted?: boolean;
  matchedNameText?: string;
  matchedRoleText?: string;
}

export interface StampPolicy {
  countPerDocument: 1;
  owner: StampOwner;
  placementMode: StampPlacementMode;
  relation: StampRelation;
  anchorPosition?: StampAnchorPosition;
  allowDuplicate: false;
  allowFallbackPlacement: false;
  /** Default physical stamp diameter/width in PDF points (1 pt = 1/72 in; ~115pt ≈ 40mm). */
  defaultWidthPt: number;
  /** Default overlap ratio when relation === 'OVERLAP' (0..0.6). */
  overlapRatio: number;
  /** Default rotation in degrees. */
  defaultRotation: number;
}

export interface PdfIntegrityInfo {
  isEncrypted: boolean;
  hasDigitalSignature: boolean;
  hasInteractiveForms: boolean;
  hasAnnotations: boolean;
  hasJavaScriptOrActions: boolean;
  errorCode?: ProcessingErrorCode;
}

export interface StructuredIssue {
  code: ProcessingErrorCode | string;
  fileName: string;
  pageIndex?: number;
  messageKey: string;
  message: string;
  remediation: string;
  severity: 'error' | 'warning';
}

export interface DocumentSignatureEntry {
  signerId: string;
  label: string;
  anchor: SignatureAnchor | null;
  skipped?: boolean;
}

export interface DocumentStampEntry {
  stampId: string;
  label: string;
  owner: ResolvedStampOwner;
  placement: Placement | null;
  isManuallyAdjusted?: boolean;
  skipped?: boolean;
  warnings?: string[];
  errors?: string[];
}

export interface DocumentResult {
  documentId: string;
  fileName: string;
  pageCount: number;
  classification: DocumentClassification;
  pageTypes: PageType[];
  pages: PageAnalysis[];
  integrity: PdfIntegrityInfo;
  signatures: {
    personA: SignatureAnchor | null;
    personB: SignatureAnchor | null;
  };
  stamp: {
    owner: ResolvedStampOwner;
    placement: Placement | null;
    count: number;
    isManuallyAdjusted?: boolean;
  };
  signerResults?: DocumentSignatureEntry[];
  stampResults?: DocumentStampEntry[];
  status: DocumentResultStatus;
  manualApprovalConfirmed: boolean;
  cryptoSignatureAcknowledged: boolean;
  errors: string[];
  warnings: string[];
  issues: StructuredIssue[];
}

export interface UploadedPdfFile {
  id: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  /** Original immutable source bytes kept untouched. */
  bytes: Uint8Array;
  pageCount: number | null;
  isValid: boolean;
  integrity: PdfIntegrityInfo;
  error?: string;
}

export interface ProcessingJob {
  id: string;
  fileName: string;
  status: JobStatus;
  pagesTotal: number;
  pagesAnalyzed: number;
  signaturesDetected: number;
  stampCount: number;
  errors: string[];
  warnings: string[];
  exportedBytes?: Uint8Array;
  exportedUrl?: string;
}

export interface DetectionThresholds {
  /** Minimum heuristic score to consider a candidate valid for auto-ready. */
  autoReadyMinScore: number;
  /** Minimum margin between top-1 and top-2 candidates to avoid ambiguity. */
  ambiguityMargin: number;
  /** Minimum name match score required for auto-ready. */
  minNameScore: number;
  /** Minimum line match score required for auto-ready. */
  minLineScore: number;
}

export interface OcrConfig {
  languages: string[];
  /** Scale / DPI factor for rendering scanned pages (e.g. 2.0 ≈ 144 DPI, 2.5 ≈ 180 DPI). */
  renderScale: number;
  /** Optional local tessdata base path; defaults to '/tessdata' or CDN if allowed. */
  langPath: string;
  allowCdnFallback: boolean;
}

export interface BatchExportReport {
  generatedAt: string;
  totalDocuments: number;
  completedCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
  failedCount: number;
  documents: Array<{
    documentId: string;
    fileName: string;
    status: JobStatus;
    classification: DocumentClassification;
    pageCount: number;
    personAStatus: AnchorStatus | 'MISSING';
    personBStatus: AnchorStatus | 'MISSING';
    signerCount?: number;
    signaturesPlaced?: number;
    stampOwner: ResolvedStampOwner;
    stampCount: number;
    warnings: string[];
    errors: string[];
  }>;
}
