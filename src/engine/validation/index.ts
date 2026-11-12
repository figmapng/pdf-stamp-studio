import type { DocumentResult, PngAsset, SignerConfig, StampConfig, StampPolicy } from '../../types';

export interface ExportValidationResult {
  canExport: boolean;
  reasons: string[];
}

export const MAX_PDF_BATCH_MVP = 50;
export const MAX_PNG_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_FILE_BYTES = 100 * 1024 * 1024;

export function validateMultiDocumentForExport(
  doc: DocumentResult,
  signers: SignerConfig[],
  stamps: StampConfig[],
): ExportValidationResult {
  const reasons: string[] = [];

  if (doc.integrity.isEncrypted) reasons.push('ENCRYPTED_PDF');
  if (doc.integrity.errorCode === 'INVALID_PDF') reasons.push('INVALID_PDF');
  if (doc.integrity.hasDigitalSignature && !doc.cryptoSignatureAcknowledged) {
    reasons.push('CRYPTOGRAPHIC_SIGNATURE_UNACKNOWLEDGED');
  }

  const signerMap = new Map(signers.map((s) => [s.id, s]));
  const stampMap = new Map(stamps.map((s) => [s.id, s]));

  const signerEntries = doc.signerResults ?? [];
  const stampEntries = doc.stampResults ?? [];

  let activePlacements = 0;

  for (const entry of signerEntries) {
    if (entry.skipped) continue;
    activePlacements++;
    const cfg = signerMap.get(entry.signerId);
    if (!cfg?.asset) {
      reasons.push('MISSING_PNG_ASSETS');
    }
    if (!entry.anchor) {
      reasons.push('SIGNER_NOT_FOUND');
    } else if (entry.anchor.pageIndex < 0 || entry.anchor.pageIndex >= doc.pageCount) {
      reasons.push('SIGNER_PAGE_OUT_OF_RANGE');
    }
  }

  for (const entry of stampEntries) {
    if (entry.skipped) continue;
    activePlacements++;
    const cfg = stampMap.get(entry.stampId);
    if (!cfg?.asset) {
      reasons.push('MISSING_PNG_ASSETS');
    }
    if (!entry.placement) {
      reasons.push('STAMP_PLACEMENT_FAILED');
    } else if (entry.placement.pageIndex < 0 || entry.placement.pageIndex >= doc.pageCount) {
      reasons.push('STAMP_PAGE_OUT_OF_RANGE');
    }
  }

  if (activePlacements === 0) {
    reasons.push('NO_PLACEMENTS_CONFIGURED');
  }

  if (doc.status !== 'AUTO_READY' && doc.status !== 'COMPLETED' && !doc.manualApprovalConfirmed) {
    reasons.push('MANUAL_CONFIRMATION_REQUIRED');
  }

  return {
    canExport: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
  };
}

/**
 * Hard pre-export gate ensuring every business invariant is satisfied before writing PDF bytes.
 */
export function validateDocumentForExport(
  doc: DocumentResult,
  assets: {
    signatureA: PngAsset | null;
    signatureB: PngAsset | null;
    stamp: PngAsset | null;
  },
  policy: StampPolicy,
): ExportValidationResult {
  const reasons: string[] = [];

  if (doc.integrity.isEncrypted) {
    reasons.push('ENCRYPTED_PDF');
  }
  if (doc.integrity.errorCode === 'INVALID_PDF') {
    reasons.push('INVALID_PDF');
  }
  if (doc.integrity.hasDigitalSignature && !doc.cryptoSignatureAcknowledged) {
    reasons.push('CRYPTOGRAPHIC_SIGNATURE_UNACKNOWLEDGED');
  }
  if (!assets.signatureA || !assets.signatureB || !assets.stamp) {
    reasons.push('MISSING_PNG_ASSETS');
  }

  // Invariant: Person A signature exactly 1, Person B signature exactly 1, Stamp exactly 1
  if (!doc.signatures.personA) {
    reasons.push('PERSON_A_NOT_FOUND');
  } else if (
    doc.signatures.personA.pageIndex < 0 ||
    doc.signatures.personA.pageIndex >= doc.pageCount
  ) {
    reasons.push('PERSON_A_PAGE_OUT_OF_RANGE');
  }

  if (!doc.signatures.personB) {
    reasons.push('PERSON_B_NOT_FOUND');
  } else if (
    doc.signatures.personB.pageIndex < 0 ||
    doc.signatures.personB.pageIndex >= doc.pageCount
  ) {
    reasons.push('PERSON_B_PAGE_OUT_OF_RANGE');
  }

  if (policy.countPerDocument !== 1 || policy.allowDuplicate || doc.stamp.count !== 1) {
    reasons.push('DUPLICATE_STAMP_PREVENTED');
  }

  if (!doc.stamp.placement) {
    reasons.push('STAMP_PLACEMENT_FAILED');
  } else if (
    doc.stamp.placement.pageIndex < 0 ||
    doc.stamp.placement.pageIndex >= doc.pageCount
  ) {
    reasons.push('STAMP_PAGE_OUT_OF_RANGE');
  }

  if (doc.status !== 'AUTO_READY' && doc.status !== 'COMPLETED' && !doc.manualApprovalConfirmed) {
    reasons.push('MANUAL_CONFIRMATION_REQUIRED');
  }

  return {
    canExport: reasons.length === 0,
    reasons,
  };
}

/**
 * Returns true if the document has valid structure, all required visual placements,
 * and no unacknowledged cryptographic signature block.
 */
export function canApproveDocument(doc: DocumentResult): boolean {
  if (doc.integrity.isEncrypted || doc.integrity.errorCode === 'INVALID_PDF') {
    return false;
  }
  if (doc.integrity.hasDigitalSignature && !doc.cryptoSignatureAcknowledged) {
    return false;
  }

  if (doc.signerResults !== undefined || doc.stampResults !== undefined) {
    const activeSigners = (doc.signerResults ?? []).filter((s) => !s.skipped);
    const activeStamps = (doc.stampResults ?? []).filter((s) => !s.skipped);
    if (activeSigners.length + activeStamps.length === 0) return false;
    return (
      activeSigners.every((s) => Boolean(s.anchor)) &&
      activeStamps.every((s) => Boolean(s.placement))
    );
  }

  return (
    Boolean(doc.signatures.personA) &&
    Boolean(doc.signatures.personB) &&
    Boolean(doc.stamp.placement)
  );
}

/**
 * Returns true when an unconfirmed REVIEW_REQUIRED document can be batch-approved safely.
 */
export function canBatchApproveDocument(doc: DocumentResult): boolean {
  return doc.status === 'REVIEW_REQUIRED' && canApproveDocument(doc);
}

/**
 * Generates collision-safe unique filenames for batch upload and ZIP export.
 */
export function makeUniqueFileName(desiredName: string, existingNames: Set<string>): string {
  if (!existingNames.has(desiredName)) {
    existingNames.add(desiredName);
    return desiredName;
  }

  const dotIdx = desiredName.lastIndexOf('.');
  const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName;
  const ext = dotIdx > 0 ? desiredName.slice(dotIdx) : '';

  let counter = 2;
  while (existingNames.has(`${base} (${counter})${ext}`)) {
    counter++;
  }
  const unique = `${base} (${counter})${ext}`;
  existingNames.add(unique);
  return unique;
}
