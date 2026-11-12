import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import type {
  DocumentClassification,
  LineCandidate,
  PageAnalysis,
  PageGeometry,
  PageType,
  PdfIntegrityInfo,
  Rect,
  TextBlock,
} from '../../types';
import { normalizeText } from '../text-normalizer';
import { deduplicateLines, scoreAndClassifyLineCandidates } from '../line-detection';

// PDF.js DrawOPS constants for constructPath Float32Array decoding
const DRAW_OP_MOVE_TO = 0;
const DRAW_OP_LINE_TO = 1;
const DRAW_OP_CURVE_TO = 2;
const DRAW_OP_QUAD_TO = 3;
const DRAW_OP_CLOSE_PATH = 4;

type Matrix6 = [number, number, number, number, number, number];

function multiplyMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function normalizeRotation(rot: number): 0 | 90 | 180 | 270 {
  const mod = ((rot % 360) + 360) % 360;
  if (mod === 90) return 90;
  if (mod === 180) return 180;
  if (mod === 270) return 270;
  return 0;
}

/**
 * Inspects a PDF byte buffer for validity, encryption, cryptographic signatures,
 * interactive forms, annotations, and embedded JS/actions without executing anything.
 */
export async function inspectPdfIntegrity(bytes: Uint8Array): Promise<{
  isValid: boolean;
  pageCount: number | null;
  integrity: PdfIntegrityInfo;
  error?: string;
}> {
  const defaultIntegrity: PdfIntegrityInfo = {
    isEncrypted: false,
    hasDigitalSignature: false,
    hasInteractiveForms: false,
    hasAnnotations: false,
    hasJavaScriptOrActions: false,
  };

  if (bytes.byteLength < 8) {
    return {
      isValid: false,
      pageCount: null,
      integrity: { ...defaultIntegrity, errorCode: 'INVALID_PDF' },
      error: 'File is too small to be a valid PDF.',
    };
  }

  // Verify %PDF- header within first 1024 bytes (PDF spec allows leading whitespace/BOM)
  const headerSlice = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(1024, bytes.byteLength)));
  if (!headerSlice.includes('%PDF-')) {
    return {
      isValid: false,
      pageCount: null,
      integrity: { ...defaultIntegrity, errorCode: 'INVALID_PDF' },
      error: 'Missing %PDF- header. File is not a valid PDF document.',
    };
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });

    const pages = doc.getPages();
    const pageCount = pages.length;

    let hasDigitalSignature = false;
    let hasInteractiveForms = false;
    let hasAnnotations = false;
    let hasJavaScriptOrActions = false;

    const catalog = doc.catalog;
    if (catalog.has(PDFName.of('OpenAction')) || catalog.has(PDFName.of('AA'))) {
      hasJavaScriptOrActions = true;
    }

    const namesDict = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    if (namesDict && namesDict.has(PDFName.of('JavaScript'))) {
      hasJavaScriptOrActions = true;
    }

    const acroForm = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    if (acroForm) {
      const fields = acroForm.lookupMaybe(PDFName.of('Fields'), PDFArray);
      if (fields && fields.size() > 0) {
        hasInteractiveForms = true;
        for (let i = 0; i < fields.size(); i++) {
          const field = fields.lookupMaybe(i, PDFDict);
          if (!field) continue;
          const ft = field.lookup(PDFName.of('FT'));
          if (ft && ft.toString() === '/Sig') {
            hasDigitalSignature = true;
          }
          const v = field.lookupMaybe(PDFName.of('V'), PDFDict);
          if (v && (v.has(PDFName.of('ByteRange')) || v.lookup(PDFName.of('Type'))?.toString() === '/Sig')) {
            hasDigitalSignature = true;
          }
        }
      }
      const sigFlags = acroForm.get(PDFName.of('SigFlags'));
      if (sigFlags && Number(sigFlags.toString()) > 0) {
        hasDigitalSignature = true;
      }
    }

    // Also scan page annotations for /Widget /Sig or non-trivial annotations
    for (const page of pages) {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (annots && annots.size() > 0) {
        hasAnnotations = true;
        for (let i = 0; i < annots.size(); i++) {
          const annot = annots.lookupMaybe(i, PDFDict);
          if (!annot) continue;
          const ft = annot.lookup(PDFName.of('FT'));
          if (ft && ft.toString() === '/Sig') {
            hasDigitalSignature = true;
          }
          if (annot.has(PDFName.of('A')) || annot.has(PDFName.of('AA'))) {
            const action = annot.lookupMaybe(PDFName.of('A'), PDFDict);
            if (action && action.lookup(PDFName.of('S'))?.toString() === '/JavaScript') {
              hasJavaScriptOrActions = true;
            }
          }
        }
      }
    }

    // Fallback raw scan for /ByteRange /Sig dictionary markers if deeply nested in XRef/ObjStm
    if (!hasDigitalSignature) {
      const rawText = new TextDecoder('latin1').decode(bytes);
      if (rawText.includes('/ByteRange') && rawText.includes('/Type/Sig')) {
        hasDigitalSignature = true;
      } else if (rawText.includes('/ByteRange') && rawText.includes('/Type /Sig')) {
        hasDigitalSignature = true;
      }
    }

    return {
      isValid: true,
      pageCount,
      integrity: {
        isEncrypted: false,
        hasDigitalSignature,
        hasInteractiveForms,
        hasAnnotations,
        hasJavaScriptOrActions,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isEncrypted = /encrypt/i.test(message);
    return {
      isValid: false,
      pageCount: null,
      integrity: {
        ...defaultIntegrity,
        isEncrypted,
        errorCode: isEncrypted ? 'ENCRYPTED_PDF' : 'INVALID_PDF',
      },
      error: isEncrypted
        ? 'PDF is encrypted or password-protected and cannot be modified safely.'
        : `Failed to parse PDF: ${message}`,
    };
  }
}

