import type { LineCandidate, Rect, TextBlock } from '../../types';
import { computeOtsuThreshold, rgbaToGrayscale } from '../image-processing';

export interface OpenCvLike {
  Mat: new () => OpenCvMatLike;
  matFromImageData: (imageData: ImageData) => OpenCvMatLike;
  cvtColor: (src: OpenCvMatLike, dst: OpenCvMatLike, code: number) => void;
  adaptiveThreshold: (
    src: OpenCvMatLike,
    dst: OpenCvMatLike,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    c: number,
  ) => void;
  getStructuringElement: (shape: number, ksize: { width: number; height: number }) => OpenCvMatLike;
  morphologyEx: (src: OpenCvMatLike, dst: OpenCvMatLike, op: number, kernel: OpenCvMatLike) => void;
  HoughLinesP: (
    image: OpenCvMatLike,
    lines: OpenCvMatLike,
    rho: number,
    theta: number,
    threshold: number,
    minLineLength?: number,
    maxLineGap?: number,
  ) => void;
  COLOR_RGBA2GRAY: number;
  ADAPTIVE_THRESH_MEAN_C: number;
  THRESH_BINARY_INV: number;
  MORPH_RECT: number;
  MORPH_OPEN: number;
}

export interface OpenCvMatLike {
  rows: number;
  cols: number;
  data32S: Int32Array;
  delete: () => void;
}

/**
 * Pure-TypeScript morphological horizontal line detector on RGBA pixels.
 * Detects dark horizontal runs across rows, merges adjacent vertical rows into
 * line segments, and converts pixel bounds into scale-1 PDF point bounds.
 */
export function detectHorizontalLinesFromRgba(
  rgba: Uint8ClampedArray,
  pixelWidth: number,
  pixelHeight: number,
  renderScale: number,
  minLengthPt = 36,
): LineCandidate[] {
  const gray = rgbaToGrayscale(rgba, pixelWidth, pixelHeight);
  const otsu = computeOtsuThreshold(gray);
  const darkCutoff = Math.min(205, Math.max(95, otsu - 10));

  const minLengthPx = Math.max(12, Math.round(minLengthPt * renderScale));
  // Keep gap bridging tight (<=1pt) so adjacent glyphs/words never merge into phantom lines.
  const maxGapPx = Math.max(1, Math.round(1 * renderScale));
  const maxLineThicknessPx = Math.max(5, Math.round(5 * renderScale));

  interface RawSegment {
    y: number;
    x1: number;
    x2: number;
  }

  const rowSegments: RawSegment[] = [];

  for (let y = 1; y < pixelHeight - 1; y++) {
    let runStart = -1;
    let gapCount = 0;
    let darkCount = 0;

    for (let x = 0; x < pixelWidth; x++) {
      const isDark = (gray[y * pixelWidth + x] ?? 255) < darkCutoff;
      if (isDark) {
        if (runStart === -1) {
          runStart = x;
          darkCount = 0;
        }
        darkCount++;
        gapCount = 0;
      } else if (runStart !== -1) {
        gapCount++;
        if (gapCount > maxGapPx) {
          const runEnd = x - gapCount;
          const runLen = runEnd - runStart + 1;
          if (runLen >= minLengthPx && darkCount / runLen >= 0.78) {
            rowSegments.push({ y, x1: runStart, x2: runEnd });
          }
          runStart = -1;
          gapCount = 0;
          darkCount = 0;
        }
      }
    }
    if (runStart !== -1) {
      const runEnd = pixelWidth - 1 - gapCount;
      const runLen = runEnd - runStart + 1;
      if (runLen >= minLengthPx && darkCount / runLen >= 0.78) {
        rowSegments.push({ y, x1: runStart, x2: runEnd });
      }
    }
  }

  // Merge vertically adjacent segments with similar X span into clean line candidates
  const merged: Array<{ x1: number; x2: number; y1: number; y2: number }> = [];
  for (const seg of rowSegments) {
    let matched = false;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i]!;
      if (seg.y - m.y2 > 2) break;
      const overlap = Math.min(seg.x2, m.x2) - Math.max(seg.x1, m.x1);
      const minW = Math.min(seg.x2 - seg.x1, m.x2 - m.x1);
      if (overlap >= minW * 0.7 && m.y2 - m.y1 <= maxLineThicknessPx) {
        m.x1 = Math.min(m.x1, seg.x1);
        m.x2 = Math.max(m.x2, seg.x2);
        m.y2 = seg.y;
        matched = true;
        break;
      }
    }
    if (!matched) {
      merged.push({ x1: seg.x1, x2: seg.x2, y1: seg.y, y2: seg.y });
    }
  }

  // Filter out thick filled rectangles / solid bars and convert to PDF points
  const candidates: LineCandidate[] = [];
  for (let idx = 0; idx < merged.length; idx++) {
    const m = merged[idx]!;
    const pxThickness = m.y2 - m.y1 + 1;
    if (pxThickness > maxLineThicknessPx) continue;

    // Verify it is actually a thin line (not top edge of a big dark block):
    // check rows slightly above and below are mostly lighter
    const midX = Math.floor((m.x1 + m.x2) / 2);
    const sampleAboveY = Math.max(0, m.y1 - 3);
    const sampleBelowY = Math.min(pixelHeight - 1, m.y2 + 3);
    let darkAbove = 0;
    let darkBelow = 0;
    const samples = 5;
    for (let s = 0; s < samples; s++) {
      const sx = Math.min(
        pixelWidth - 1,
        Math.max(0, m.x1 + Math.floor(((m.x2 - m.x1) * (s + 0.5)) / samples)),
      );
      if ((gray[sampleAboveY * pixelWidth + sx] ?? 255) < darkCutoff) darkAbove++;
      if ((gray[sampleBelowY * pixelWidth + sx] ?? 255) < darkCutoff) darkBelow++;
    }
    if (darkAbove >= 4 && darkBelow >= 4 && midX >= 0) continue;

    const bounds: Rect = {
      x: m.x1 / renderScale,
      y: m.y1 / renderScale,
      width: (m.x2 - m.x1 + 1) / renderScale,
      height: Math.max(1, pxThickness / renderScale),
    };

    candidates.push({
      id: `vision-line-${idx}`,
      bounds,
      length: bounds.width,
      thickness: bounds.height,
      source: 'VISION',
      lineQualityScore: 0.6,
      isLikelyTableBorder: false,
    });
  }

  return deduplicateLines(candidates);
}

