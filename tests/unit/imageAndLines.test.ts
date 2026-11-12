import { describe, expect, it } from 'vitest';
import { inspectPngBytes, removeBackgroundFromRgba } from '../../src/engine/image-processing';
import {
  detectHorizontalLinesFromRgba,
  scoreAndClassifyLineCandidates,
} from '../../src/engine/line-detection';
import { createTestPngBytes } from '../fixtures/pdfFixtureFactory';

describe('PNG Transparency Inspector & Horizontal Line Detection', () => {
  it('verifies PNG alpha transparency and computes exact opaqueBounds & padding ratios', async () => {
    const pngBytes = await createTestPngBytes({
      width: 200,
      height: 100,
      padLeft: 20,
      padRight: 40,
      padTop: 10,
      padBottom: 30,
    });

    const res = await inspectPngBytes(pngBytes);
    expect(res.isValid).toBe(true);
    expect(res.width).toBe(200);
    expect(res.height).toBe(100);
    expect(res.hasAlphaTransparency).toBe(true);
    expect(res.opaqueBounds).toEqual({ x: 20, y: 10, width: 140, height: 60 });
    expect(res.transparentPaddingRatio).toEqual({
      left: 10,
      right: 20,
      top: 10,
      bottom: 30,
    });
  });

  it('rejects completely transparent PNGs and non-PNG files', async () => {
    const emptyPng = await createTestPngBytes({ transparentAll: true });
    const emptyRes = await inspectPngBytes(emptyPng);
    expect(emptyRes.isValid).toBe(false);

    const fakeJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const jpgRes = await inspectPngBytes(fakeJpg);
    expect(jpgRes.isValid).toBe(false);
  });

  it('detects horizontal signature lines in RGBA buffer and penalizes dense table grids', () => {
    const w = 600;
    const h = 400;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);

    const drawHLine = (x1: number, x2: number, y: number, thickness = 2) => {
      for (let dy = 0; dy < thickness; dy++) {
        for (let x = x1; x <= x2; x++) {
          const idx = ((y + dy) * w + x) * 4;
          rgba[idx] = 10;
          rgba[idx + 1] = 10;
          rgba[idx + 2] = 10;
          rgba[idx + 3] = 255;
        }
      }
    };

    // Draw a 5-row table grid at top (y=40..160)
    for (let row = 0; row < 5; row++) {
      drawHLine(50, 350, 40 + row * 28, 2);
    }

    // Draw an isolated signature line at bottom (y=320)
    drawHLine(80, 230, 320, 2);

    const rawLines = detectHorizontalLinesFromRgba(rgba, w, h, 1);
    expect(rawLines.length).toBeGreaterThanOrEqual(6);

    const scored = scoreAndClassifyLineCandidates(rawLines, [], w, h);
    const tableLine = scored.find((l) => Math.abs(l.bounds.y - 68) <= 4);
    const sigLine = scored.find((l) => Math.abs(l.bounds.y - 320) <= 4);

    expect(tableLine).toBeDefined();
    expect(sigLine).toBeDefined();
    expect(tableLine!.isLikelyTableBorder).toBe(true);
    expect(sigLine!.isLikelyTableBorder).toBe(false);
    expect(sigLine!.lineQualityScore).toBeGreaterThan(tableLine!.lineQualityScore);
  });

  it('removes paper background (including interior loops) while preserving colored/dark ink and cropping margins', () => {
    const w = 160;
    const h = 100;
    const rgba = new Uint8ClampedArray(w * h * 4);

    // Fill image with shaded off-white paper gradient (top-left 235 -> bottom-right 205)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const shade = Math.round(235 - ((x + y) / (w + h)) * 30);
        rgba[p] = shade;
        rgba[p + 1] = shade;
        rgba[p + 2] = shade - 2;
        rgba[p + 3] = 255;
      }
    }

    // Draw a hollow blue stamp ring centered at (80, 50) radius 22..25 (blank paper remains inside r < 22)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - 80, y - 50);
        if (d >= 22 && d <= 25) {
          const p = (y * w + x) * 4;
          rgba[p] = 29;
          rgba[p + 1] = 78;
          rgba[p + 2] = 216;
          rgba[p + 3] = 255;
        }
      }
    }

    const res = removeBackgroundFromRgba(rgba, w, h);
    expect(res.removedPixels).toBeGreaterThan(10000);
    // Tightly cropped around ring [55..105] x [25..75] + 2px padding
    expect(res.width).toBeLessThan(65);
    expect(res.height).toBeLessThan(65);

    // Center inside the hollow stamp ring must be transparent (alpha = 0), not opaque white
    const centerX = Math.floor(res.width / 2);
    const centerY = Math.floor(res.height / 2);
    const centerAlpha = res.rgba[(centerY * res.width + centerX) * 4 + 3];
    expect(centerAlpha).toBe(0);

    // Ring pixels must still be opaque blue
    let blueOpaqueCount = 0;
    for (let i = 0; i < res.rgba.length; i += 4) {
      if ((res.rgba[i + 3] ?? 0) > 200 && (res.rgba[i + 2] ?? 0) > 150) {
        blueOpaqueCount++;
      }
    }
    expect(blueOpaqueCount).toBeGreaterThan(200);
  });
});
