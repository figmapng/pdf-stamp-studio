import { describe, expect, it } from 'vitest';
import { analyzePdfDocument } from '../../src/engine/pipeline';
import { DEFAULT_STAMP_POLICY } from '../../src/engine/stamp-policy';
import { ocrWordsToTextBlocks, type OcrProvider } from '../../src/engine/ocr';
import type { PersonProfile, Rect } from '../../src/types';
import { createCustomPdfFixture, createTestPngAsset } from '../fixtures/pdfFixtureFactory';

interface GroundTruthCase {
  id: string;
  description: string;
  profileA: PersonProfile;
  profileB: PersonProfile;
  expectedPersonAPage: number | null;
  expectedPersonBPage: number | null;
  expectedLineA: Rect | null; // Visual top-left scale-1 coords (approx)
  expectedLineB: Rect | null;
  /** Whether AUTO_READY is permitted by ground truth (false for ambiguous/shared-surname/missing/signed) */
  shouldAllowAutoReady: boolean;
  buildPdf: () => Promise<{
    bytes: Uint8Array;
    ocrProvider?: OcrProvider;
    rasterizer?: {
      renderPageToRgba: (
        page: unknown,
        scale: number,
      ) => Promise<{ rgba: Uint8ClampedArray; width: number; height: number }>;
    };
  }>;
}

const baseA: PersonProfile = {
  id: 'PERSON_A',
  fullName: 'Серіков Асылбек Бекболатұлы',
  nameVariants: ['А. Б. Серіков', 'Серіков А.Б.', 'Serikov A.B.'],
  roleNames: ['Бас директор', 'Генеральный директор', 'Директор'],
  signatureAssetId: 'sig-a',
  enabled: true,
};

const baseB: PersonProfile = {
  id: 'PERSON_B',
  fullName: 'Иванов Иван Иванович',
  nameVariants: ['И. И. Иванов', 'Иванов И.И.', 'Ivanov I.I.'],
  roleNames: ['Главный бухгалтер', 'Бас есепші', 'Орындаушы', 'Исполнитель'],
  signatureAssetId: 'sig-b',
  enabled: true,
};

function lineCenterDist(a: Rect, b: Rect): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function makeScannedSupport(lines: Array<{ x1: number; x2: number; y: number }>, words: Array<{ text: string; x: number; y: number; w: number }>) {
  const rasterizer = {
    async renderPageToRgba(_page: unknown, scale: number) {
      const w = Math.round(595 * scale);
      const h = Math.round(842 * scale);
      const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
      for (const l of lines) {
        const y = Math.round(l.y * scale);
        const x1 = Math.round(l.x1 * scale);
        const x2 = Math.round(l.x2 * scale);
        for (let dy = 0; dy < 3; dy++) {
          for (let x = x1; x <= x2; x++) {
            const idx = ((y + dy) * w + x) * 4;
            rgba[idx] = 10;
            rgba[idx + 1] = 10;
            rgba[idx + 2] = 10;
            rgba[idx + 3] = 255;
          }
        }
      }
      return { rgba, width: w, height: h };
    },
  };

  const ocrProvider: OcrProvider = {
    async recognizeRgba(_rgba, _w, _h, pageIndex, scale) {
      const textBlocks = ocrWordsToTextBlocks(
        words.map((w) => ({
          text: w.text,
          x0: w.x * scale,
          y0: w.y * scale,
          x1: (w.x + w.w) * scale,
          y1: (w.y + 12) * scale,
          confidence: 92,
        })),
        pageIndex,
        scale,
      );
      return { textBlocks, warnings: [] };
    },
    async terminate() {},
  };

  return { rasterizer, ocrProvider };
}

