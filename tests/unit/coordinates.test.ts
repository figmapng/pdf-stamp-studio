import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  clampRectWithinPage,
  pdfPointToVisualPoint,
  visualPointToPdfPoint,
  visualRectToPdfDrawParams,
} from '../../src/engine/placement/coordinates';
import { loadPdfJs } from '../../src/engine/pdf-parser';
import { computeSignaturePlacementBounds } from '../../src/engine/anchor-detection';
import { degrees } from 'pdf-lib';

describe('Coordinate Conversions (MediaBox, CropBox, Page Rotations 0/90/180/270)', () => {
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];

  it.each(rotations)(
    'roundtrips visual <-> PDF points for rotation=%i with non-zero CropBox',
    (rotation) => {
      const cropBox = { x: 30, y: 40, width: 500, height: 700 };
      const vx = 123.5;
      const vy = 245.25;

      const pdfPt = visualPointToPdfPoint(vx, vy, { cropBox, rotation });
      const back = pdfPointToVisualPoint(pdfPt.x, pdfPt.y, { cropBox, rotation });

      expect(back.x).toBeCloseTo(vx, 4);
      expect(back.y).toBeCloseTo(vy, 4);
    },
  );

  it.each(rotations)(
    'matches PDF.js PageViewport transform across rotation=%i and CropBox',
    async (rotation) => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);
      page.setCropBox(30, 40, 500, 700);
      page.setRotation(degrees(rotation));
      const bytes = await doc.save();

      const pdfJs = await loadPdfJs({ disableWorker: true });
      const task = pdfJs.getDocument({ data: bytes, disableWorker: true });
      const pdfDoc = await task.promise;
      const pdfPage = await pdfDoc.getPage(1);
      const viewport = pdfPage.getViewport({ scale: 1 });

      const cropBox = page.getCropBox();
      const visualRect = { x: 110, y: 180, width: 120, height: 60 };
      const drawParams = visualRectToPdfDrawParams(visualRect, 0, { cropBox, rotation });

      // Transform pdf-lib bottom-left origin & top-right of unrotated box into PDF.js viewport
      // Wait: for rotation R, pdf-lib draws rotated by R degrees CCW around (drawParams.x, drawParams.y).
      const rad = (drawParams.rotateDegrees * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      // Local corners in pdf-lib before rotation: (0,0)=BL, (w,0)=BR, (w,h)=TR, (0,h)=TL
      const localCorners: Array<[number, number]> = [
        [0, 0],
        [drawParams.width, 0],
        [drawParams.width, drawParams.height],
        [0, drawParams.height],
      ];

      const visualXs: number[] = [];
      const visualYs: number[] = [];
      for (const [lx, ly] of localCorners) {
        const px = drawParams.x + lx * cos - ly * sin;
        const py = drawParams.y + lx * sin + ly * cos;
        const [vx, vy] = viewport.convertToViewportPoint(px, py);
        visualXs.push(vx);
        visualYs.push(vy);
      }

      const minVx = Math.min(...visualXs);
      const maxVx = Math.max(...visualXs);
      const minVy = Math.min(...visualYs);
      const maxVy = Math.max(...visualYs);

      expect(minVx).toBeCloseTo(visualRect.x, 1);
      expect(minVy).toBeCloseTo(visualRect.y, 1);
      expect(maxVx - minVx).toBeCloseTo(visualRect.width, 1);
      expect(maxVy - minVy).toBeCloseTo(visualRect.height, 1);

      await pdfDoc.cleanup();
      await task.destroy();
    },
  );

  it('rotates stamp around its visual center accurately', () => {
    const cropBox = { x: 0, y: 0, width: 595, height: 842 };
    const rect = { x: 200, y: 300, width: 100, height: 100 };
    const params = visualRectToPdfDrawParams(rect, 90, { cropBox, rotation: 0 });
    // Rotating a 100x100 square 90deg CW around center (250, 350):
    // visual local BL (-50, +50) rotated 90deg CW -> (-50, -50) from center -> (200, 300) in visual!
    // In PDF space (height=842): y = 842 - 300 = 542, x = 200, pdf-lib rotate = -90 (270 deg CCW).
    expect(params.x).toBeCloseTo(200, 2);
    expect(params.y).toBeCloseTo(542, 2);
    expect(params.rotateDegrees).toBe(270);
  });

  it('clamps rectangles cleanly inside visible page bounds', () => {
    const clamped = clampRectWithinPage({ x: 560, y: -10, width: 100, height: 50 }, 595, 842);
    expect(clamped.x).toBe(495);
    expect(clamped.y).toBe(0);
    expect(clamped.width).toBe(100);
    expect(clamped.height).toBe(50);
  });

  it('anchors signature resting across an inline underscore line rather than floating too high', () => {
    const lineBounds = { x: 200, y: 650, width: 140, height: 1.5 };
    const mergedRowText = {
      id: 'txt-row',
      text: 'Инженер-химик   ____________   Затыбек А. А.',
      normalizedText: 'инженер химик затыбек а а',
      bounds: { x: 90, y: 641, width: 350, height: 11 },
      pageIndex: 0,
      source: 'DIGITAL_TEXT' as const,
    };
    const { placementBounds } = computeSignaturePlacementBounds(
      lineBounds,
      595,
      842,
      [mergedRowText],
    );

    // Bottom edge of the signature box should straddle/extend slightly onto the signature line (>= 650)
    // instead of floating above lineBounds.y.
    const bottomEdge = placementBounds.y + placementBounds.height;
    expect(bottomEdge).toBeGreaterThanOrEqual(lineBounds.y);
    expect(placementBounds.y).toBeGreaterThan(lineBounds.y - placementBounds.height);
  });
});
