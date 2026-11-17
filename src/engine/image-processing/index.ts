import type { Rect } from '../../types';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngInspectionResult {
  isValid: boolean;
  error?: string;
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  hasAlphaTransparency: boolean;
  opaqueBounds: Rect;
  transparentPaddingRatio: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] ?? 0) << 24) |
    ((buf[offset + 1] ?? 0) << 16) |
    ((buf[offset + 2] ?? 0) << 8) |
    (buf[offset + 3] ?? 0)
  ) >>> 0;
}

async function inflateZlib(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    void writer.write(copy).then(() => writer.close());
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  throw new Error('DecompressionStream is not available in this runtime.');
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Pure-TS PNG inspector that verifies PNG signature, dimensions, alpha channel,
 * and computes exact non-transparent content bounds (opaqueBounds) + empty padding ratios.
 * Works identically in Browser, Web Workers, and Node.
 */
export async function inspectPngBytes(bytes: Uint8Array): Promise<PngInspectionResult> {
  if (bytes.byteLength < 24) {
    return {
      isValid: false,
      error: 'File is too small to be a valid PNG.',
      width: 0,
      height: 0,
      colorType: 0,
      bitDepth: 0,
      hasAlphaTransparency: false,
      opaqueBounds: { x: 0, y: 0, width: 0, height: 0 },
      transparentPaddingRatio: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }

  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      return {
        isValid: false,
        error: 'Invalid PNG signature. Only genuine PNG files are supported.',
        width: 0,
        height: 0,
        colorType: 0,
        bitDepth: 0,
        hasAlphaTransparency: false,
        opaqueBounds: { x: 0, y: 0, width: 0, height: 0 },
        transparentPaddingRatio: { top: 0, right: 0, bottom: 0, left: 0 },
      };
    }
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts: Uint8Array[] = [];
  let hasTrns = false;

  let offset = 8;
  while (offset + 8 <= bytes.byteLength) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.byteLength) break;

    if (type === 'IHDR' && length >= 13) {
      width = readUint32BE(bytes, dataStart);
      height = readUint32BE(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8] ?? 8;
      colorType = bytes[dataStart + 9] ?? 6;
      interlace = bytes[dataStart + 12] ?? 0;
    } else if (type === 'tRNS') {
      hasTrns = true;
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0) {
    return {
      isValid: false,
      error: 'PNG IHDR dimensions are invalid.',
      width: 0,
      height: 0,
      colorType,
      bitDepth,
      hasAlphaTransparency: false,
      opaqueBounds: { x: 0, y: 0, width: 0, height: 0 },
      transparentPaddingRatio: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }

  const fullFallback: PngInspectionResult = {
    isValid: true,
    width,
    height,
    colorType,
    bitDepth,
    hasAlphaTransparency: colorType === 4 || colorType === 6 || hasTrns,
    opaqueBounds: { x: 0, y: 0, width, height },
    transparentPaddingRatio: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  // Non-interlaced 8-bit grayscale+alpha (4) or RGBA (6): exact pixel alpha bounds
  if (interlace !== 0 || bitDepth !== 8 || (colorType !== 6 && colorType !== 4)) {
    return fullFallback;
  }

  try {
    const totalIdatLen = idatParts.reduce((acc, part) => acc + part.byteLength, 0);
    const compressed = new Uint8Array(totalIdatLen);
    let pos = 0;
    for (const part of idatParts) {
      compressed.set(part, pos);
      pos += part.byteLength;
    }

    const raw = await inflateZlib(compressed);
    const bpp = colorType === 6 ? 4 : 2;
    const stride = width * bpp;
    const expectedLen = (stride + 1) * height;
    if (raw.byteLength < expectedLen) {
      return fullFallback;
    }

    const prevRow = new Uint8Array(stride);
    const currRow = new Uint8Array(stride);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let seenTransparentPixel = false;
    let seenOpaquePixel = false;

    for (let y = 0; y < height; y++) {
      const rowStart = y * (stride + 1);
      const filterType = raw[rowStart] ?? 0;

      for (let i = 0; i < stride; i++) {
        const xVal = raw[rowStart + 1 + i] ?? 0;
        const a = i >= bpp ? (currRow[i - bpp] ?? 0) : 0;
        const b = prevRow[i] ?? 0;
        const c = i >= bpp ? (prevRow[i - bpp] ?? 0) : 0;

        let recon = xVal;
        if (filterType === 1) {
          recon = (xVal + a) & 0xff;
        } else if (filterType === 2) {
          recon = (xVal + b) & 0xff;
        } else if (filterType === 3) {
          recon = (xVal + ((a + b) >> 1)) & 0xff;
        } else if (filterType === 4) {
          recon = (xVal + paethPredictor(a, b, c)) & 0xff;
        }
        currRow[i] = recon;
      }

      for (let x = 0; x < width; x++) {
        const alpha = currRow[x * bpp + (bpp - 1)] ?? 255;
        if (alpha < 250) {
          seenTransparentPixel = true;
        }
        if (alpha > 16) {
          seenOpaquePixel = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      prevRow.set(currRow);
    }

    if (!seenOpaquePixel) {
      return {
        isValid: false,
        error: 'PNG image appears to be completely transparent (empty).',
        width,
        height,
        colorType,
        bitDepth,
        hasAlphaTransparency: true,
        opaqueBounds: { x: 0, y: 0, width: 0, height: 0 },
        transparentPaddingRatio: { top: 100, right: 100, bottom: 100, left: 100 },
      };
    }

    const opaqueBounds: Rect = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };

    return {
      isValid: true,
      width,
      height,
      colorType,
      bitDepth,
      hasAlphaTransparency: seenTransparentPixel,
      opaqueBounds,
      transparentPaddingRatio: {
        top: Math.round((minY / height) * 100),
        left: Math.round((minX / width) * 100),
        bottom: Math.round(((height - 1 - maxY) / height) * 100),
        right: Math.round(((width - 1 - maxX) / width) * 100),
      },
    };
  } catch {
    return fullFallback;
  }
}

/**
 * Converts RGBA pixel buffer to 8-bit grayscale array.
 */
export function rgbaToGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const r = rgba[p] ?? 255;
    const g = rgba[p + 1] ?? 255;
    const b = rgba[p + 2] ?? 255;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Computes Otsu global threshold for a grayscale buffer.
 */
export function computeOtsuThreshold(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i] ?? 255]!++;
  }
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * (hist[t] ?? 0);
  }

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 180;

  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Enhances contrast & produces clean RGBA binary-ish image suitable for OCR on scanned pages.
 */