function buildDataset(): GroundTruthCase[] {
  const cases: GroundTruthCase[] = [];

  // 1..6: Standard two-column contracts (varied positions & languages)
  for (let i = 0; i < 6; i++) {
    const yPdf = 150 + i * 25;
    const visualLineY = 842 - yPdf;
    cases.push({
      id: `digital-2col-${i + 1}`,
      description: `Digital 2-column contract variant #${i + 1}`,
      profileA: baseA,
      profileB: baseB,
      expectedPersonAPage: 0,
      expectedPersonBPage: 0,
      expectedLineA: { x: 60, y: visualLineY, width: 140, height: 1 },
      expectedLineB: { x: 340, y: visualLineY, width: 140, height: 1 },
      shouldAllowAutoReady: true,
      buildPdf: async () => ({
        bytes: await createCustomPdfFixture({
          texts: [
            { text: i % 2 === 0 ? 'Бас директор' : 'Генеральный директор', x: 60, y: yPdf + 35 },
            { text: i % 2 === 0 ? 'А. Б. Серіков' : 'Серіков А.Б.', x: 60, y: yPdf - 22 },
            { text: i % 2 === 0 ? 'Бас есепші' : 'Главный бухгалтер', x: 340, y: yPdf + 35 },
            { text: i % 2 === 0 ? 'И. И. Иванов' : 'Иванов И.И.', x: 340, y: yPdf - 22 },
          ],
          lines: [
            { x1: 60, y1: yPdf, x2: 200, y2: yPdf },
            { x1: 340, y1: yPdf, x2: 480, y2: yPdf },
          ],
        }),
      }),
    });
  }

  // 7..10: Inline & stacked single-column layouts on multi-page docs (body mention on page 1, signature on last page)
  for (let i = 0; i < 4; i++) {
    const pageCount = i + 2;
    const lastIdx = pageCount - 1;
    cases.push({
      id: `multipage-inline-${i + 1}`,
      description: `${pageCount}-page contract with body mention on p1 and inline signature on p${pageCount}`,
      profileA: baseA,
      profileB: baseB,
      expectedPersonAPage: lastIdx,
      expectedPersonBPage: lastIdx,
      expectedLineA: { x: 185, y: 842 - 260, width: 110, height: 1 },
      expectedLineB: { x: 185, y: 842 - 170, width: 110, height: 1 },
      shouldAllowAutoReady: true,
      buildPdf: async () => ({
        bytes: await createCustomPdfFixture({
          pageCount,
          texts: [
            {
              pageIndex: 0,
              text: 'Осы шарт Бас директор Серіков Асылбек Бекболатұлы атынан жасалды.',
              x: 55,
              y: 720,
            },
            { pageIndex: lastIdx, text: 'Бас директор', x: 55, y: 262 },
            { pageIndex: lastIdx, text: 'А. Б. Серіков', x: 315, y: 262 },
            { pageIndex: lastIdx, text: 'Исполнитель', x: 55, y: 172 },
            { pageIndex: lastIdx, text: 'И. И. Иванов', x: 315, y: 172 },
          ],
          lines: [
            { pageIndex: lastIdx, x1: 185, y1: 260, x2: 295, y2: 260 },
            { pageIndex: lastIdx, x1: 185, y1: 170, x2: 295, y2: 170 },
          ],
        }),
      }),
    });
  }

  // 11..13: Underscore text placeholder signatures (no vector lines)
  for (let i = 0; i < 3; i++) {
    cases.push({
      id: `underscore-digital-${i + 1}`,
      description: `Digital document using underscore text signature lines #${i + 1}`,
      profileA: baseA,
      profileB: baseB,
      expectedPersonAPage: 0,
      expectedPersonBPage: 0,
      expectedLineA: { x: 175, y: 842 - 240, width: 95, height: 1.5 },
      expectedLineB: { x: 175, y: 842 - 160, width: 95, height: 1.5 },
      shouldAllowAutoReady: true,
      buildPdf: async () => ({
        bytes: await createCustomPdfFixture({
          texts: [
            { text: 'Директор', x: 55, y: 240 },
            { text: '________________', x: 175, y: 240 },
            { text: 'Serikov A.B.', x: 300, y: 240 },
            { text: 'Главный бухгалтер', x: 55, y: 160 },
            { text: '________________', x: 175, y: 160 },
            { text: 'Ivanov I.I.', x: 300, y: 160 },
          ],
        }),
      }),
    });
  }

  // 14..16: Scanned PDFs with CV horizontal lines + OCR
  for (let i = 0; i < 3; i++) {
    const yVis = 590 + i * 25;
    cases.push({
      id: `scanned-ocr-${i + 1}`,
      description: `Scanned PDF with CV line detection + OCR #${i + 1}`,
      profileA: baseA,
      profileB: baseB,
      expectedPersonAPage: 0,
      expectedPersonBPage: 0,
      expectedLineA: { x: 70, y: yVis, width: 130, height: 2 },
      expectedLineB: { x: 340, y: yVis, width: 130, height: 2 },
      shouldAllowAutoReady: true,
      buildPdf: async () => {
        const support = makeScannedSupport(
          [
            { x1: 70, x2: 200, y: yVis },
            { x1: 340, x2: 470, y: yVis },
          ],
          [
            { text: 'Бас', x: 70, y: yVis - 30, w: 30 },
            { text: 'директор', x: 105, y: yVis - 30, w: 65 },
            { text: 'А.', x: 70, y: yVis + 18, w: 12 },
            { text: 'Б.', x: 86, y: yVis + 18, w: 12 },
            { text: 'Серіков', x: 102, y: yVis + 18, w: 60 },
            { text: 'Орындаушы', x: 340, y: yVis - 30, w: 80 },
            { text: 'И.', x: 340, y: yVis + 18, w: 12 },
            { text: 'И.', x: 356, y: yVis + 18, w: 12 },
            { text: 'Иванов', x: 372, y: yVis + 18, w: 58 },
          ],
        );
        return {
          bytes: await createCustomPdfFixture({ embedImageOnPages: [0] }),
          ...support,
        };
      },
    });
  }

  // 17..18: Mixed PDFs (page 1 digital, page 2 scanned)
  for (let i = 0; i < 2; i++) {
    cases.push({
      id: `mixed-pdf-${i + 1}`,
      description: `Mixed digital+scanned PDF #${i + 1}`,
      profileA: baseA,
      profileB: baseB,
      expectedPersonAPage: 1,
      expectedPersonBPage: 1,
      expectedLineA: { x: 75, y: 610, width: 130, height: 2 },
      expectedLineB: { x: 335, y: 610, width: 130, height: 2 },
      shouldAllowAutoReady: true,
      buildPdf: async () => {
        const support = makeScannedSupport(
          [
            { x1: 75, x2: 205, y: 610 },
            { x1: 335, x2: 465, y: 610 },
          ],
          [
            { text: 'Генеральный', x: 75, y: 580, w: 75 },
            { text: 'директор', x: 155, y: 580, w: 55 },
            { text: 'А.', x: 75, y: 628, w: 12 },
            { text: 'Б.', x: 91, y: 628, w: 12 },
            { text: 'Серіков', x: 107, y: 628, w: 60 },
            { text: 'Главный', x: 335, y: 580, w: 55 },
            { text: 'бухгалтер', x: 395, y: 580, w: 65 },
            { text: 'И.', x: 335, y: 628, w: 12 },
            { text: 'И.', x: 351, y: 628, w: 12 },
            { text: 'Иванов', x: 367, y: 628, w: 58 },
          ],
        );
        return {
          bytes: await createCustomPdfFixture({
            pageCount: 2,
            texts: [{ pageIndex: 0, text: 'АКТ СВЕРКИ РАСЧЕТОВ', x: 160, y: 760 }],
            embedImageOnPages: [1],
          }),
          ...support,
        };
      },
    });
  }

  // 19..24: Adversarial / Safety Cases (MUST NEVER AUTO_READY!)
  // 19: Shared surname only (A and B both Akhmetov, document says only "Ахметов")
  cases.push({
    id: 'adversarial-shared-surname',
    description: 'Shared surname collision must force REVIEW_REQUIRED',
    profileA: {
      ...baseA,
      fullName: 'Ахметов Марат Сейітұлы',
      nameVariants: ['М. С. Ахметов'],
    },
    profileB: {
      ...baseB,
      fullName: 'Ахметов Дамир Болатұлы',
      nameVariants: ['Д. Б. Ахметов'],
    },
    expectedPersonAPage: null,
    expectedPersonBPage: null,
    expectedLineA: null,
    expectedLineB: null,
    shouldAllowAutoReady: false,
    buildPdf: async () => ({
      bytes: await createCustomPdfFixture({
        texts: [
          { text: 'Бас директор', x: 60, y: 240 },
          { text: 'Ахметов', x: 60, y: 175 },
          { text: 'Орындаушы', x: 340, y: 240 },
          { text: 'Ахметов', x: 340, y: 175 },
        ],
        lines: [
          { x1: 60, y1: 200, x2: 200, y2: 200 },
          { x1: 340, y1: 200, x2: 480, y2: 200 },
        ],
      }),
    }),
  });

  // 20: Missing Person B (must NOT auto-ready, must NOT move stamp)
  cases.push({
    id: 'adversarial-missing-person-b',
    description: 'Missing Person B must block/review',
    profileA: baseA,
    profileB: baseB,
    expectedPersonAPage: 0,
    expectedPersonBPage: null,
    expectedLineA: { x: 60, y: 842 - 200, width: 140, height: 1 },
    expectedLineB: null,
    shouldAllowAutoReady: false,
    buildPdf: async () => ({
      bytes: await createCustomPdfFixture({
        texts: [
          { text: 'Бас директор', x: 60, y: 240 },
          { text: 'А. Б. Серіков', x: 60, y: 175 },
        ],
        lines: [{ x1: 60, y1: 200, x2: 200, y2: 200 }],
      }),
    }),
  });

  // 21: Duplicate identical signature blocks on page 1 and page 2 (ambiguous!)
  cases.push({
    id: 'adversarial-duplicate-blocks',
    description: 'Two identical candidate blocks on p1 and p2 must flag ambiguity',
    profileA: baseA,
    profileB: baseB,
    expectedPersonAPage: 0,
    expectedPersonBPage: 0,
    expectedLineA: null,
    expectedLineB: null,
    shouldAllowAutoReady: false,
    buildPdf: async () => ({
      bytes: await createCustomPdfFixture({
        pageCount: 2,
        texts: [
          { pageIndex: 0, text: 'Бас директор', x: 60, y: 240 },
          { pageIndex: 0, text: 'А. Б. Серіков', x: 60, y: 175 },
          { pageIndex: 0, text: 'Главный бухгалтер', x: 340, y: 240 },
          { pageIndex: 0, text: 'И. И. Иванов', x: 340, y: 175 },
          { pageIndex: 1, text: 'Бас директор', x: 60, y: 240 },
          { pageIndex: 1, text: 'А. Б. Серіков', x: 60, y: 175 },
          { pageIndex: 1, text: 'Главный бухгалтер', x: 340, y: 240 },
          { pageIndex: 1, text: 'И. И. Иванов', x: 340, y: 175 },
        ],
        lines: [
          { pageIndex: 0, x1: 60, y1: 200, x2: 200, y2: 200 },
          { pageIndex: 0, x1: 340, y1: 200, x2: 480, y2: 200 },
          { pageIndex: 1, x1: 60, y1: 200, x2: 200, y2: 200 },
          { pageIndex: 1, x1: 340, y1: 200, x2: 480, y2: 200 },
        ],
      }),
    }),
  });

  // 22: Single shared line conflict
  cases.push({
    id: 'adversarial-shared-line-conflict',
    description: 'Both names pointing to a single shared line must not auto-approve',
    profileA: baseA,
    profileB: baseB,
    expectedPersonAPage: null,
    expectedPersonBPage: null,
    expectedLineA: null,
    expectedLineB: null,
    shouldAllowAutoReady: false,
    buildPdf: async () => ({
      bytes: await createCustomPdfFixture({
        texts: [
          { text: 'А. Б. Серіков / И. И. Иванов', x: 80, y: 230 },
        ],
        lines: [{ x1: 80, y1: 200, x2: 260, y2: 200 }],
      }),
    }),
  });

  // 23: Cryptographically signed PDF
  cases.push({
    id: 'adversarial-crypto-signed',
    description: 'PDF with digital signature dictionary must require acknowledgement',
    profileA: baseA,
    profileB: baseB,
    expectedPersonAPage: 0,
    expectedPersonBPage: 0,
    expectedLineA: { x: 60, y: 842 - 200, width: 140, height: 1 },
    expectedLineB: { x: 340, y: 842 - 200, width: 140, height: 1 },
    shouldAllowAutoReady: false,
    buildPdf: async () => ({
      bytes: await createCustomPdfFixture({
        texts: [
          { text: 'Бас директор', x: 60, y: 240 },
          { text: 'А. Б. Серіков', x: 60, y: 175 },
          { text: 'Главный бухгалтер', x: 340, y: 240 },
          { text: 'И. И. Иванов', x: 340, y: 175 },
        ],
        lines: [
          { x1: 60, y1: 200, x2: 200, y2: 200 },
          { x1: 340, y1: 200, x2: 480, y2: 200 },
        ],
        addSimulatedDigitalSignature: true,
      }),
    }),
  });

  // 24: Corrupted PDF bytes
  cases.push({
    id: 'adversarial-corrupted-pdf',
    description: 'Corrupted non-PDF bytes must fail safely as BLOCKED',
    profileA: baseA,
    profileB: baseB,
    expectedPersonAPage: null,
    expectedPersonBPage: null,
    expectedLineA: null,
    expectedLineB: null,
    shouldAllowAutoReady: false,
    buildPdf: async () => ({
      bytes: new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]),
    }),
  });

  return cases;
}