export async function getPageGeometriesFromPdfLib(bytes: Uint8Array): Promise<PageGeometry[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPages().map((page, pageIndex) => {
    const mediaBox = page.getMediaBox();
    const cropBox = page.getCropBox();
    const rotation = normalizeRotation(page.getRotation().angle);
    const swap = rotation === 90 || rotation === 270;
    return {
      pageIndex,
      width: swap ? cropBox.height : cropBox.width,
      height: swap ? cropBox.width : cropBox.height,
      rotation,
      mediaBox,
      cropBox,
    };
  });
}

// Keep PDFRef imported usage clean for strict noUnusedLocals
export type { PDFRef };

export interface PdfJsModuleLike {
  GlobalWorkerOptions: { workerSrc: string };
  OPS: Record<string, number>;
  Util: {
    transform: (m1: number[], m2: number[]) => number[];
  };
  getDocument: (params: Record<string, unknown>) => {
    promise: Promise<PdfJsDocumentProxy>;
    destroy: () => Promise<void>;
  };
}

export interface PdfJsDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPageProxy>;
  cleanup: () => Promise<void>;
  loadingTask?: { destroy: () => Promise<void> };
}

export interface PdfJsPageProxy {
  rotate: number;
  view: number[];
  getViewport: (opts: { scale: number }) => {
    width: number;
    height: number;
    transform: number[];
    convertToViewportPoint: (x: number, y: number) => [number, number];
  };
  getTextContent: () => Promise<{
    items: Array<{
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
      hasEOL?: boolean;
    }>;
  }>;
  getOperatorList: () => Promise<{
    fnArray: number[];
    argsArray: unknown[];
  }>;
  render: (params: Record<string, unknown>) => { promise: Promise<void> };
  cleanup: () => void;
}

let cachedPdfJs: PdfJsModuleLike | null = null;

