import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  analyzePdfDocument,
  revalidateDocumentResult,
  revalidateMultiDocumentResult,
} from '../../src/engine/pipeline';
import { buildExportZip, exportStampedPdf } from '../../src/engine/placement/pdfExporter';
import { createDefaultStampPolicy, DEFAULT_STAMP_POLICY } from '../../src/engine/stamp-policy';
import { ocrWordsToTextBlocks, type OcrProvider } from '../../src/engine/ocr';
import type { PersonProfile, SignerConfig, StampConfig } from '../../src/types';
import { createCustomPdfFixture, createTestPngAsset } from '../fixtures/pdfFixtureFactory';

const profileA: PersonProfile = {
  id: 'PERSON_A',
  fullName: 'Серіков Асылбек Бекболатұлы',
  nameVariants: ['А. Б. Серіков', 'Серіков А.Б.', 'Serikov A.B.'],
  roleNames: ['Бас директор', 'Генеральный директор'],
  signatureAssetId: 'sig-a',
  enabled: true,
};

const profileB: PersonProfile = {
  id: 'PERSON_B',
  fullName: 'Иванов Иван Иванович',
  nameVariants: ['И. И. Иванов', 'Иванов И.И.', 'Ivanov I.I.'],
  roleNames: ['Орындаушы', 'Исполнитель', 'Главный бухгалтер'],
  signatureAssetId: 'sig-b',
  enabled: true,
};