describe('Annotated Benchmark Accuracy Suite (24 documents)', () => {
  it('measures precision, recall, wrong-person rate, and false auto-approval rate', async () => {
    const sigA = await createTestPngAsset('SIGNATURE_A');
    const sigB = await createTestPngAsset('SIGNATURE_B');
    const stamp = await createTestPngAsset('STAMP', 120, 120);

    const dataset = buildDataset();
    let personExpected = 0;
    let personTP = 0;
    let personFP = 0;
    let anchorExpected = 0;
    let anchorTP = 0;
    let anchorFP = 0;
    let wrongPersonAssignments = 0;
    let falseAutoApprovals = 0;
    let stampExpected = 0;
    let stampAccurate = 0;
    let reviewCount = 0;
    let blockedCount = 0;
    let unexpectedFailures = 0;

    for (const tc of dataset) {
      const built = await tc.buildPdf();
      const res = await analyzePdfDocument({
        documentId: tc.id,
        fileName: `${tc.id}.pdf`,
        bytes: built.bytes,
        profileA: tc.profileA,
        profileB: tc.profileB,
        assets: { signatureA: sigA, signatureB: sigB, stamp },
        stampPolicy: DEFAULT_STAMP_POLICY,
        ocrProvider: built.ocrProvider ?? null,
        rasterizer: built.rasterizer ?? null,
        disablePdfJsWorker: true,
      });

      if (res.status === 'AUTO_READY' && !tc.shouldAllowAutoReady) {
        falseAutoApprovals++;
      }
      if (res.status === 'REVIEW_REQUIRED') reviewCount++;
      if (res.status === 'BLOCKED') blockedCount++;

      // Check Person A & B detection
      if (tc.expectedPersonAPage !== null) {
        personExpected++;
        if (res.signatures.personA?.pageIndex === tc.expectedPersonAPage) {
          personTP++;
        }
      } else if (res.signatures.personA && res.signatures.personA.status === 'AUTO_READY') {
        personFP++;
      }

      if (tc.expectedPersonBPage !== null) {
        personExpected++;
        if (res.signatures.personB?.pageIndex === tc.expectedPersonBPage) {
          personTP++;
        }
      } else if (res.signatures.personB && res.signatures.personB.status === 'AUTO_READY') {
        personFP++;
      }

      // Check Anchor geometry accuracy (center within 45pt) & wrong-person swap
      if (tc.expectedLineA) {
        anchorExpected++;
        if (res.signatures.personA && res.signatures.personA.pageIndex === tc.expectedPersonAPage) {
          const d = lineCenterDist(res.signatures.personA.lineBounds, tc.expectedLineA);
          if (d <= 45) anchorTP++;
          else anchorFP++;
        }
        if (
          res.signatures.personB &&
          res.signatures.personB.pageIndex === tc.expectedPersonAPage &&
          lineCenterDist(res.signatures.personB.lineBounds, tc.expectedLineA) <= 35
        ) {
          wrongPersonAssignments++;
        }
      }

      if (tc.expectedLineB) {
        anchorExpected++;
        if (res.signatures.personB && res.signatures.personB.pageIndex === tc.expectedPersonBPage) {
          const d = lineCenterDist(res.signatures.personB.lineBounds, tc.expectedLineB);
          if (d <= 45) anchorTP++;
          else anchorFP++;
        }
        if (
          res.signatures.personA &&
          res.signatures.personA.pageIndex === tc.expectedPersonBPage &&
          lineCenterDist(res.signatures.personA.lineBounds, tc.expectedLineB) <= 35
        ) {
          wrongPersonAssignments++;
        }
      }

      // Stamp accuracy on auto-ready eligible docs
      if (tc.shouldAllowAutoReady) {
        stampExpected++;
        if (
          res.stamp.count === 1 &&
          res.stamp.owner === 'PERSON_A' &&
          res.stamp.placement?.pageIndex === tc.expectedPersonAPage
        ) {
          stampAccurate++;
        } else {
          unexpectedFailures++;
        }
      }
    }

    const personPrecision = personTP / Math.max(1, personTP + personFP);
    const personRecall = personTP / Math.max(1, personExpected);
    const anchorPrecision = anchorTP / Math.max(1, anchorTP + anchorFP);
    const anchorRecall = anchorTP / Math.max(1, anchorExpected);
    const stampAccuracy = stampAccurate / Math.max(1, stampExpected);

    console.log(
      '[BENCHMARK METRICS]',
      JSON.stringify(
        {
          totalDocs: dataset.length,
          personPrecision: Number(personPrecision.toFixed(4)),
          personRecall: Number(personRecall.toFixed(4)),
          anchorPrecision: Number(anchorPrecision.toFixed(4)),
          anchorRecall: Number(anchorRecall.toFixed(4)),
          wrongPersonAssignments,
          falseAutoApprovals,
          stampAccuracy: Number(stampAccuracy.toFixed(4)),
          reviewCount,
          blockedCount,
          unexpectedFailures,
        },
        null,
        2,
      ),
    );

    expect(wrongPersonAssignments).toBe(0);
    expect(falseAutoApprovals).toBe(0);
    expect(personPrecision).toBeGreaterThanOrEqual(0.95);
    expect(personRecall).toBeGreaterThanOrEqual(0.95);
    expect(anchorPrecision).toBeGreaterThanOrEqual(0.95);
    expect(anchorRecall).toBeGreaterThanOrEqual(0.95);
    expect(stampAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(unexpectedFailures).toBe(0);
    expect(reviewCount).toBeLessThanOrEqual(6);
  });
});
