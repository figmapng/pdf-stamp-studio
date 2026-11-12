import JSZip from 'jszip';
import { PDFDocument, degrees } from 'pdf-lib';
import type {
  BatchExportReport,
  DocumentResult,
  PageGeometry,
  PngAsset,
  SignerConfig,
  StampConfig,
  StampPolicy,
} from '../../types';
import {
  makeUniqueFileName,
  validateDocumentForExport,
  validateMultiDocumentForExport,
} from '../validation';
import { clampRectWithinPage, visualRectToPdfDrawParams } from './coordinates';

function normalizeRotation(rot: number): 0 | 90 | 180 | 270 {
  const mod = ((rot % 360) + 360) % 360;
  if (mod === 90) return 90;
  if (mod === 180) return 180;
  if (mod === 270) return 270;
  return 0;
}

export interface StampedPdfOutput {
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
}

/**
 * Embeds Person A signature (1x), Person B signature (1x), and Stamp (1x)
 * onto a fresh copy of `sourceBytes` using `pdf-lib`.
 * Never mutates `sourceBytes`. Never flattens existing forms/annotations.
 */
export async function exportStampedPdf(params: {
  sourceBytes: Uint8Array;
  documentResult: DocumentResult;
  signers?: SignerConfig[];
  stamps?: StampConfig[];
  assets?: {
    signatureA: PngAsset | null;
    signatureB: PngAsset | null;
    stamp: PngAsset | null;
  };
  policy?: StampPolicy;
}): Promise<StampedPdfOutput> {
  const { sourceBytes, documentResult, signers, stamps = [], assets, policy } = params;
  const isMulti =
    signers !== undefined &&
    (documentResult.signerResults !== undefined || documentResult.stampResults !== undefined);

  const gate = isMulti
    ? validateMultiDocumentForExport(documentResult, signers!, stamps)
    : validateDocumentForExport(documentResult, assets!, policy!);
  if (!gate.canExport) {
    throw new Error(`Export blocked by validation policy: ${gate.reasons.join(', ')}`);
  }

  const pdfDoc = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });

  const pages = pdfDoc.getPages();
  if (pages.length !== documentResult.pageCount) {
    throw new Error(`Page count mismatch: expected ${documentResult.pageCount}, got ${pages.length}`);
  }

  const getGeometry = (pageIndex: number): PageGeometry => {
    const page = pages[pageIndex]!;
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
  };

  const drawOverlay = (
    pageIndex: number,
    embeddedImg: Awaited<ReturnType<PDFDocument['embedPng']>>,
    bounds: { x: number; y: number; width: number; height: number },
    rotationDeg: number,
  ) => {
    const page = pages[pageIndex]!;
    const geom = getGeometry(pageIndex);
    const clamped = clampRectWithinPage(bounds, geom.width, geom.height);
    const drawParams = visualRectToPdfDrawParams(clamped, rotationDeg, geom);
    page.drawImage(embeddedImg, {
      x: drawParams.x,
      y: drawParams.y,
      width: drawParams.width,
      height: drawParams.height,
      rotate: degrees(drawParams.rotateDegrees),
    });
  };

  if (isMulti) {
    const embeddedCache = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>();
    const getEmbedded = async (asset: PngAsset) => {
      const cached = embeddedCache.get(asset.id);
      if (cached) return cached;
      const embedded = await pdfDoc.embedPng(asset.bytes);
      embeddedCache.set(asset.id, embedded);
      return embedded;
    };

    const signerAssetMap = new Map(signers!.map((s) => [s.id, s.asset]));
    const stampAssetMap = new Map(stamps.map((s) => [s.id, s.asset]));

    for (const sEntry of documentResult.signerResults ?? []) {
      if (sEntry.skipped || !sEntry.anchor) continue;
      const asset = signerAssetMap.get(sEntry.signerId);
      if (!asset) continue;
      const embedded = await getEmbedded(asset);
      drawOverlay(sEntry.anchor.pageIndex, embedded, sEntry.anchor.placementBounds, 0);
    }

    for (const stEntry of documentResult.stampResults ?? []) {
      if (stEntry.skipped || !stEntry.placement) continue;
      const asset = stampAssetMap.get(stEntry.stampId);
      if (!asset) continue;
      const embedded = await getEmbedded(asset);
      drawOverlay(
        stEntry.placement.pageIndex,
        embedded,
        stEntry.placement.bounds,
        stEntry.placement.rotation,
      );
    }
  } else {
    const sigA = documentResult.signatures.personA!;
    const sigB = documentResult.signatures.personB!;
    const stampPlacement = documentResult.stamp.placement!;

    // Embed PNG assets preserving alpha transparency
    const embeddedSigA = await pdfDoc.embedPng(assets!.signatureA!.bytes);
    const embeddedSigB = await pdfDoc.embedPng(assets!.signatureB!.bytes);
    const embeddedStamp = await pdfDoc.embedPng(assets!.stamp!.bytes);

    // Draw exactly 1 Person A signature, 1 Person B signature, and 1 Stamp
    drawOverlay(sigA.pageIndex, embeddedSigA, sigA.placementBounds, 0);
    drawOverlay(sigB.pageIndex, embeddedSigB, sigB.placementBounds, 0);
    drawOverlay(
      stampPlacement.pageIndex,
      embeddedStamp,
      stampPlacement.bounds,
      stampPlacement.rotation,
    );
  }

  const outBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    bytes: outBytes,
    fileName: documentResult.fileName,
    pageCount: pages.length,
  };
}

/**
 * Packages only COMPLETED stamped PDFs into a ZIP archive alongside an audit JSON report,
 * using collision-safe unique filenames.
 */
export async function buildExportZip(params: {
  completedOutputs: StampedPdfOutput[];
  report: BatchExportReport;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of params.completedOutputs) {
    const uniqueName = makeUniqueFileName(item.fileName, usedNames);
    zip.file(uniqueName, item.bytes);
  }

  zip.file('processing-report.json', JSON.stringify(params.report, null, 2));

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function buildCsvReport(report: BatchExportReport): string {
  const header = [
    'documentId',
    'fileName',
    'status',
    'classification',
    'pageCount',
    'personAStatus',
    'personBStatus',
    'stampOwner',
    'stampCount',
    'warnings',
    'errors',
  ].join(',');

  const escapeCsv = (val: string | number): string => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = report.documents.map((d) =>
    [
      escapeCsv(d.documentId),
      escapeCsv(d.fileName),
      escapeCsv(d.status),
      escapeCsv(d.classification),
      escapeCsv(d.pageCount),
      escapeCsv(d.personAStatus),
      escapeCsv(d.personBStatus),
      escapeCsv(d.stampOwner),
      escapeCsv(d.stampCount),
      escapeCsv(d.warnings.join('; ')),
      escapeCsv(d.errors.join('; ')),
    ].join(','),
  );

  return [header, ...rows].join('\n');
}
