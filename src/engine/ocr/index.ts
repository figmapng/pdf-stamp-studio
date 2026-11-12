import type { OcrConfig, TextBlock } from '../../types';
import { groupTextItemsIntoBlocks } from '../pdf-parser';
import { normalizeText } from '../text-normalizer';

export interface OcrWordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

export interface OcrProvider {
  recognizeRgba: (
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    pageIndex: number,
    renderScale: number,
  ) => Promise<{ textBlocks: TextBlock[]; warnings: string[] }>;
  terminate: () => Promise<void>;
}

/**
 * Converts pixel-space OCR word boxes into canonical scale-1 PDF point TextBlocks.
 */
export function ocrWordsToTextBlocks(
  words: OcrWordBox[],
  pageIndex: number,
  renderScale: number,
): TextBlock[] {
  const safeScale = renderScale > 0 ? renderScale : 1;
  const rawItems = words
    .filter((w) => w.text.trim().length > 0 && w.x1 > w.x0 && w.y1 > w.y0)
    .map((w) => ({
      str: w.text,
      x: w.x0 / safeScale,
      y: w.y0 / safeScale,
      width: (w.x1 - w.x0) / safeScale,
      height: (w.y1 - w.y0) / safeScale,
      confidence: w.confidence,
    }));

  const grouped = groupTextItemsIntoBlocks(rawItems, pageIndex, 'OCR');
  return grouped.map((block) => {
    const overlapping = rawItems.filter(
      (item) =>
        item.x >= block.bounds.x - 4 &&
        item.x + item.width <= block.bounds.x + block.bounds.width + 4 &&
        item.y >= block.bounds.y - 4 &&
        item.y + item.height <= block.bounds.y + block.bounds.height + 4,
    );
    const avgConf =
      overlapping.length > 0
        ? overlapping.reduce((s, o) => s + o.confidence, 0) / overlapping.length
        : undefined;
    return {
      ...block,
      normalizedText: normalizeText(block.text),
      confidence: avgConf !== undefined ? Number((avgConf / 100).toFixed(3)) : undefined,
    };
  });
}

function rgbaToBmpBytes(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  // Uncompressed 24-bit BMP buffer: works natively in Tesseract.js worker without DOM Canvas!
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  // BITMAPFILEHEADER
  buf[0] = 0x42; // 'B'
  buf[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 4;
      const dstIdx = dstRow + x * 3;
      buf[dstIdx] = rgba[srcIdx + 2] ?? 255; // B
      buf[dstIdx + 1] = rgba[srcIdx + 1] ?? 255; // G
      buf[dstIdx + 2] = rgba[srcIdx] ?? 255; // R
    }
  }

  return buf;
}

/**
 * Browser/Worker Tesseract.js OCR provider.
 * Uses local worker & WASM cores from /wasm/tesseract/.
 */
export async function createTesseractOcrProvider(config: OcrConfig): Promise<OcrProvider> {
  const tesseract = await import('tesseract.js');
  const langs = config.languages.length > 0 ? config.languages.join('+') : 'kaz+rus+eng';

  // Check if local tessdata exists; otherwise honor allowCdnFallback
  const originPrefix = typeof window !== 'undefined' ? window.location.origin : '';
  let langPath = config.langPath || '/tessdata';
  if (langPath.startsWith('/') && originPrefix) {
    langPath = `${originPrefix}${langPath}`;
  }
  if (typeof fetch !== 'undefined' && (!langPath.startsWith('http') || (originPrefix && langPath.startsWith(originPrefix)))) {
    try {
      const firstLang = config.languages[0] ?? 'rus';
      const probe = await fetch(`${langPath}/${firstLang}.traineddata.gz`, { method: 'HEAD' });
      if (!probe.ok && config.allowCdnFallback) {
        langPath = 'https://tessdata.projectnaptha.com/4.0.0';
      }
    } catch {
      if (config.allowCdnFallback) {
        langPath = 'https://tessdata.projectnaptha.com/4.0.0';
      }
    }
  }

  const worker = await tesseract.createWorker(langs, undefined, {
    workerPath: `${originPrefix}/wasm/tesseract/worker.min.js`,
    corePath: `${originPrefix}/wasm/tesseract/core`,
    langPath,
    workerBlobURL: false,
  });

  return {
    async recognizeRgba(rgba, width, height, pageIndex, renderScale) {
      const warnings: string[] = [];
      try {
        const bmp = rgbaToBmpBytes(rgba, width, height);
        const result = await worker.recognize(bmp as unknown as string, {}, { blocks: true });
        const words: OcrWordBox[] = [];

        const blocks = result.data.blocks ?? [];
        for (const block of blocks) {
          for (const para of block.paragraphs) {
            for (const line of para.lines) {
              for (const w of line.words) {
                words.push({
                  text: w.text,
                  x0: w.bbox.x0,
                  y0: w.bbox.y0,
                  x1: w.bbox.x1,
                  y1: w.bbox.y1,
                  confidence: w.confidence,
                });
              }
            }
          }
        }

        const textBlocks = ocrWordsToTextBlocks(words, pageIndex, renderScale);
        if (textBlocks.length === 0) {
          warnings.push('OCR completed but no readable text blocks were detected.');
        }
        return { textBlocks, warnings };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`OCR_FAILED: ${msg}`);
        return { textBlocks: [], warnings };
      }
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