/**
 * OpenCV.js horizontal line extraction using adaptive thresholding, horizontal
 * morphological opening, and probabilistic Hough transform.
 */
export function detectHorizontalLinesWithOpenCV(
  cv: OpenCvLike,
  imageData: ImageData,
  renderScale: number,
  minLengthPt = 36,
): LineCandidate[] {
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const opened = new cv.Mat();
  const lines = new cv.Mat();
  const kernelSize = Math.max(15, Math.round(minLengthPt * renderScale * 0.65));
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, { width: kernelSize, height: 1 });

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, 10);
    cv.morphologyEx(binary, opened, cv.MORPH_OPEN, kernel);

    const minLengthPx = Math.max(12, Math.round(minLengthPt * renderScale));
    const maxGapPx = Math.max(2, Math.round(1.5 * renderScale));
    cv.HoughLinesP(opened, lines, 1, Math.PI / 180, 25, minLengthPx, maxGapPx);

    const candidates: LineCandidate[] = [];
    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4] ?? 0;
      const y1 = lines.data32S[i * 4 + 1] ?? 0;
      const x2 = lines.data32S[i * 4 + 2] ?? 0;
      const y2 = lines.data32S[i * 4 + 3] ?? 0;

      if (Math.abs(y2 - y1) > Math.max(4, 3 * renderScale)) continue;
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);

      const bounds: Rect = {
        x: left / renderScale,
        y: top / renderScale,
        width: (right - left) / renderScale,
        height: Math.max(1, (bottom - top + 1) / renderScale),
      };

      candidates.push({
        id: `cv-line-${i}`,
        bounds,
        length: bounds.width,
        thickness: bounds.height,
        source: 'VISION',
        lineQualityScore: 0.65,
        isLikelyTableBorder: false,
      });
    }

    return deduplicateLines(candidates);
  } finally {
    src.delete();
    gray.delete();
    binary.delete();
    opened.delete();
    lines.delete();
    kernel.delete();
  }
}