export async function loadPdfJs(options?: { disableWorker?: boolean }): Promise<PdfJsModuleLike> {
  if (cachedPdfJs) return cachedPdfJs;

  const isNode =
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node) &&
    typeof window === 'undefined';

  const mod = (await (isNode
    ? import('pdfjs-dist/legacy/build/pdf.mjs')
    : import('pdfjs-dist'))) as unknown as PdfJsModuleLike;

  if (!options?.disableWorker && !isNode) {
    mod.GlobalWorkerOptions.workerSrc = '/wasm/pdfjs/pdf.worker.min.mjs';
  }
  cachedPdfJs = mod;
  return mod;
}

interface RawTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Merges individual PDF.js glyph/word spans into clean visual line-level TextBlocks.
 */
export function groupTextItemsIntoBlocks(
  rawItems: RawTextItem[],
  pageIndex: number,
  source: 'DIGITAL_TEXT' | 'OCR' = 'DIGITAL_TEXT',
): TextBlock[] {
  const nonEmpty = rawItems.filter((item) => item.str.trim().length > 0 && item.width >= 0);
  if (nonEmpty.length === 0) return [];

  // Sort top-to-bottom, left-to-right
  const sorted = [...nonEmpty].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > Math.max(4, Math.min(a.height, b.height) * 0.45)) {
      return yDiff;
    }
    return a.x - b.x;
  });

  // Cluster into visual lines first
  const lines: RawTextItem[][] = [];
  for (const item of sorted) {
    const midY = item.y + item.height / 2;
    const targetLine = lines.find((line) => {
      const first = line[0]!;
      const firstMidY = first.y + first.height / 2;
      const tolerance = Math.max(4, Math.min(first.height, item.height) * 0.55);
      return Math.abs(midY - firstMidY) <= tolerance;
    });
    if (targetLine) {
      targetLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  const blocks: TextBlock[] = [];
  let blockSeq = 0;

  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    // Split line into segments if there is a huge horizontal gap (> 42pt, e.g., two-column signature table!)
    const segments: RawTextItem[][] = [];
    let currentSeg: RawTextItem[] = [];

    for (const item of line) {
      if (currentSeg.length === 0) {
        currentSeg.push(item);
        continue;
      }
      const prev = currentSeg[currentSeg.length - 1]!;
      const gap = item.x - (prev.x + prev.width);
      const maxGap = Math.max(36, prev.height * 3.2);
      if (gap > maxGap) {
        segments.push(currentSeg);
        currentSeg = [item];
      } else {
        currentSeg.push(item);
      }
    }
    if (currentSeg.length > 0) segments.push(currentSeg);

    for (const seg of segments) {
      let text = '';
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < seg.length; i++) {
        const it = seg[i]!;
        if (i > 0) {
          const prev = seg[i - 1]!;
          const gap = it.x - (prev.x + prev.width);
          if (gap > Math.max(1.5, prev.height * 0.14) && !text.endsWith(' ') && !it.str.startsWith(' ')) {
            text += ' ';
          }
        }
        text += it.str;
        minX = Math.min(minX, it.x);
        minY = Math.min(minY, it.y);
        maxX = Math.max(maxX, it.x + it.width);
        maxY = Math.max(maxY, it.y + it.height);
      }

      const trimmed = text.trim();
      if (!trimmed) continue;

      blocks.push({
        id: `txt-p${pageIndex}-${blockSeq++}`,
        text: trimmed,
        normalizedText: normalizeText(trimmed),
        bounds: {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        },
        pageIndex,
        source,
      });
    }
  }

  return blocks;
}

/**
 * Classifies a page as DIGITAL, SCANNED, or MIXED based on extracted text coverage and raster image ops.
 */
export function classifyPage(
  textBlocks: TextBlock[],
  imageOpsCount: number,
  pageArea: number,
): PageType {
  const meaningfulChars = textBlocks.reduce(
    (sum, b) => sum + b.normalizedText.replace(/\s+/g, '').length,
    0,
  );
  const textArea = textBlocks.reduce((sum, b) => sum + b.bounds.width * b.bounds.height, 0);
  const textDensity = pageArea > 0 ? textArea / pageArea : 0;

  if (meaningfulChars >= 25 && imageOpsCount === 0) {
    return 'DIGITAL';
  }
  if (meaningfulChars < 15 && imageOpsCount >= 1) {
    return 'SCANNED';
  }
  if (meaningfulChars >= 15 && imageOpsCount >= 1) {
    // Could be a digital PDF with a logo/stamp/scan snippet, or mixed
    return textDensity > 0.015 ? 'MIXED' : 'SCANNED';
  }
  return meaningfulChars >= 15 ? 'DIGITAL' : 'SCANNED';
}