describe('End-to-End Document Analysis, Policy & Export Integration', () => {
  it('analyzes a digital two-column Kazakh/Russian contract, places 2 signatures + 1 stamp, exports PDF and ZIP without mutating source', async () => {
    const sigA = await createTestPngAsset('SIGNATURE_A');
    const sigB = await createTestPngAsset('SIGNATURE_B');
    const stamp = await createTestPngAsset('STAMP', 120, 120);

    const pdfBytes = await createCustomPdfFixture({
      pageCount: 2,
      texts: [
        { pageIndex: 0, text: 'ШАРТ № 42 / ДОГОВОР № 42', x: 180, y: 760, size: 14 },
        { pageIndex: 0, text: 'Осы шарт тараптар арасында жасалды.', x: 60, y: 700, size: 11 },
        // Signature block on page 2 (index 1)
        { pageIndex: 1, text: 'Бас директор', x: 60, y: 240, size: 11 },
        { pageIndex: 1, text: 'А. Б. Серіков', x: 60, y: 175, size: 11 },
        { pageIndex: 1, text: 'Главный бухгалтер', x: 330, y: 240, size: 11 },
        { pageIndex: 1, text: 'И. И. Иванов', x: 330, y: 175, size: 11 },
      ],
      lines: [
        { pageIndex: 1, x1: 60, y1: 200, x2: 200, y2: 200, thickness: 1 },
        { pageIndex: 1, x1: 330, y1: 200, x2: 470, y2: 200, thickness: 1 },
      ],
    });
    const sourceSnapshot = new Uint8Array(pdfBytes);

    const result = await analyzePdfDocument({
      documentId: 'doc-contract-1',
      fileName: 'contract-42.pdf',
      bytes: pdfBytes,
      profileA,
      profileB,
      assets: { signatureA: sigA, signatureB: sigB, stamp },
      stampPolicy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_A', placementMode: 'ADAPTIVE' },
      disablePdfJsWorker: true,
    });

    expect(result.classification).toBe('DIGITAL_PDF');
    expect(result.pageCount).toBe(2);
    expect(result.status).toBe('AUTO_READY');
    expect(result.signatures.personA?.pageIndex).toBe(1);
    expect(result.signatures.personB?.pageIndex).toBe(1);
    expect(result.stamp.count).toBe(1);
    expect(result.stamp.owner).toBe('PERSON_A');
    expect(result.stamp.placement?.pageIndex).toBe(1);

    const exported = await exportStampedPdf({
      sourceBytes: pdfBytes,
      documentResult: result,
      assets: { signatureA: sigA, signatureB: sigB, stamp },
      policy: DEFAULT_STAMP_POLICY,
    });

    // Source bytes remain completely untouched
    expect(pdfBytes).toEqual(sourceSnapshot);

    // Exported PDF loads cleanly and preserves page count
    const outDoc = await PDFDocument.load(exported.bytes);
    expect(outDoc.getPages().length).toBe(2);

    // ZIP packaging
    const zipBytes = await buildExportZip({
      completedOutputs: [exported],
      report: {
        generatedAt: new Date().toISOString(),
        totalDocuments: 1,
        completedCount: 1,
        reviewRequiredCount: 0,
        blockedCount: 0,
        failedCount: 0,
        documents: [],
      },
    });
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files)).toContain('contract-42.pdf');
    expect(Object.keys(zip.files)).toContain('processing-report.json');
  });

  it('analyzes a mixed PDF (page 1 digital, page 2 scanned) with OCR + CV line detection', async () => {
    const sigA = await createTestPngAsset('SIGNATURE_A');
    const sigB = await createTestPngAsset('SIGNATURE_B');
    const stamp = await createTestPngAsset('STAMP', 120, 120);

    const mixedBytes = await createCustomPdfFixture({
      pageCount: 2,
      texts: [
        { pageIndex: 0, text: 'АКТ ВЫПОЛНЕННЫХ РАБОТ № 10', x: 150, y: 760, size: 13 },
        { pageIndex: 0, text: 'Стороны подтверждают выполнение работ в полном объеме.', x: 60, y: 700, size: 11 },
      ],
      embedImageOnPages: [1],
    });

    // Synthetic rasterizer drawing horizontal lines onto scanned page 2 (index 1)
    const fakeRasterizer = {
      async renderPageToRgba(_page: unknown, scale: number) {
        const w = Math.round(595 * scale);
        const h = Math.round(842 * scale);
        const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
        const drawLine = (x1Pt: number, x2Pt: number, yPt: number) => {
          const y = Math.round(yPt * scale);
          const xStart = Math.round(x1Pt * scale);
          const xEnd = Math.round(x2Pt * scale);
          for (let dy = 0; dy < 3; dy++) {
            for (let x = xStart; x <= xEnd; x++) {
              const idx = ((y + dy) * w + x) * 4;
              rgba[idx] = 0;
              rgba[idx + 1] = 0;
              rgba[idx + 2] = 0;
              rgba[idx + 3] = 255;
            }
          }
        };
        drawLine(70, 210, 620);
        drawLine(340, 480, 620);
        return { rgba, width: w, height: h };
      },
    };

    // Synthetic OCR provider returning scanned page word boxes
    const fakeOcr: OcrProvider = {
      async recognizeRgba(_rgba, _w, _h, pageIndex, scale) {
        const textBlocks = ocrWordsToTextBlocks(
          [
            { text: 'Бас', x0: 70 * scale, y0: 575 * scale, x1: 100 * scale, y1: 589 * scale, confidence: 94 },
            { text: 'директор', x0: 105 * scale, y0: 575 * scale, x1: 170 * scale, y1: 589 * scale, confidence: 93 },
            { text: 'А.', x0: 70 * scale, y0: 635 * scale, x1: 82 * scale, y1: 649 * scale, confidence: 92 },
            { text: 'Б.', x0: 85 * scale, y0: 635 * scale, x1: 98 * scale, y1: 649 * scale, confidence: 92 },
            { text: 'Серіков', x0: 102 * scale, y0: 635 * scale, x1: 165 * scale, y1: 649 * scale, confidence: 95 },
            { text: 'Исполнитель', x0: 340 * scale, y0: 575 * scale, x1: 425 * scale, y1: 589 * scale, confidence: 91 },
            { text: 'И.', x0: 340 * scale, y0: 635 * scale, x1: 352 * scale, y1: 649 * scale, confidence: 90 },
            { text: 'И.', x0: 355 * scale, y0: 635 * scale, x1: 368 * scale, y1: 649 * scale, confidence: 90 },
            { text: 'Иванов', x0: 372 * scale, y0: 635 * scale, x1: 430 * scale, y1: 649 * scale, confidence: 93 },
          ],
          pageIndex,
          scale,
        );
        return { textBlocks, warnings: [] };
      },
      async terminate() {},
    };

    const result = await analyzePdfDocument({
      documentId: 'doc-mixed-1',
      fileName: 'mixed-act.pdf',
      bytes: mixedBytes,
      profileA,
      profileB,
      assets: { signatureA: sigA, signatureB: sigB, stamp },
      stampPolicy: { ...DEFAULT_STAMP_POLICY, owner: 'PERSON_B', relation: 'BESIDE' },
      rasterizer: fakeRasterizer,
      ocrProvider: fakeOcr,
      disablePdfJsWorker: true,
    });

    expect(result.classification).toBe('MIXED_PDF');
    expect(result.pageTypes).toEqual(['DIGITAL', 'SCANNED']);
    expect(result.pages[1]?.ocrExecuted).toBe(true);
    expect(result.signatures.personA?.pageIndex).toBe(1);
    expect(result.signatures.personB?.pageIndex).toBe(1);
    expect(result.stamp.owner).toBe('PERSON_B');
    expect(result.status).toBe('AUTO_READY');
  });

  it('flags cryptographically signed PDFs, blocks silent export, and handles manual review confirmation', async () => {
    const sigA = await createTestPngAsset('SIGNATURE_A');
    const sigB = await createTestPngAsset('SIGNATURE_B');
    const stamp = await createTestPngAsset('STAMP', 120, 120);

    const signedBytes = await createCustomPdfFixture({
      texts: [
        { text: 'Бас директор', x: 60, y: 240 },
        { text: 'А. Б. Серіков', x: 60, y: 175 },
        { text: 'Главный бухгалтер', x: 330, y: 240 },
        { text: 'И. И. Иванов', x: 330, y: 175 },
      ],
      lines: [
        { x1: 60, y1: 200, x2: 200, y2: 200 },
        { x1: 330, y1: 200, x2: 470, y2: 200 },
      ],
      addSimulatedDigitalSignature: true,
    });

    const initial = await analyzePdfDocument({
      documentId: 'doc-signed',
      fileName: 'signed.pdf',
      bytes: signedBytes,
      profileA,
      profileB,
      assets: { signatureA: sigA, signatureB: sigB, stamp },
      stampPolicy: DEFAULT_STAMP_POLICY,
      disablePdfJsWorker: true,
    });

    expect(initial.integrity.hasDigitalSignature).toBe(true);
    expect(initial.status).toBe('REVIEW_REQUIRED');
    expect(initial.warnings).toContain('CRYPTOGRAPHIC_SIGNATURE_DETECTED');

    // Trying to export without acknowledging must throw
    await expect(
      exportStampedPdf({
        sourceBytes: signedBytes,
        documentResult: initial,
        assets: { signatureA: sigA, signatureB: sigB, stamp },
        policy: DEFAULT_STAMP_POLICY,
      }),
    ).rejects.toThrow(/CRYPTOGRAPHIC_SIGNATURE_UNACKNOWLEDGED/);

    // Acknowledge and confirm via Review Center revalidation
    const approved = revalidateDocumentResult({
      doc: initial,
      profileA,
      profileB,
      assets: { signatureA: sigA, signatureB: sigB, stamp },
      stampPolicy: DEFAULT_STAMP_POLICY,
      cryptoSignatureAcknowledged: true,
      manualApprovalConfirmed: true,
    });
    expect(approved.status).toBe('AUTO_READY');
  });

  it('handles corrupted PDF cleanly without crashing', async () => {
    const sigA = await createTestPngAsset('SIGNATURE_A');
    const sigB = await createTestPngAsset('SIGNATURE_B');
    const stamp = await createTestPngAsset('STAMP', 120, 120);

    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const res = await analyzePdfDocument({
      documentId: 'doc-bad',
      fileName: 'corrupted.pdf',
      bytes: garbage,
      profileA,
      profileB,
      assets: { signatureA: sigA, signatureB: sigB, stamp },
      stampPolicy: DEFAULT_STAMP_POLICY,
      disablePdfJsWorker: true,
    });

    expect(res.status).toBe('BLOCKED');
    expect(res.errors).toContain('INVALID_PDF');
  });

  it('supports signatures-only (0 stamps) and multi-signer / multi-stamp export with per-doc skip', async () => {
    const sig1 = await createTestPngAsset('SIGNATURE_A');
    const sig2 = await createTestPngAsset('SIGNATURE_B');
    const sig3 = await createTestPngAsset('SIGNATURE_A');
    const stamp1 = await createTestPngAsset('STAMP', 120, 120);
    const stamp2 = await createTestPngAsset('STAMP', 120, 120);

    const threePartyPdf = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'Директор', x: 50, y: 260, size: 11 },
        { text: 'А. Б. Серіков', x: 50, y: 195, size: 11 },
        { text: 'Бухгалтер', x: 230, y: 260, size: 11 },
        { text: 'И. И. Иванов', x: 230, y: 195, size: 11 },
        { text: 'Юрист', x: 410, y: 260, size: 11 },
        { text: 'Д. К. Алиева', x: 410, y: 195, size: 11 },
      ],
      lines: [
        { x1: 50, y1: 220, x2: 170, y2: 220 },
        { x1: 230, y1: 220, x2: 350, y2: 220 },
        { x1: 410, y1: 220, x2: 530, y2: 220 },
      ],
    });

    const signers: SignerConfig[] = [
      {
        id: 'S1',
        profile: { ...profileA, id: 'S1', roleNames: ['Бас директор', 'Директор'] },
        asset: sig1,
      },
      {
        id: 'S2',
        profile: { ...profileB, id: 'S2', roleNames: ['Бухгалтер'] },
        asset: sig2,
      },
      {
        id: 'S3',
        profile: {
          id: 'S3',
          fullName: 'Алиева Д. К.',
          nameVariants: ['Д. К. Алиева'],
          roleNames: ['Юрист'],
          signatureAssetId: sig3.id,
          enabled: true,
        },
        asset: sig3,
      },
    ];

    // 1. Signatures-only (0 stamps)
    const sigOnlyRes = await analyzePdfDocument({
      documentId: 'doc-sig-only',
      fileName: 'sig-only.pdf',
      bytes: threePartyPdf,
      signers: signers.slice(0, 2),
      stamps: [],
      disablePdfJsWorker: true,
    });
    expect(sigOnlyRes.status).toBe('AUTO_READY');
    expect(sigOnlyRes.signerResults?.every((s) => Boolean(s.anchor))).toBe(true);
    expect(sigOnlyRes.stampResults).toHaveLength(0);

    const exportedSigOnly = await exportStampedPdf({
      sourceBytes: threePartyPdf,
      documentResult: sigOnlyRes,
      signers: signers.slice(0, 2),
      stamps: [],
    });
    expect(exportedSigOnly.bytes.byteLength).toBeGreaterThan(100);

    // 2. 3 signers + 3 stamps (2 different stamps on S1 & S3, plus a second stamp on S1)
    const stamps: StampConfig[] = [
      { id: 'ST1', label: 'Stamp 1', policy: createDefaultStampPolicy('S1'), asset: stamp1 },
      { id: 'ST2', label: 'Stamp 2', policy: createDefaultStampPolicy('S1'), asset: stamp2 },
      { id: 'ST3', label: 'Stamp 3', policy: createDefaultStampPolicy('S3'), asset: stamp1 },
    ];
    const multiRes = await analyzePdfDocument({
      documentId: 'doc-multi',
      fileName: 'multi.pdf',
      bytes: threePartyPdf,
      signers,
      stamps,
      disablePdfJsWorker: true,
    });
    expect(multiRes.status).toBe('AUTO_READY');
    expect(multiRes.signerResults).toHaveLength(3);
    expect(multiRes.stampResults).toHaveLength(3);
    // Two stamps assigned to S1 must not land at identical coordinates
    const p1 = multiRes.stampResults![0]!.placement!.bounds;
    const p2 = multiRes.stampResults![1]!.placement!.bounds;
    expect(Math.hypot(p1.x - p2.x, p1.y - p2.y)).toBeGreaterThan(20);

    const exportedMulti = await exportStampedPdf({
      sourceBytes: threePartyPdf,
      documentResult: multiRes,
      signers,
      stamps,
    });
    expect(exportedMulti.pageCount).toBe(1);

    // 3. Missing signer routes to REVIEW_REQUIRED; skipping that signer allows export
    const twoPartyPdf = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'Директор', x: 50, y: 240, size: 11 },
        { text: 'А. Б. Серіков', x: 50, y: 175, size: 11 },
        { text: 'Бухгалтер', x: 330, y: 240, size: 11 },
        { text: 'И. И. Иванов', x: 330, y: 175, size: 11 },
      ],
      lines: [
        { x1: 50, y1: 200, x2: 190, y2: 200 },
        { x1: 330, y1: 200, x2: 470, y2: 200 },
      ],
    });

    const partialRes = await analyzePdfDocument({
      documentId: 'doc-partial',
      fileName: 'partial.pdf',
      bytes: twoPartyPdf,
      signers,
      stamps: stamps.slice(0, 1),
      disablePdfJsWorker: true,
    });
    expect(partialRes.status).toBe('REVIEW_REQUIRED');
    expect(partialRes.signerResults![2]!.anchor).toBeNull();

    const skippedS3 = revalidateMultiDocumentResult({
      doc: partialRes,
      signers,
      stamps: stamps.slice(0, 1),
      nextSignerEntries: partialRes.signerResults!.map((s) =>
        s.signerId === 'S3' ? { ...s, skipped: true } : s,
      ),
      manualApprovalConfirmed: true,
    });
    expect(skippedS3.status).toBe('AUTO_READY');
  });
});
