import { existsSync, readFileSync } from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PngAsset } from '../../src/types';
import { inspectPngBytes } from '../../src/engine/image-processing';

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.byteLength));
  view.setUint32(8 + data.byteLength, crc, false);
  return out;
}

async function deflateZlib(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  void writer.write(copy).then(() => writer.close());
  const reader = cs.readable.getReader();
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
  for (const ch of chunks) {
    out.set(ch, offset);
    offset += ch.byteLength;
  }
  return out;
}

/**
 * Generates a real valid RGBA PNG byte buffer with optional transparent outer margins.
 */
export async function createTestPngBytes(options?: {
  width?: number;
  height?: number;
  padLeft?: number;
  padRight?: number;
  padTop?: number;
  padBottom?: number;
  color?: [number, number, number, number];
  transparentAll?: boolean;
}): Promise<Uint8Array> {
  const width = options?.width ?? 120;
  const height = options?.height ?? 60;
  const padLeft = options?.padLeft ?? 12;
  const padRight = options?.padRight ?? 12;
  const padTop = options?.padTop ?? 6;
  const padBottom = options?.padBottom ?? 6;
  const [r, g, b, a] = options?.color ?? [25, 65, 165, 230];

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 4;
      const inside =
        !options?.transparentAll &&
        x >= padLeft &&
        x < width - padRight &&
        y >= padTop &&
        y < height - padBottom;
      if (inside) {
        raw[idx] = r;
        raw[idx + 1] = g;
        raw[idx + 2] = b;
        raw[idx + 3] = a;
      } else {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
      }
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = await deflateZlib(raw);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makePngChunk('IHDR', ihdr);
  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(
    sig.byteLength + ihdrChunk.byteLength + idatChunk.byteLength + iendChunk.byteLength,
  );
  let pos = 0;
  for (const part of [sig, ihdrChunk, idatChunk, iendChunk]) {
    png.set(part, pos);
    pos += part.byteLength;
  }
  return png;
}

export async function createTestPngAsset(
  kind: PngAsset['kind'],
  width = 160,
  height = 70,
): Promise<PngAsset> {
  const bytes = await createTestPngBytes({ width, height });
  const info = await inspectPngBytes(bytes);
  return {
    id: `test-${kind}`,
    kind,
    fileName: `${kind.toLowerCase()}.png`,
    fileSize: bytes.byteLength,
    bytes,
    objectUrl: '',
    naturalWidth: info.width,
    naturalHeight: info.height,
    opaqueBounds: info.opaqueBounds,
    transparentPaddingRatio: info.transparentPaddingRatio,
    hasAlphaTransparency: info.hasAlphaTransparency,
  };
}

let cachedFontBytes: Uint8Array | null | undefined;

export function getCyrillicFontBytes(): Uint8Array | null {
  if (cachedFontBytes !== undefined) return cachedFontBytes;
  const candidates = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      cachedFontBytes = new Uint8Array(readFileSync(path));
      return cachedFontBytes;
    }
  }
  cachedFontBytes = null;
  return null;
}

export async function loadFixtureFont(doc: PDFDocument) {
  const fontBytes = getCyrillicFontBytes();
  if (fontBytes) {
    doc.registerFontkit(fontkit);
    return doc.embedFont(fontBytes, { subset: true });
  }
  return doc.embedFont(StandardFonts.Helvetica);
}

export interface TextLineDrawOp {
  pageIndex?: number;
  text: string;
  x: number;
  /** Y coordinate from bottom in PDF space */
  y: number;
  size?: number;
}

export interface VectorLineDrawOp {
  pageIndex?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
}

export async function createCustomPdfFixture(options: {
  pageCount?: number;
  pageSize?: [number, number];
  rotation?: 0 | 90 | 180 | 270;
  cropBox?: { x: number; y: number; width: number; height: number };
  texts?: TextLineDrawOp[];
  lines?: VectorLineDrawOp[];
  embedImageOnPages?: number[];
  addSimulatedDigitalSignature?: boolean;
  addInteractiveForm?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await loadFixtureFont(doc);
  const pageCount = options.pageCount ?? 1;
  const [pw, ph] = options.pageSize ?? [595, 842];

  const pages = Array.from({ length: pageCount }, () => {
    const p = doc.addPage([pw, ph]);
    if (options.rotation) {
      p.setRotation(degrees(options.rotation));
    }
    if (options.cropBox) {
      p.setCropBox(
        options.cropBox.x,
        options.cropBox.y,
        options.cropBox.width,
        options.cropBox.height,
      );
    }
    return p;
  });

  for (const t of options.texts ?? []) {
    const page = pages[t.pageIndex ?? 0]!;
    page.drawText(t.text, {
      x: t.x,
      y: t.y,
      size: t.size ?? 11,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  for (const l of options.lines ?? []) {
    const page = pages[l.pageIndex ?? 0]!;
    page.drawLine({
      start: { x: l.x1, y: l.y1 },
      end: { x: l.x2, y: l.y2 },
      thickness: l.thickness ?? 1,
      color: rgb(0, 0, 0),
    });
  }

  if (options.embedImageOnPages && options.embedImageOnPages.length > 0) {
    const imgBytes = await createTestPngBytes({ width: 200, height: 260, color: [240, 240, 240, 255] });
    const img = await doc.embedPng(imgBytes);
    for (const pIdx of options.embedImageOnPages) {
      const page = pages[pIdx]!;
      page.drawImage(img, { x: 20, y: 20, width: pw - 40, height: ph - 40 });
    }
  }

  if (options.addSimulatedDigitalSignature) {
    const sigDict = doc.context.obj({
      Type: PDFName.of('Sig'),
      Filter: PDFName.of('Adobe.PPKLite'),
      SubFilter: PDFName.of('adbe.pkcs7.detached'),
      ByteRange: [0, 100, 200, 300],
    });
    const sigRef = doc.context.register(sigDict);
    const sigField = doc.context.obj({
      FT: PDFName.of('Sig'),
      T: PDFName.of('Signature1'),
      V: sigRef,
    });
    const fieldRef = doc.context.register(sigField);
    const fieldsArr = PDFArray.withContext(doc.context);
    fieldsArr.push(fieldRef);
    const acroForm = doc.context.obj({
      Fields: fieldsArr,
      SigFlags: PDFNumber.of(3),
    });
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(acroForm));
  } else if (options.addInteractiveForm) {
    const txtField = doc.context.obj({
      FT: PDFName.of('Tx'),
      T: PDFName.of('ContractNumber'),
    });
    const fieldRef = doc.context.register(txtField);
    const fieldsArr = PDFArray.withContext(doc.context);
    fieldsArr.push(fieldRef);
    const acroForm = doc.context.obj({ Fields: fieldsArr });
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(acroForm));
  }

  // Keep PDFDict imported
  void PDFDict;

  return doc.save();
}