export function classifyDocument(pageTypes: PageType[]): DocumentClassification {
  if (pageTypes.length === 0) return 'DIGITAL_PDF';
  const hasDigital = pageTypes.some((t) => t === 'DIGITAL');
  const hasScanned = pageTypes.some((t) => t === 'SCANNED');
  const hasMixed = pageTypes.some((t) => t === 'MIXED');

  if (hasMixed || (hasDigital && hasScanned)) {
    return 'MIXED_PDF';
  }
  if (hasScanned) {
    return 'SCANNED_PDF';
  }
  return 'DIGITAL_PDF';
}

/**
 * Extracts text blocks, vector lines, underscore lines, and image op count for a single page via PDF.js.
 */
export async function analyzeDigitalPage(
  pdfJs: PdfJsModuleLike,
  pdfDoc: PdfJsDocumentProxy,
  pageIndex: number,
  pageGeometry?: PageGeometry,
): Promise<{
  pageAnalysis: PageAnalysis;
  imageOpsCount: number;
}> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const vMatrix = viewport.transform as Matrix6;

  // 1. Extract text items in canonical visual top-left coordinates
  const textContent = await page.getTextContent();
  const rawItems: RawTextItem[] = [];
  const underscoreLines: LineCandidate[] = [];
  let lineSeq = 0;

  for (const item of textContent.items) {
    const str = item.str ?? '';
    if (!str || !item.transform || item.transform.length < 6) continue;
    const tx = pdfJs.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.max(4, Math.hypot(tx[2] ?? 0, tx[3] ?? 0) || (item.height ?? 10));
    const width = Math.max(1, item.width ?? fontHeight * str.length * 0.5);
    // In PDF.js viewport transform, tx[4], tx[5] is the baseline origin in visual coordinates
    const x = tx[4] ?? 0;
    const baselineY = tx[5] ?? 0;
    const y = baselineY - fontHeight * 0.85;

    // Detect underscore signature placeholders like "_______" or "/_______/"
    const underscoreMatch = /_{4,}/.exec(str);
    if (underscoreMatch) {
      const startFrac = underscoreMatch.index / Math.max(1, str.length);
      const lenFrac = underscoreMatch[0].length / Math.max(1, str.length);
      const lineW = width * lenFrac;
      if (lineW >= 28) {
        underscoreLines.push({
          id: `underscore-p${pageIndex}-${lineSeq++}`,
          bounds: {
            x: x + width * startFrac,
            y: baselineY + Math.max(0.5, fontHeight * 0.08),
            width: lineW,
            height: 1.5,
          },
          length: lineW,
          thickness: 1.5,
          source: 'UNDERSCORE_TEXT',
          lineQualityScore: 0.78,
          isLikelyTableBorder: false,
        });
      }
    }

    rawItems.push({
      str,
      x,
      y,
      width,
      height: fontHeight,
    });
  }

  const textBlocks = groupTextItemsIntoBlocks(rawItems, pageIndex, 'DIGITAL_TEXT');

  // 2. Extract vector horizontal lines & image paint counts from operator list
  const ops = await page.getOperatorList();
  const OPS = pdfJs.OPS;
  const ctmStack: Matrix6[] = [];
  let currentCtm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let imageOpsCount = 0;
  const vectorLines: LineCandidate[] = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];

    if (fn === OPS.save) {
      ctmStack.push([...currentCtm]);
    } else if (fn === OPS.restore) {
      currentCtm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      currentCtm = multiplyMatrix(currentCtm, args as Matrix6);
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject ||
      fn === OPS.paintImageXObjectRepeat
    ) {
      imageOpsCount++;
    } else if (fn === OPS.constructPath && Array.isArray(args) && Array.isArray(args[1])) {
      const combinedMatrix = multiplyMatrix(vMatrix, currentCtm);
      const pathArray = args[1][0] as Float32Array | number[] | undefined;
      if (!pathArray) continue;

      let curX = 0;
      let curY = 0;
      let startX = 0;
      let startY = 0;
      let p = 0;
      const pts: Array<[number, number]> = [];

      while (p < pathArray.length) {
        const opCode = pathArray[p++];
        if (opCode === DRAW_OP_MOVE_TO) {
          curX = pathArray[p++] ?? 0;
          curY = pathArray[p++] ?? 0;
          startX = curX;
          startY = curY;
          pts.push(applyMatrix(combinedMatrix, curX, curY));
        } else if (opCode === DRAW_OP_LINE_TO) {
          const nextX = pathArray[p++] ?? 0;
          const nextY = pathArray[p++] ?? 0;
          const [vx1, vy1] = applyMatrix(combinedMatrix, curX, curY);
          const [vx2, vy2] = applyMatrix(combinedMatrix, nextX, nextY);
          pts.push([vx2, vy2]);

          // Check if segment is nearly horizontal and >= 30pt long
          const dx = Math.abs(vx2 - vx1);
          const dy = Math.abs(vy2 - vy1);
          if (dx >= 30 && dy <= 2.5) {
            const bounds: Rect = {
              x: Math.min(vx1, vx2),
              y: Math.min(vy1, vy2),
              width: dx,
              height: Math.max(1, dy),
            };
            vectorLines.push({
              id: `vec-p${pageIndex}-${lineSeq++}`,
              bounds,
              length: dx,
              thickness: Math.max(1, dy),
              source: 'VECTOR',
              lineQualityScore: 0.72,
              isLikelyTableBorder: false,
            });
          }

          curX = nextX;
          curY = nextY;
        } else if (opCode === DRAW_OP_CURVE_TO) {
          p += 6;
        } else if (opCode === DRAW_OP_QUAD_TO) {
          p += 4;
        } else if (opCode === DRAW_OP_CLOSE_PATH) {
          curX = startX;
          curY = startY;
        } else {
          break;
        }
      }

      // Also detect thin filled horizontal rectangles (e.g., 150x1pt drawn via drawRectangle)
      if (pts.length >= 4 && pts.length <= 5) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [px, py] of pts) {
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        const rectW = maxX - minX;
        const rectH = maxY - minY;
        if (rectW >= 30 && rectH > 0 && rectH <= 3.5) {
          vectorLines.push({
            id: `vec-rect-p${pageIndex}-${lineSeq++}`,
            bounds: { x: minX, y: minY, width: rectW, height: Math.max(1, rectH) },
            length: rectW,
            thickness: Math.max(1, rectH),
            source: 'VECTOR',
            lineQualityScore: 0.72,
            isLikelyTableBorder: false,
          });
        }
      }
    }
  }

  const pageType = classifyPage(textBlocks, imageOpsCount, viewport.width * viewport.height);
  const combinedLines = scoreAndClassifyLineCandidates(
    deduplicateLines([...vectorLines, ...underscoreLines]),
    textBlocks,
    viewport.width,
    viewport.height,
  );

  const rotation = pageGeometry?.rotation ?? normalizeRotation(page.rotate ?? 0);
  const mediaBox = pageGeometry?.mediaBox ?? {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  };
  const cropBox = pageGeometry?.cropBox ?? mediaBox;

  page.cleanup();

  return {
    imageOpsCount,
    pageAnalysis: {
      pageIndex,
      pageType,
      width: viewport.width,
      height: viewport.height,
      rotation,
      mediaBox,
      cropBox,
      extractedText: textBlocks,
      candidateLines: combinedLines,
      warnings: [],
      ocrExecuted: false,
      cvMethod: 'VECTOR_ONLY',
    },
  };
}
