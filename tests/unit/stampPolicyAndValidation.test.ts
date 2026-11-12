import { describe, expect, it } from 'vitest';
import type { DocumentResult, PageAnalysis, SignatureAnchor, StampPolicy } from '../../src/types';
import { DEFAULT_STAMP_POLICY, resolveStampPolicy } from '../../src/engine/stamp-policy';
import { resolveSignatureAnchors } from '../../src/engine/anchor-detection';
import { canBatchApproveDocument, validateDocumentForExport } from '../../src/engine/validation';
import { createTestPngAsset } from '../fixtures/pdfFixtureFactory';

function makeAnchor(personId: 'PERSON_A' | 'PERSON_B', x = 80, y = 600): SignatureAnchor {
  return {
    personId,
    pageIndex: 0,
    lineBounds: { x, y: y + 36, width: 130, height: 1.5 },
    placementBounds: { x, y, width: 110, height: 42 },
    confidence: 0.92,
    scores: {
      nameMatch: 1,
      roleMatch: 1,
      contextMatch: 0.9,
      lineMatch: 0.9,
      geometryMatch: 0.95,
    },
    detectionMethod: 'DIGITAL_TEXT',
    status: 'AUTO_READY',
    evidence: [],
    candidateCount: 1,
  };
}

const samplePage: PageAnalysis = {
  pageIndex: 0,
  pageType: 'DIGITAL',
  width: 595,
  height: 842,
  rotation: 0,
  mediaBox: { x: 0, y: 0, width: 595, height: 842 },
  cropBox: { x: 0, y: 0, width: 595, height: 842 },
  extractedText: [],
  candidateLines: [],
  warnings: [],
  ocrExecuted: false,
};