export function preprocessScannedRgbaForOcr(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const gray = rgbaToGrayscale(rgba, width, height);
  const otsu = computeOtsuThreshold(gray);
  const cutoff = Math.min(220, Math.max(100, otsu));
  const out = new Uint8ClampedArray(rgba.length);

  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const g = gray[i] ?? 255;
    // Soft contrast stretch around Otsu threshold to preserve anti-aliased thin strokes
    let val: number;
    if (g < cutoff - 25) {
      val = 0;
    } else if (g > cutoff + 25) {
      val = 255;
    } else {
      val = Math.round(((g - (cutoff - 25)) / 50) * 255);
    }
    out[p] = val;
    out[p + 1] = val;
    out[p + 2] = val;
    out[p + 3] = 255;
  }

  return out;
}

/**
 * Estimates small page skew angle in degrees (-4..+4) using horizontal projection variance.
 */
export function estimateSkewAngle(gray: Uint8Array, width: number, height: number): number {
  const threshold = computeOtsuThreshold(gray);
  const stepX = Math.max(1, Math.floor(width / 400));
  const stepY = Math.max(1, Math.floor(height / 400));

  let bestAngle = 0;
  let bestScore = -1;

  for (let angleDeg = -4; angleDeg <= 4; angleDeg += 0.5) {
    const rad = (angleDeg * Math.PI) / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const bins = new Int32Array(height);

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        if ((gray[y * width + x] ?? 255) < threshold) {
          const ry = Math.round(y * cosA - x * sinA + height * 0.1);
          if (ry >= 0 && ry < height) {
            bins[ry]!++;
          }
        }
      }
    }

    let varianceProxy = 0;
    for (let i = 0; i < bins.length; i++) {
      const c = bins[i] ?? 0;
      varianceProxy += c * c;
    }

    if (varianceProxy > bestScore) {
      bestScore = varianceProxy;
      bestAngle = angleDeg;
    }
  }

  return Math.abs(bestAngle) < 0.5 ? 0 : bestAngle;
}

export interface BackgroundRemovalOptions {
  /** Sensitivity 0..1 (higher removes darker/warmer paper shades; default 0.3). */
  tolerance?: number;
  /** Extra padding in pixels kept around detected ink after tight cropping (default 2). */
  cropPaddingPx?: number;
}

