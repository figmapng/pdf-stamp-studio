import type {
  DocumentResultStatus,
  DocumentSignatureEntry,
  PdfIntegrityInfo,
  PersonProfile,
  SignatureAnchor,
  SignerConfig,
  StampConfig,
  StructuredIssue,
} from '../../types';
import type { MultiStampResolutionResult, StampResolutionResult } from '../stamp-policy';

export interface DocumentEvaluationInput {
  fileName: string;
  integrity: PdfIntegrityInfo;
  profileA: PersonProfile;
  profileB: PersonProfile;
  personA: SignatureAnchor | null;
  personB: SignatureAnchor | null;
  hasConflict: boolean;
  stampResult: StampResolutionResult;
  manualApprovalConfirmed: boolean;
  cryptoSignatureAcknowledged: boolean;
  hasAllPngAssets: boolean;
  anchorErrors: string[];
  anchorWarnings: string[];
}

export interface DocumentEvaluationOutput {
  status: DocumentResultStatus;
  errors: string[];
  warnings: string[];
  issues: StructuredIssue[];
}

export function evaluateDocumentConfidenceAndStatus(
  input: DocumentEvaluationInput,
): DocumentEvaluationOutput {
  const {
    fileName,
    integrity,
    profileA,
    profileB,
    personA,
    personB,
    hasConflict,
    stampResult,
    manualApprovalConfirmed,
    cryptoSignatureAcknowledged,
    hasAllPngAssets,
    anchorErrors,
    anchorWarnings,
  } = input;

  const errors = new Set<string>([...anchorErrors, ...stampResult.errors]);
  const warnings = new Set<string>([...anchorWarnings, ...stampResult.warnings]);
  const issues: StructuredIssue[] = [];

  if (integrity.isEncrypted || integrity.errorCode === 'ENCRYPTED_PDF') {
    errors.add('ENCRYPTED_PDF');
    issues.push({
      code: 'ENCRYPTED_PDF',
      fileName,
      messageKey: 'errors.encryptedPdf',
      message: 'PDF is encrypted or password-protected.',
      remediation: 'Remove PDF password protection externally before processing.',
      severity: 'error',
    });
    return { status: 'BLOCKED', errors: Array.from(errors), warnings: Array.from(warnings), issues };
  }

  if (integrity.errorCode === 'INVALID_PDF') {
    errors.add('INVALID_PDF');
    issues.push({
      code: 'INVALID_PDF',
      fileName,
      messageKey: 'errors.invalidPdf',
      message: 'File is corrupted or not a valid PDF.',
      remediation: 'Verify the source PDF opens cleanly and re-upload.',
      severity: 'error',
    });
    return { status: 'BLOCKED', errors: Array.from(errors), warnings: Array.from(warnings), issues };
  }

  if (integrity.hasDigitalSignature && !cryptoSignatureAcknowledged) {
    warnings.add('CRYPTOGRAPHIC_SIGNATURE_DETECTED');
    issues.push({
      code: 'CRYPTOGRAPHIC_SIGNATURE_DETECTED',
      fileName,
      messageKey: 'warnings.cryptoSignature',
      message: 'Document contains a cryptographic digital signature. Adding visual stamps will invalidate it.',
      remediation: 'Acknowledge this warning in Manual Review Center before exporting, or exclude this document.',
      severity: 'warning',
    });
  }

  if (integrity.hasInteractiveForms || integrity.hasAnnotations) {
    warnings.add('INTERACTIVE_FORMS_OR_ANNOTATIONS');
    issues.push({
      code: 'INTERACTIVE_FORMS_OR_ANNOTATIONS',
      fileName,
      messageKey: 'warnings.formsOrAnnotations',
      message: 'Document contains interactive form fields or annotations; pages will not be flattened.',
      remediation: 'Compare original and exported PDFs in Preview after stamping.',
      severity: 'warning',
    });
  }

  if (integrity.hasJavaScriptOrActions) {
    warnings.add('PDF_ACTIONS_IGNORED');
    issues.push({
      code: 'PDF_ACTIONS_IGNORED',
      fileName,
      messageKey: 'warnings.pdfActionsIgnored',
      message: 'Embedded PDF JavaScript/actions were detected and intentionally not executed.',
      remediation: 'Inspect the document carefully before exporting.',
      severity: 'warning',
    });
  }

  if (!hasAllPngAssets) {
    warnings.add('MISSING_PNG_ASSETS');
    issues.push({
      code: 'MISSING_PNG_ASSETS',
      fileName,
      messageKey: 'warnings.missingPngAssets',
      message: 'All three PNG assets (Signature A, Signature B, Stamp) are required before export.',
      remediation: 'Upload missing PNG assets in Setup.',
      severity: 'warning',
    });
  }

  if (!profileA.enabled || !profileB.enabled) {
    warnings.add('SIGNATORY_PROFILE_DISABLED');
    issues.push({
      code: 'SIGNATORY_PROFILE_DISABLED',
      fileName,
      messageKey: 'warnings.profileDisabled',
      message: 'Business rule requires both Person A and Person B signatures.',
      remediation: 'Enable both Person A and Person B profiles or confirm manually in Review Center.',
      severity: 'warning',
    });
  }

  // Record missing/ambiguous anchor issues
  if (!personA) {
    errors.add('PERSON_A_NOT_FOUND');
    issues.push({
      code: 'PERSON_A_NOT_FOUND',
      fileName,
      messageKey: 'errors.personANotFound',
      message: 'Person A signature anchor was not found automatically.',
      remediation: 'Place Person A signature manually in Manual Review Center.',
      severity: 'error',
    });
  } else if (personA.status !== 'AUTO_READY') {
    issues.push({
      code: personA.status === 'BLOCKED' ? 'MULTIPLE_ANCHORS_FOUND' : 'AMBIGUOUS_PERSON_MATCH',
      fileName,
      pageIndex: personA.pageIndex,
      messageKey: 'warnings.personAReview',
      message: `Person A match requires review (heuristic score ${Math.round(personA.confidence * 100)}%).`,
      remediation: 'Verify Person A placement and evidence in Manual Review Center.',
      severity: personA.status === 'BLOCKED' ? 'error' : 'warning',
    });
  }

  if (!personB) {
    errors.add('PERSON_B_NOT_FOUND');
    issues.push({
      code: 'PERSON_B_NOT_FOUND',
      fileName,
      messageKey: 'errors.personBNotFound',
      message: 'Person B signature anchor was not found automatically.',
      remediation: 'Place Person B signature manually in Manual Review Center.',
      severity: 'error',
    });
  } else if (personB.status !== 'AUTO_READY') {
    issues.push({
      code: personB.status === 'BLOCKED' ? 'MULTIPLE_ANCHORS_FOUND' : 'AMBIGUOUS_PERSON_MATCH',
      fileName,
      pageIndex: personB.pageIndex,
      messageKey: 'warnings.personBReview',
      message: `Person B match requires review (heuristic score ${Math.round(personB.confidence * 100)}%).`,
      remediation: 'Verify Person B placement and evidence in Manual Review Center.',
      severity: personB.status === 'BLOCKED' ? 'error' : 'warning',
    });
  }

  if (stampResult.count !== 1 || !stampResult.placement) {
    const code = stampResult.errors[0] ?? 'STAMP_PLACEMENT_FAILED';
    errors.add(code);
    issues.push({
      code,
      fileName,
      messageKey: code === 'STAMP_OWNER_NOT_FOUND' ? 'errors.stampOwnerNotFound' : 'errors.stampPlacementFailed',
      message:
        code === 'STAMP_OWNER_NOT_FOUND'
          ? 'Selected stamp owner anchor was not found (fallback to other signatory is disabled).'
          : 'Stamp placement must be set and confirmed.',
      remediation: 'Select stamp owner and place stamp in Manual Review Center.',
      severity: 'error',
    });
  }

  // Decide final status
  const bothAnchorsPresent = personA !== null && personB !== null;
  const stampPresent = stampResult.count === 1 && stampResult.placement !== null;
  const hasBlockingErrors =
    errors.has('INVALID_PDF') ||
    errors.has('ENCRYPTED_PDF') ||
    errors.has('DUPLICATE_STAMP_PREVENTED') ||
    (!manualApprovalConfirmed &&
      (!bothAnchorsPresent ||
        !stampPresent ||
        errors.has('MULTIPLE_ANCHORS_FOUND') ||
        errors.has('STAMP_OWNER_NOT_FOUND')));

  if (hasBlockingErrors) {
    return {
      status: 'BLOCKED',
      errors: Array.from(errors),
      warnings: Array.from(warnings),
      issues,
    };
  }

  const cryptoPending = integrity.hasDigitalSignature && !cryptoSignatureAcknowledged;
  const anchorsAutoReady =
    personA?.status === 'AUTO_READY' && personB?.status === 'AUTO_READY' && !hasConflict;
  const stampAutoReady = stampPresent && !stampResult.requiresManualConfirmation;

  if (
    bothAnchorsPresent &&
    stampPresent &&
    !cryptoPending &&
    (manualApprovalConfirmed || (anchorsAutoReady && stampAutoReady && profileA.enabled && profileB.enabled))
  ) {
    return {
      status: 'AUTO_READY',
      errors: [],
      warnings: Array.from(warnings),
      issues,
    };
  }

  return {
    status: 'REVIEW_REQUIRED',
    errors: Array.from(errors),
    warnings: Array.from(warnings),
    issues,
  };
}