describe('Stamp Policy Invariants & Pre-Export Validation', () => {
  it('never falls back to Person B when owner=PERSON_A and Person A anchor is missing', () => {
    const res = resolveStampPolicy({
      policy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_A', placementMode: 'ADAPTIVE' },
      personA: null,
      personB: makeAnchor('PERSON_B', 340, 600),
      pages: [samplePage],
    });

    expect(res.count).toBe(0);
    expect(res.placement).toBeNull();
    expect(res.errors).toContain('STAMP_OWNER_NOT_FOUND');
  });

  it('places exactly 1 stamp in ADAPTIVE OVERLAP and BESIDE modes without colliding', () => {
    const anchorA = makeAnchor('PERSON_A', 70, 600);
    const anchorB = makeAnchor('PERSON_B', 350, 600);

    const overlapRes = resolveStampPolicy({
      policy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_A', relation: 'OVERLAP' },
      personA: anchorA,
      personB: anchorB,
      pages: [samplePage],
    });
    expect(overlapRes.count).toBe(1);
    expect(overlapRes.placement).not.toBeNull();
    expect(overlapRes.requiresManualConfirmation).toBe(false);

    const besideRes = resolveStampPolicy({
      policy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_B', relation: 'BESIDE' },
      personA: anchorA,
      personB: anchorB,
      pages: [samplePage],
    });
    expect(besideRes.count).toBe(1);
    expect(besideRes.placement).not.toBeNull();
    expect(besideRes.placement!.bounds.x).toBeGreaterThanOrEqual(0);
    expect(besideRes.placement!.bounds.x + besideRes.placement!.bounds.width).toBeLessThanOrEqual(595);
  });

  it('prefers left-edge overlap so printed signatory name on the right stays uncovered', () => {
    const inlineAnchorB: SignatureAnchor = {
      ...makeAnchor('PERSON_B', 260, 600),
      lineBounds: { x: 250, y: 635, width: 130, height: 1.5 },
      placementBounds: { x: 265, y: 600, width: 100, height: 40 },
      matchedNameText: 'Сатыбалдина З. С.',
    };
    const pageWithInlineName: PageAnalysis = {
      ...samplePage,
      extractedText: [
        {
          id: 'role-1',
          text: 'Заведующий лабораторией',
          normalizedText: 'заведующий лабораторией',
          bounds: { x: 80, y: 622, width: 160, height: 14 },
          pageIndex: 0,
          source: 'DIGITAL_TEXT',
        },
        {
          id: 'name-1',
          text: 'Сатыбалдина З. С.',
          normalizedText: 'сатыбалдина з с',
          bounds: { x: 390, y: 622, width: 130, height: 14 },
          pageIndex: 0,
          source: 'DIGITAL_TEXT',
        },
      ],
    };

    const res = resolveStampPolicy({
      policy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_B', relation: 'OVERLAP' },
      personA: makeAnchor('PERSON_A', 70, 300),
      personB: inlineAnchorB,
      pages: [pageWithInlineName],
    });

    expect(res.placement).not.toBeNull();
    // Stamp right edge must not cover the printed name block at x=390..520
    expect(res.placement!.bounds.x + res.placement!.bounds.width).toBeLessThanOrEqual(390);
  });

  it('prevents duplicate stamps and blocks export on invalid invariants', async () => {
    const sigA = await createTestPngAsset('SIGNATURE_A');
    const sigB = await createTestPngAsset('SIGNATURE_B');
    const stamp = await createTestPngAsset('STAMP', 120, 120);

    const badDuplicatePolicy = {
      ...DEFAULT_STAMP_POLICY,
      allowDuplicate: true,
    } as unknown as StampPolicy;

    const dupRes = resolveStampPolicy({
      policy: badDuplicatePolicy,
      personA: makeAnchor('PERSON_A'),
      personB: makeAnchor('PERSON_B', 350, 600),
      pages: [samplePage],
    });
    expect(dupRes.errors).toContain('DUPLICATE_STAMP_PREVENTED');
    expect(dupRes.count).toBe(0);

    const baseDoc: DocumentResult = {
      documentId: 'doc-1',
      fileName: 'contract.pdf',
      pageCount: 1,
      classification: 'DIGITAL_PDF',
      pageTypes: ['DIGITAL'],
      pages: [samplePage],
      integrity: {
        isEncrypted: false,
        hasDigitalSignature: true,
        hasInteractiveForms: true,
        hasAnnotations: false,
        hasJavaScriptOrActions: false,
      },
      signatures: {
        personA: makeAnchor('PERSON_A'),
        personB: makeAnchor('PERSON_B', 350, 600),
      },
      stamp: {
        owner: 'PERSON_A',
        placement: { pageIndex: 0, bounds: { x: 100, y: 580, width: 112, height: 112 }, rotation: 0 },
        count: 1,
      },
      status: 'REVIEW_REQUIRED',
      manualApprovalConfirmed: false,
      cryptoSignatureAcknowledged: false,
      errors: [],
      warnings: [],
      issues: [],
    };

    // Unacknowledged crypto signature + unconfirmed review must block export
    const gate1 = validateDocumentForExport(
      baseDoc,
      { signatureA: sigA, signatureB: sigB, stamp },
      DEFAULT_STAMP_POLICY,
    );
    expect(gate1.canExport).toBe(false);
    expect(gate1.reasons).toContain('CRYPTOGRAPHIC_SIGNATURE_UNACKNOWLEDGED');
    expect(gate1.reasons).toContain('MANUAL_CONFIRMATION_REQUIRED');

    // Once acknowledged & confirmed, export passes
    const gate2 = validateDocumentForExport(
      { ...baseDoc, cryptoSignatureAcknowledged: true, manualApprovalConfirmed: true },
      { signatureA: sigA, signatureB: sigB, stamp },
      DEFAULT_STAMP_POLICY,
    );
    expect(gate2.canExport).toBe(true);
  });

  it('allows batch approval ONLY for valid REVIEW_REQUIRED documents without unacknowledged crypto signatures', () => {
    const validReviewDoc: DocumentResult = {
      documentId: 'doc-review',
      fileName: 'review.pdf',
      pageCount: 1,
      classification: 'DIGITAL_PDF',
      pageTypes: ['DIGITAL'],
      pages: [samplePage],
      integrity: {
        isEncrypted: false,
        hasDigitalSignature: false,
        hasInteractiveForms: false,
        hasAnnotations: false,
        hasJavaScriptOrActions: false,
      },
      signatures: {
        personA: makeAnchor('PERSON_A'),
        personB: makeAnchor('PERSON_B', 350, 600),
      },
      stamp: {
        owner: 'PERSON_A',
        placement: { pageIndex: 0, bounds: { x: 100, y: 580, width: 112, height: 112 }, rotation: 0 },
        count: 1,
      },
      status: 'REVIEW_REQUIRED',
      manualApprovalConfirmed: false,
      cryptoSignatureAcknowledged: false,
      errors: [],
      warnings: [],
      issues: [],
    };

    expect(canBatchApproveDocument(validReviewDoc)).toBe(true);
    expect(
      canBatchApproveDocument({
        ...validReviewDoc,
        integrity: { ...validReviewDoc.integrity, hasDigitalSignature: true },
      }),
    ).toBe(false);
    expect(
      canBatchApproveDocument({
        ...validReviewDoc,
        stamp: { owner: 'PERSON_A', placement: null, count: 0 },
      }),
    ).toBe(false);
    expect(canBatchApproveDocument({ ...validReviewDoc, status: 'BLOCKED' })).toBe(false);
  });

  it('auto-approves clear multi-token name + signature line anchors even when roleNames is empty', () => {
    const page: PageAnalysis = {
      ...samplePage,
      extractedText: [
        {
          id: 'n1',
          text: 'Затыбек А. А.',
          normalizedText: 'затыбек а а',
          bounds: { x: 350, y: 615, width: 95, height: 11 },
          pageIndex: 0,
          source: 'DIGITAL_TEXT',
        },
        {
          id: 'n2',
          text: 'Сатыбалдина З. С.',
          normalizedText: 'сатыбалдина з с',
          bounds: { x: 350, y: 715, width: 115, height: 11 },
          pageIndex: 0,
          source: 'DIGITAL_TEXT',
        },
      ],
      candidateLines: [
        {
          id: 'l1',
          bounds: { x: 200, y: 625, width: 135, height: 1.5 },
          length: 135,
          thickness: 1.5,
          source: 'UNDERSCORE_TEXT',
          lineQualityScore: 0.85,
          isLikelyTableBorder: false,
        },
        {
          id: 'l2',
          bounds: { x: 200, y: 725, width: 135, height: 1.5 },
          length: 135,
          thickness: 1.5,
          source: 'UNDERSCORE_TEXT',
          lineQualityScore: 0.85,
          isLikelyTableBorder: false,
        },
      ],
    };

    const res = resolveSignatureAnchors(
      {
        id: 'PERSON_A',
        fullName: 'Затыбек А. А.',
        nameVariants: [],
        roleNames: [],
        signatureAssetId: null,
        enabled: true,
      },
      {
        id: 'PERSON_B',
        fullName: 'Сатыбалдина З. С.',
        nameVariants: [],
        roleNames: [],
        signatureAssetId: null,
        enabled: true,
      },
      [page],
      null,
      null,
    );

    expect(res.personA?.status).toBe('AUTO_READY');
    expect(res.personB?.status).toBe('AUTO_READY');
    expect(res.personA!.confidence).toBeGreaterThanOrEqual(0.78);
    expect(res.personB!.confidence).toBeGreaterThanOrEqual(0.78);
  });

  it('honors explicit stamp anchorPosition presets relative to the signature anchor', () => {
    const anchorA = makeAnchor('PERSON_A', 220, 500);
    const sigBounds = anchorA.placementBounds;

    const getPos = (anchorPosition: StampPolicy['anchorPosition']) =>
      resolveStampPolicy({
        policy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_A', anchorPosition },
        personA: anchorA,
        personB: null,
        pages: [samplePage],
      }).placement!.bounds;

    const leftOverlap = getPos('OVERLAP_LEFT');
    const centerOverlap = getPos('OVERLAP_CENTER');
    const rightOverlap = getPos('OVERLAP_RIGHT');
    const besideLeft = getPos('BESIDE_LEFT');
    const besideRight = getPos('BESIDE_RIGHT');
    const below = getPos('BELOW');

    expect(leftOverlap.x).toBeLessThan(centerOverlap.x);
    expect(centerOverlap.x).toBeLessThan(rightOverlap.x);
    expect(besideLeft.x + besideLeft.width).toBeLessThan(sigBounds.x);
    expect(besideRight.x).toBeGreaterThan(sigBounds.x + sigBounds.width);
    expect(below.y).toBeGreaterThan(anchorA.lineBounds.y);
  });
});