export interface BackgroundRemovalResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  removedPixels: number;
  keptPixels: number;
  cropBounds: Rect;
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Removes light/neutral paper or solid backgrounds (including uneven lighting and
 * interior loops inside stamps/letters) while preserving dark or colorful ink,
 * decontaminating anti-aliased edges, and tightly cropping blank margins.
 */
export function removeBackgroundFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: BackgroundRemovalOptions,
): BackgroundRemovalResult {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return {
      rgba: new Uint8ClampedArray(rgba),
      width,
      height,
      removedPixels: 0,
      keptPixels: 0,
      cropBounds: { x: 0, y: 0, width, height },
    };
  }

  const tolerance = Math.max(0, Math.min(1, options?.tolerance ?? 0.3));
  const cropPadding = Math.max(0, Math.min(24, Math.round(options?.cropPaddingPx ?? 2)));

  // 1. Sample opaque border pixels to establish baseline background color & luminance
  const borderLums: number[] = [];
  let sumBgR = 0;
  let sumBgG = 0;
  let sumBgB = 0;
  let bgSampleCount = 0;

  const pushBorderPixel = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    const a = rgba[p + 3] ?? 255;
    if (a < 200) return;
    const r = rgba[p] ?? 255;
    const g = rgba[p + 1] ?? 255;
    const b = rgba[p + 2] ?? 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    borderLums.push(lum);
    if (lum >= 120) {
      sumBgR += r;
      sumBgG += g;
      sumBgB += b;
      bgSampleCount++;
    }
  };

  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  for (let x = 0; x < width; x += stepX) {
    pushBorderPixel(x, 0);
    pushBorderPixel(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    pushBorderPixel(0, y);
    pushBorderPixel(width - 1, y);
  }

  borderLums.sort((a, b) => a - b);
  const medianBorderLum =
    borderLums.length > 0 ? (borderLums[Math.floor(borderLums.length * 0.5)] ?? 245) : 245;
  const globalPaperLum = medianBorderLum >= 120 ? medianBorderLum : 235;
  const bgR = bgSampleCount > 0 ? sumBgR / bgSampleCount : 245;
  const bgG = bgSampleCount > 0 ? sumBgG / bgSampleCount : 245;
  const bgB = bgSampleCount > 0 ? sumBgB / bgSampleCount : 245;

  // 2. Build a coarse local illumination grid (6x6) so shadowed paper corners clean cleanly
  const gridN = 6;
  const tileLums = new Float32Array(gridN * gridN);
  for (let gy = 0; gy < gridN; gy++) {
    const y0 = Math.floor((gy * height) / gridN);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / gridN));
    for (let gx = 0; gx < gridN; gx++) {
      const x0 = Math.floor((gx * width) / gridN);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / gridN));
      const samples: number[] = [];
      const syStep = Math.max(1, Math.floor((y1 - y0) / 16));
      const sxStep = Math.max(1, Math.floor((x1 - x0) / 16));

      for (let y = y0; y < y1; y += syStep) {
        for (let x = x0; x < x1; x += sxStep) {
          const p = (y * width + x) * 4;
          if ((rgba[p + 3] ?? 255) < 200) continue;
          const r = rgba[p] ?? 255;
          const g = rgba[p + 1] ?? 255;
          const b = rgba[p + 2] ?? 255;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (chroma <= 45 && lum >= 115) {
            samples.push(lum);
          }
        }
      }

      if (samples.length >= 4) {
        samples.sort((a, b) => a - b);
        tileLums[gy * gridN + gx] = samples[Math.floor(samples.length * 0.8)] ?? globalPaperLum;
      } else {
        tileLums[gy * gridN + gx] = globalPaperLum;
      }
    }
  }

  const sampleLocalPaperLum = (x: number, y: number): number => {
    const fx = ((x + 0.5) / width) * gridN - 0.5;
    const fy = ((y + 0.5) / height) * gridN - 0.5;
    const x0 = Math.max(0, Math.min(gridN - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(gridN - 1, Math.floor(fy)));
    const x1 = Math.min(gridN - 1, x0 + 1);
    const y1 = Math.min(gridN - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));

    const v00 = tileLums[y0 * gridN + x0] ?? globalPaperLum;
    const v10 = tileLums[y0 * gridN + x1] ?? globalPaperLum;
    const v01 = tileLums[y1 * gridN + x0] ?? globalPaperLum;
    const v11 = tileLums[y1 * gridN + x1] ?? globalPaperLum;
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  };

  // 3. Key out paper pixels while keeping dark ink & colored stamps sharp
  const work = new Uint8ClampedArray(rgba);
  const maxBgChroma = 28 + tolerance * 28;
  const chromaSoft = 18;
  const lumRatioCutoff = 0.85 - tolerance * 0.22;
  const lumSoftBand = 26;

  let removedPixels = 0;
  let keptPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const origA = work[p + 3] ?? 255;
      if (origA <= 8) {
        work[p + 3] = 0;
        continue;
      }

      const r = work[p] ?? 255;
      const g = work[p + 1] ?? 255;
      const b = work[p + 2] ?? 255;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const localPaperLum = Math.max(115, sampleLocalPaperLum(x, y));
      const bgThreshold = Math.min(242, localPaperLum * lumRatioCutoff);

      // 0 when solidly light-neutral paper, 1 when clearly ink (dark or saturated)
      const lumInkWeight = 1 - smoothstep01(bgThreshold - lumSoftBand, bgThreshold + 6, lum);
      const chromaInkWeight = smoothstep01(maxBgChroma - chromaSoft * 0.5, maxBgChroma + chromaSoft, chroma);
      const inkWeight = Math.max(lumInkWeight, chromaInkWeight);

      const newA = Math.round(origA * inkWeight);
      if (newA <= 8) {
        work[p + 3] = 0;
        removedPixels++;
      } else {
        // Slightly decontaminate semi-transparent fringe pixels so white paper halo doesn't bleed
        if (newA < 240) {
          const alphaNorm = newA / 255;
          work[p] = clampByte((r - bgR * (1 - alphaNorm)) / alphaNorm);
          work[p + 1] = clampByte((g - bgG * (1 - alphaNorm)) / alphaNorm);
          work[p + 2] = clampByte((b - bgB * (1 - alphaNorm)) / alphaNorm);
        }
        work[p + 3] = newA;
        keptPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Safety guard: never return an empty image if threshold removed everything
  if (keptPixels < 8 || maxX < minX || maxY < minY) {
    return {
      rgba: new Uint8ClampedArray(rgba),
      width,
      height,
      removedPixels: 0,
      keptPixels: width * height,
      cropBounds: { x: 0, y: 0, width, height },
    };
  }

  // 4. Crop tightly around remaining ink bounds
  const cropX = Math.max(0, minX - cropPadding);
  const cropY = Math.max(0, minY - cropPadding);
  const cropRight = Math.min(width - 1, maxX + cropPadding);
  const cropBottom = Math.min(height - 1, maxY + cropPadding);
  const cropW = cropRight - cropX + 1;
  const cropH = cropBottom - cropY + 1;

  if (cropX === 0 && cropY === 0 && cropW === width && cropH === height) {
    return {
      rgba: work,
      width,
      height,
      removedPixels,
      keptPixels,
      cropBounds: { x: 0, y: 0, width, height },
    };
  }

  const cropped = new Uint8ClampedArray(cropW * cropH * 4);
  for (let row = 0; row < cropH; row++) {
    const srcStart = ((cropY + row) * width + cropX) * 4;
    const dstStart = row * cropW * 4;
    cropped.set(work.subarray(srcStart, srcStart + cropW * 4), dstStart);
  }

  return {
    rgba: cropped,
    width: cropW,
    height: cropH,
    removedPixels,
    keptPixels,
    cropBounds: { x: cropX, y: cropY, width: cropW, height: cropH },
  };
}

