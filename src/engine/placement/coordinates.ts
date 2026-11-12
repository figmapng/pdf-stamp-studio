import type { PageGeometry, Rect } from '../../types';

export interface PdfDrawImageParams {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Counter-clockwise rotation angle in degrees for pdf-lib's `degrees(rotateDegrees)`. */
  rotateDegrees: number;
}

/**
 * Converts a point in canonical visual top-left space (post-CropBox, post-page-rotation, scale=1)
 * to PDF user-space coordinates (bottom-left unrotated MediaBox coordinates).
 */
export function visualPointToPdfPoint(
  vx: number,
  vy: number,
  geometry: Pick<PageGeometry, 'cropBox' | 'rotation'>,
): { x: number; y: number } {
  const { cropBox, rotation } = geometry;
  switch (rotation) {
    case 90:
      return {
        x: cropBox.x + vy,
        y: cropBox.y + vx,
      };
    case 180:
      return {
        x: cropBox.x + cropBox.width - vx,
        y: cropBox.y + vy,
      };
    case 270:
      return {
        x: cropBox.x + cropBox.width - vy,
        y: cropBox.y + cropBox.height - vx,
      };
    case 0:
    default:
      return {
        x: cropBox.x + vx,
        y: cropBox.y + cropBox.height - vy,
      };
  }
}

/**
 * Converts a PDF user-space point to canonical visual top-left space (scale=1).
 */
export function pdfPointToVisualPoint(
  px: number,
  py: number,
  geometry: Pick<PageGeometry, 'cropBox' | 'rotation'>,
): { x: number; y: number } {
  const { cropBox, rotation } = geometry;
  const ux = px - cropBox.x;
  const uy = py - cropBox.y;
  switch (rotation) {
    case 90:
      return { x: uy, y: ux };
    case 180:
      return { x: cropBox.width - ux, y: uy };
    case 270:
      return { x: cropBox.height - uy, y: cropBox.width - ux };
    case 0:
    default:
      return { x: ux, y: cropBox.height - uy };
  }
}

/**
 * Computes exact `pdf-lib` `page.drawImage(...)` parameters from a canonical visual Rect
 * and a clockwise visual rotation around the rectangle's center.
 * Handles PDF page rotations (0, 90, 180, 270) and CropBox offsets accurately.
 */
export function visualRectToPdfDrawParams(
  visualRect: Rect,
  visualRotationDeg: number,
  geometry: Pick<PageGeometry, 'cropBox' | 'rotation'>,
): PdfDrawImageParams {
  const w = visualRect.width;
  const h = visualRect.height;
  const cx = visualRect.x + w / 2;
  const cy = visualRect.y + h / 2;

  // In visual screen space (+x right, +y down), unrotated bottom-left offset from center is (-w/2, +h/2).
  // Rotating clockwise by visualRotationDeg gives the visual position of pdf-lib's drawImage origin (bottom-left).
  const rad = (visualRotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = -w / 2;
  const dy = h / 2;

  const blVx = cx + dx * cos - dy * sin;
  const blVy = cy + dx * sin + dy * cos;

  const pdfBottomLeft = visualPointToPdfPoint(blVx, blVy, geometry);
  const rotateDegrees = (((geometry.rotation - visualRotationDeg) % 360) + 360) % 360;

  return {
    x: Number(pdfBottomLeft.x.toFixed(4)),
    y: Number(pdfBottomLeft.y.toFixed(4)),
    width: Number(w.toFixed(4)),
    height: Number(h.toFixed(4)),
    rotateDegrees,
  };
}

/**
 * Clamps a placement Rect to stay strictly within the visible page bounds.
 */
export function clampRectWithinPage(rect: Rect, pageWidth: number, pageHeight: number): Rect {
  const w = Math.max(4, Math.min(rect.width, pageWidth));
  const h = Math.max(4, Math.min(rect.height, pageHeight));
  const x = Math.max(0, Math.min(pageWidth - w, rect.x));
  const y = Math.max(0, Math.min(pageHeight - h, rect.y));
  return { x, y, width: w, height: h };
}
