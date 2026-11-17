import { extractInkFromRgba, removeBackgroundFromRgba } from './index';

export interface ProcessedAssetResult {
  pngBytes: Uint8Array;
  width: number;
  height: number;
  bgRemoved: boolean;
  hadOpaqueBackground: boolean;
  outputFileName: string;
}

async function loadBlobIntoCanvas(blob: Blob): Promise<{
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('2D canvas context unavailable.');
      }
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      return {
        rgba: imageData.data,
        width: bitmap.width,
        height: bitmap.height,
      };
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image.'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable.');
    }
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      rgba: imageData.data,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function encodeRgbaToPngBytes(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable.');
  }
  const imgData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imgData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG.'))),
      'image/png',
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function hasOpaqueOuterBorder(rgba: Uint8ClampedArray, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  let total = 0;
  let opaque = 0;
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));

  for (let x = 0; x < width; x += stepX) {
    total += 2;
    if ((rgba[x * 4 + 3] ?? 255) >= 245) opaque++;
    if ((rgba[((height - 1) * width + x) * 4 + 3] ?? 255) >= 245) opaque++;
  }
  for (let y = 0; y < height; y += stepY) {
    total += 2;
    if ((rgba[(y * width) * 4 + 3] ?? 255) >= 245) opaque++;
    if ((rgba[(y * width + width - 1) * 4 + 3] ?? 255) >= 245) opaque++;
  }

  return total > 0 && opaque / total > 0.92;
}

function replaceExtensionWithPng(fileName: string): string {
  const clean = fileName.trim() || 'asset.png';
  return clean.replace(/\.(jpe?g|webp|png)$/i, '') + '.png';
}

/**
 * Decodes an uploaded PNG/JPEG/WebP image in the browser, automatically strips opaque
 * light/paper backgrounds when requested or needed, crops blank borders, and outputs valid PNG bytes.
 */
export async function prepareUploadedAsset(options: {
  blob: Blob;
  fileName: string;
  removeBackground: 'auto' | 'always' | 'never';
  tolerance?: number;
}): Promise<ProcessedAssetResult> {
  const { blob, fileName, removeBackground, tolerance = 0.3 } = options;
  const isNativePng = fileName.toLowerCase().endsWith('.png') || blob.type === 'image/png';
  const rawBytes = new Uint8Array(await blob.arrayBuffer());

  const { rgba, width, height } = await loadBlobIntoCanvas(blob);
  const hadOpaqueBackground = hasOpaqueOuterBorder(rgba, width, height);
  const shouldStrip =
    removeBackground === 'always' || (removeBackground === 'auto' && hadOpaqueBackground);

  if (shouldStrip) {
    // Primary: illumination-normalised ink unmixing (smooth exact edges, true ink colour).
    // Fallback: legacy threshold keying if unmixing finds no usable ink.
    const unmixed = extractInkFromRgba(rgba, width, height, { cropPaddingPx: 2 });
    const cleaned =
      unmixed.removedPixels > 0
        ? unmixed
        : removeBackgroundFromRgba(rgba, width, height, { tolerance, cropPaddingPx: 2 });
    if (cleaned.removedPixels > 0 || !isNativePng) {
      const pngBytes = await encodeRgbaToPngBytes(cleaned.rgba, cleaned.width, cleaned.height);
      return {
        pngBytes,
        width: cleaned.width,
        height: cleaned.height,
        bgRemoved: cleaned.removedPixels > 0,
        hadOpaqueBackground,
        outputFileName: replaceExtensionWithPng(fileName),
      };
    }
  }

  if (isNativePng) {
    return {
      pngBytes: rawBytes,
      width,
      height,
      bgRemoved: false,
      hadOpaqueBackground,
      outputFileName: fileName,
    };
  }

  const pngBytes = await encodeRgbaToPngBytes(rgba, width, height);
  return {
    pngBytes,
    width,
    height,
    bgRemoved: false,
    hadOpaqueBackground,
    outputFileName: replaceExtensionWithPng(fileName),
  };
}