// ---------------------------------------------------------------------------
// Ink unmixing ("color-to-alpha") background removal
// ---------------------------------------------------------------------------

export interface InkExtractionOptions {
  /** Extra padding in pixels kept around detected ink after tight cropping (default 2). */
  cropPaddingPx?: number;
  /** Drop isolated specks smaller than this many pixels (default: scaled to image size). */
  minSpeckPx?: number;
}

/**
 * Highest-fidelity background removal for ink on paper (signatures, round stamps).
 *
 * 1. Estimates the paper colour per pixel from bright tile percentiles (handles shadows and
 *    uneven phone-photo lighting) and divides it out, so paper becomes pure white.
 * 2. Unmixes every pixel as `ink * alpha + white * (1 - alpha)`: alpha is the strongest
 *    channel deficit and the true ink colour is recovered. Anti-aliased strokes keep smooth,
 *    exact edges with no halo (what GIMP calls colour-to-alpha).
 * 3. Removes the paper noise floor (measured from the image itself) and tiny isolated specks.
 * 4. Crops tightly to the remaining ink.
 *
 * Pure TypeScript, no network, no model downloads: works offline on any machine.
 */
export function extractInkFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: InkExtractionOptions,
): BackgroundRemovalResult {
  const unchanged = (): BackgroundRemovalResult => ({
    rgba: new Uint8ClampedArray(rgba),
    width,
    height,
    removedPixels: 0,
    keptPixels: width * height,
    cropBounds: { x: 0, y: 0, width, height },
  });
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return unchanged();

  const cropPadding = Math.max(0, Math.min(24, Math.round(options?.cropPaddingPx ?? 2)));
  const total = width * height;

  // --- 1. Paper colour field -------------------------------------------------
  const tile = Math.max(8, Math.round(Math.min(width, height) / 14));
  const gx = Math.max(1, Math.ceil(width / tile));
  const gy = Math.max(1, Math.ceil(height / tile));
  const field = [new Float32Array(gx * gy), new Float32Array(gx * gy), new Float32Array(gx * gy)];
  const globalPaper = [0, 0, 0];

  // Global reference: 90th percentile of every channel over a sampled grid of opaque pixels.
  {
    const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let n = 0;
    const sx = Math.max(1, Math.floor(width / 160));
    const sy = Math.max(1, Math.floor(height / 160));
    for (let y = 0; y < height; y += sy) {
      for (let x = 0; x < width; x += sx) {
        const p = (y * width + x) * 4;
        if ((rgba[p + 3] ?? 255) < 128) continue;
        bins[0]![rgba[p] ?? 255]!++;
        bins[1]![rgba[p + 1] ?? 255]!++;
        bins[2]![rgba[p + 2] ?? 255]!++;
        n++;
      }
    }
    if (n === 0) return unchanged();
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      const target = n * 0.9;
      let v = 255;
      for (let i = 0; i < 256; i++) {
        acc += bins[c]![i]!;
        if (acc >= target) {
          v = i;
          break;
        }
      }
      globalPaper[c] = Math.max(60, v);
    }
  }

  for (let ty = 0; ty < gy; ty++) {
    for (let tx = 0; tx < gx; tx++) {
      const x0 = tx * tile;
      const y0 = ty * tile;
      const x1 = Math.min(width, x0 + tile);
      const y1 = Math.min(height, y0 + tile);
      const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      let n = 0;
      const sx = Math.max(1, Math.floor((x1 - x0) / 24));
      const sy = Math.max(1, Math.floor((y1 - y0) / 24));
      for (let y = y0; y < y1; y += sy) {
        for (let x = x0; x < x1; x += sx) {
          const p = (y * width + x) * 4;
          if ((rgba[p + 3] ?? 255) < 128) continue;
          hist[0]![rgba[p] ?? 255]!++;
          hist[1]![rgba[p + 1] ?? 255]!++;
          hist[2]![rgba[p + 2] ?? 255]!++;
          n++;
        }
      }
      for (let c = 0; c < 3; c++) {
        let v = globalPaper[c]!;
        if (n >= 4) {
          let acc = 0;
          const target = n * 0.85;
          for (let i = 0; i < 256; i++) {
            acc += hist[c]![i]!;
            if (acc >= target) {
              v = i;
              break;
            }
          }
          // A tile fully covered by ink must not be mistaken for paper.
          v = Math.max(v, globalPaper[c]! * 0.8);
          v = Math.min(255, Math.max(v, 40));
        }
        field[c]![ty * gx + tx] = v;
      }
    }
  }

  const paperAt = (c: number, x: number, y: number): number => {
    const fx = (x + 0.5) / tile - 0.5;
    const fy = (y + 0.5) / tile - 0.5;
    const x0 = Math.max(0, Math.min(gx - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(gy - 1, Math.floor(fy)));
    const x1 = Math.min(gx - 1, x0 + 1);
    const y1 = Math.min(gy - 1, y0 + 1);
    const ax = Math.max(0, Math.min(1, fx - x0));
    const ay = Math.max(0, Math.min(1, fy - y0));
    const f = field[c]!;
    return (
      (f[y0 * gx + x0]! * (1 - ax) + f[y0 * gx + x1]! * ax) * (1 - ay) +
      (f[y1 * gx + x0]! * (1 - ax) + f[y1 * gx + x1]! * ax) * ay
    );
  };

  // --- 2. Unmix: alpha = largest deficit versus the paper ---------------------
  const alpha = new Float32Array(total);
  const inkR = new Float32Array(total);
  const inkG = new Float32Array(total);
  const inkB = new Float32Array(total);
  const rawHist = new Uint32Array(256);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      const a0 = (rgba[p + 3] ?? 255) / 255;
      if (a0 <= 0.02) {
        alpha[i] = 0;
        continue;
      }
      const rn = Math.min(1, (rgba[p] ?? 255) / paperAt(0, x, y));
      const gn = Math.min(1, (rgba[p + 1] ?? 255) / paperAt(1, x, y));
      const bn = Math.min(1, (rgba[p + 2] ?? 255) / paperAt(2, x, y));
      const a = Math.max(1 - rn, 1 - gn, 1 - bn);
      alpha[i] = a * a0;
      inkR[i] = rn;
      inkG[i] = gn;
      inkB[i] = bn;
      rawHist[Math.min(255, Math.round(a * 255))]!++;
    }
  }

  // --- 3. Noise floor measured from the image itself -------------------------
  // Paper dominates the histogram; its spread tells us where "no ink" ends.
  let peak = 0;
  for (let i = 0; i < 40; i++) if (rawHist[i]! > rawHist[peak]!) peak = i;
  let acc = 0;
  const paperTotal = (() => {
    let s = 0;
    for (let i = 0; i < 48; i++) s += rawHist[i]!;
    return s;
  })();
  let floorBin = peak;
  for (let i = peak; i < 64; i++) {
    acc += rawHist[i]!;
    if (acc >= paperTotal * 0.985) {
      floorBin = i;
      break;
    }
  }
  const lo = Math.min(0.2, Math.max(0.04, (floorBin + 3) / 255));
  const hi = 0.97;

  // --- 4. Soft threshold, recover true ink colour, collect statistics ---------
  const out = new Uint8ClampedArray(total * 4);
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const raw = alpha[i]!;
    if (raw <= lo) continue;
    const a = Math.min(1, (raw - lo) / (hi - lo));
    if (a <= 0.01) continue;
    mask[i] = 1;
    const p = i * 4;
    out[p] = Math.round(Math.max(0, Math.min(1, (inkR[i]! - (1 - a)) / a)) * 255);
    out[p + 1] = Math.round(Math.max(0, Math.min(1, (inkG[i]! - (1 - a)) / a)) * 255);
    out[p + 2] = Math.round(Math.max(0, Math.min(1, (inkB[i]! - (1 - a)) / a)) * 255);
    out[p + 3] = Math.round(a * 255);
  }

  // --- 5. Remove isolated specks (connected components, 8-neighbourhood) ------
  const minSpeck = Math.max(
    3,
    Math.round(options?.minSpeckPx ?? Math.max(4, (width * height) / 60000)),
  );
  const seen = new Uint8Array(total);
  const stack: number[] = [];
  const comp: number[] = [];
  let largest = 0;
  const sizes: Array<{ idx: number[]; size: number }> = [];
  for (let s = 0; s < total; s++) {
    if (!mask[s] || seen[s]) continue;
    stack.length = 0;
    comp.length = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
    sizes.push({ idx: comp.slice(), size: comp.length });
    if (comp.length > largest) largest = comp.length;
  }
  // Specks are small relative to the strokes themselves, never relative to absolute size only.
  const speckLimit = Math.min(minSpeck, Math.max(1, Math.floor(largest * 0.02)));
  for (const c of sizes) {
    if (c.size < speckLimit) {
      for (const i of c.idx) {
        mask[i] = 0;
        out[i * 4 + 3] = 0;
      }
    }
  }

  // --- 6. Bounds and tight crop ----------------------------------------------
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      kept++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (kept < 8 || maxX < minX) return unchanged();

  const cx0 = Math.max(0, minX - cropPadding);
  const cy0 = Math.max(0, minY - cropPadding);
  const cx1 = Math.min(width - 1, maxX + cropPadding);
  const cy1 = Math.min(height - 1, maxY + cropPadding);
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;
  const cropped = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const src = ((cy0 + row) * width + cx0) * 4;
    cropped.set(out.subarray(src, src + cw * 4), row * cw * 4);
  }

  return {
    rgba: cropped,
    width: cw,
    height: ch,
    removedPixels: total - kept,
    keptPixels: kept,
    cropBounds: { x: cx0, y: cy0, width: cw, height: ch },
  };
}