export function deduplicateLines(lines: LineCandidate[]): LineCandidate[] {
  const sorted = [...lines].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const result: LineCandidate[] = [];

  for (const line of sorted) {
    const existing = result.find((r) => {
      const yDiff = Math.abs(r.bounds.y - line.bounds.y);
      const overlapX =
        Math.min(r.bounds.x + r.bounds.width, line.bounds.x + line.bounds.width) -
        Math.max(r.bounds.x, line.bounds.x);
      return yDiff <= 4 && overlapX > Math.min(r.bounds.width, line.bounds.width) * 0.6;
    });

    if (existing) {
      const minX = Math.min(existing.bounds.x, line.bounds.x);
      const maxX = Math.max(existing.bounds.x + existing.bounds.width, line.bounds.x + line.bounds.width);
      existing.bounds = {
        x: minX,
        y: (existing.bounds.y + line.bounds.y) / 2,
        width: maxX - minX,
        height: Math.max(existing.bounds.height, line.bounds.height),
      };
      existing.length = existing.bounds.width;
    } else {
      result.push({ ...line });
    }
  }

  return result;
}

/**
 * Evaluates each horizontal line candidate in page context to distinguish genuine
 * signature lines from full-width decorative dividers, page headers, or dense table borders.
 */
export function scoreAndClassifyLineCandidates(
  lines: LineCandidate[],
  textBlocks: TextBlock[],
  pageWidth: number,
  pageHeight: number,
): LineCandidate[] {
  return lines.map((line) => {
    const widthRatio = pageWidth > 0 ? line.bounds.width / pageWidth : 0;

    // 1. Check if line looks like a full-page divider or top/bottom running rule
    const isFullWidthRule = widthRatio >= 0.72;
    const isTopMarginRule = line.bounds.y < pageHeight * 0.08;

    // 2. Check if line is part of a dense table grid (many evenly spaced horizontal lines with same x & width)
    const alignedSiblings = lines.filter(
      (other) =>
        other.id !== line.id &&
        Math.abs(other.bounds.x - line.bounds.x) <= 12 &&
        Math.abs(other.bounds.width - line.bounds.width) <= 18 &&
        Math.abs(other.bounds.y - line.bounds.y) <= 180,
    );
    const isDenseGrid = alignedSiblings.length >= 4;

    // 3. Check whether text directly sits ON TOP of the line (like an underlined heading) vs open space above it
    const textOverlappingLine = textBlocks.filter((tb) => {
      const xOverlap =
        Math.min(tb.bounds.x + tb.bounds.width, line.bounds.x + line.bounds.width) -
        Math.max(tb.bounds.x, line.bounds.x);
      if (xOverlap < Math.min(tb.bounds.width, line.bounds.width) * 0.4) return false;
      const tbBottom = tb.bounds.y + tb.bounds.height;
      // Text sitting right above/on the line (< 6pt above, non-underscore text)
      const isUnderscoreOnly = /^[_\s/]+$/.test(tb.text);
      return !isUnderscoreOnly && tbBottom >= line.bounds.y - 5 && tb.bounds.y <= line.bounds.y + 4;
    });

    const isTextUnderline = textOverlappingLine.length > 0;
    const isVisionTextArtifact =
      line.source === 'VISION' &&
      textOverlappingLine.some((tb) => {
        const tbBottom = tb.bounds.y + tb.bounds.height;
        return line.bounds.y < tbBottom - 2 && line.bounds.y + line.bounds.height > tb.bounds.y + 1.5;
      });
    const isLikelyTableBorder = isDenseGrid || isFullWidthRule || isVisionTextArtifact;

    let score = 0.65;
    if (line.bounds.width >= 55 && line.bounds.width <= 240) score += 0.2;
    else if (line.bounds.width < 35) score -= 0.25;

    if (isFullWidthRule) score -= 0.45;
    if (isDenseGrid) score -= 0.35;
    if (isTopMarginRule) score -= 0.2;
    if (isTextUnderline) score -= 0.4;
    if (isVisionTextArtifact) score = Math.min(score, 0.15);

    // Bonus if positioned in typical lower-half signature zone or near signature hint text
    if (line.bounds.y >= pageHeight * 0.35) score += 0.08;

    return {
      ...line,
      isLikelyTableBorder,
      lineQualityScore: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
    };
  });
}