export interface MultiDocumentEvaluationInput {
  fileName: string;
  integrity: PdfIntegrityInfo;
  signers: SignerConfig[];
  stamps: StampConfig[];
  signerEntries: DocumentSignatureEntry[];
  stampResult: MultiStampResolutionResult;
  hasConflict: boolean;
  manualApprovalConfirmed: boolean;
  cryptoSignatureAcknowledged: boolean;
  anchorErrors: string[];
  anchorWarnings: string[];
}

/**
 * Evaluates document status for dynamic 0..N signatories and 0..M stamps.
 * Only corrupted/encrypted PDFs hard-block; missing or partial matches route cleanly to REVIEW_REQUIRED
 * so users can place items manually or skip them per document.
 */
export function evaluateMultiDocumentConfidenceAndStatus(
  input: MultiDocumentEvaluationInput,
): DocumentEvaluationOutput {
  const {
    fileName,
    integrity,
    signers,
    stamps,
    signerEntries,
    stampResult,
    hasConflict,
    manualApprovalConfirmed,
    cryptoSignatureAcknowledged,
    anchorErrors,
    anchorWarnings,
  } = input;

  const errors = new Set<string>(anchorErrors);
  const warnings = new Set<string>([...anchorWarnings, ...stampResult.warnings]);
  const issues: StructuredIssue[] = [];

  if (integrity.isEncrypted || integrity.errorCode === 'ENCRYPTED_PDF') {
    errors.add('ENCRYPTED_PDF');
    issues.push({
      code: 'ENCRYPTED_PDF',
      fileName,
      messageKey: 'errors.encryptedPdf',
      message: 'PDF is encrypted or password-protected.',
      remediation: 'Remove PDF password protection externally before processing.',
      severity: 'error',
    });
    return { status: 'BLOCKED', errors: Array.from(errors), warnings: Array.from(warnings), issues };
  }

  if (integrity.errorCode === 'INVALID_PDF') {
    errors.add('INVALID_PDF');
    issues.push({
      code: 'INVALID_PDF',
      fileName,
      messageKey: 'errors.invalidPdf',
      message: 'File is corrupted or not a valid PDF.',
      remediation: 'Verify the source PDF opens cleanly and re-upload.',
      severity: 'error',
    });
    return { status: 'BLOCKED', errors: Array.from(errors), warnings: Array.from(warnings), issues };
  }

  if (integrity.hasDigitalSignature && !cryptoSignatureAcknowledged) {
    warnings.add('CRYPTOGRAPHIC_SIGNATURE_DETECTED');
    issues.push({
      code: 'CRYPTOGRAPHIC_SIGNATURE_DETECTED',
      fileName,
      messageKey: 'warnings.cryptoSignature',
      message: 'Document contains a cryptographic digital signature. Adding visual stamps will invalidate it.',
      remediation: 'Acknowledge this warning in Manual Review Center before exporting.',
      severity: 'warning',
    });
  }

  if (integrity.hasInteractiveForms || integrity.hasAnnotations) {
    warnings.add('INTERACTIVE_FORMS_OR_ANNOTATIONS');
    issues.push({
      code: 'INTERACTIVE_FORMS_OR_ANNOTATIONS',
      fileName,
      messageKey: 'warnings.formsOrAnnotations',
      message: 'Document contains interactive form fields or annotations; pages will not be flattened.',
      remediation: 'Compare original and exported PDFs in Preview after stamping.',
      severity: 'warning',
    });
  }

  if (integrity.hasJavaScriptOrActions) {
    warnings.add('PDF_ACTIONS_IGNORED');
    issues.push({
      code: 'PDF_ACTIONS_IGNORED',
      fileName,
      messageKey: 'warnings.pdfActionsIgnored',
      message: 'Embedded PDF JavaScript/actions were detected and intentionally not executed.',
      remediation: 'Inspect the document carefully before exporting.',
      severity: 'warning',
    });
  }

  const signerMap = new Map(signers.map((s) => [s.id, s]));
  const stampMap = new Map(stamps.map((s) => [s.id, s]));

  let activeCount = 0;
  let allActivePlaced = true;
  let allActiveSignersAutoReady = true;
  let missingAnyAsset = false;

  for (const entry of signerEntries) {
    if (entry.skipped) continue;
    activeCount++;
    const cfg = signerMap.get(entry.signerId);
    if (!cfg?.asset) missingAnyAsset = true;

    if (!entry.anchor) {
      allActivePlaced = false;
      allActiveSignersAutoReady = false;
      warnings.add('SIGNER_NOT_FOUND');
      issues.push({
        code: 'SIGNER_NOT_FOUND',
        fileName,
        messageKey: 'errors.signerNotFound',
        message: `${entry.label}: signature anchor was not found automatically.`,
        remediation: 'Place manually or skip this signatory for this document.',
        severity: 'warning',
      });
    } else if (entry.anchor.status !== 'AUTO_READY') {
      allActiveSignersAutoReady = false;
      issues.push({
        code: entry.anchor.status === 'BLOCKED' ? 'MULTIPLE_ANCHORS_FOUND' : 'AMBIGUOUS_PERSON_MATCH',
        fileName,
        pageIndex: entry.anchor.pageIndex,
        messageKey: 'warnings.signerReview',
        message: `${entry.label}: match requires review (${Math.round(entry.anchor.confidence * 100)}%).`,
        remediation: 'Verify placement in Manual Review Center.',
        severity: 'warning',
      });
    }
  }

  for (const sEntry of stampResult.entries) {
    if (sEntry.skipped) continue;
    activeCount++;
    const cfg = stampMap.get(sEntry.stampId);
    if (!cfg?.asset) missingAnyAsset = true;

    if (!sEntry.placement) {
      allActivePlaced = false;
      const code = sEntry.errors?.[0] ?? 'STAMP_PLACEMENT_FAILED';
      warnings.add(code);
      issues.push({
        code,
        fileName,
        messageKey: code === 'STAMP_OWNER_NOT_FOUND' ? 'errors.stampOwnerNotFound' : 'errors.stampPlacementFailed',
        message: `${sEntry.label}: placement must be set or skipped.`,
        remediation: 'Click the page in Manual Review Center to place this stamp or skip it.',
        severity: 'warning',
      });
    }
  }

  if (missingAnyAsset) {
    warnings.add('MISSING_PNG_ASSETS');
    issues.push({
      code: 'MISSING_PNG_ASSETS',
      fileName,
      messageKey: 'warnings.missingPngAssets',
      message: 'Upload PNG/JPG images for all active signatories and stamps before exporting.',
      remediation: 'Upload missing images in Step 2.',
      severity: 'warning',
    });
  }

  const cryptoPending = integrity.hasDigitalSignature && !cryptoSignatureAcknowledged;
  const canAutoReady =
    activeCount > 0 &&
    allActivePlaced &&
    !cryptoPending &&
    (manualApprovalConfirmed ||
      (!hasConflict && allActiveSignersAutoReady && !stampResult.requiresManualConfirmation));

  if (canAutoReady) {
    return {
      status: 'AUTO_READY',
      errors: [],
      warnings: Array.from(warnings),
      issues,
    };
  }

  return {
    status: 'REVIEW_REQUIRED',
    errors: Array.from(errors),
    warnings: Array.from(warnings),
    issues,
  };
}
