import React, { useEffect, useRef, useState } from 'react';
import type { Placement, PngAsset, Rect, SignatureAnchor } from '../../types';
import { loadPdfJs, type PdfJsDocumentProxy } from '../../engine/pdf-parser';

export type ReviewEditTool =
  | { kind: 'SIGNER'; id: string }
  | { kind: 'STAMP'; id: string }
  | null;

export interface CanvasSignerItem {
  id: string;
  label: string;
  anchor: SignatureAnchor | null;
  asset: PngAsset | null;
  skipped?: boolean;
}

export interface CanvasStampItem {
  id: string;
  label: string;
  placement: Placement | null;
  asset: PngAsset | null;
  skipped?: boolean;
}

interface PdfPageCanvasProps {
  pdfBytes: Uint8Array;
  sharedPdfDoc?: PdfJsDocumentProxy | null;
  pageIndex: number;
  zoom: number;
  signers: CanvasSignerItem[];
  stamps: CanvasStampItem[];
  activeTool: ReviewEditTool;
  compareOriginal: boolean;
  onSelectTool?: (tool: NonNullable<ReviewEditTool>) => void;
  onMoveItem: (tool: NonNullable<ReviewEditTool>, nextBounds: Rect, pageIndex: number) => void;
}

const SIGNER_PALETTES = [
  {
    lineBg: 'bg-indigo-500/70',
    activeBox: 'border-indigo-600 ring-2 ring-indigo-300 bg-indigo-500/10',
    idleBox: 'border-indigo-400 bg-indigo-500/10',
    pillBg: 'bg-indigo-600',
  },
  {
    lineBg: 'bg-emerald-500/70',
    activeBox: 'border-emerald-600 ring-2 ring-emerald-300 bg-emerald-500/10',
    idleBox: 'border-emerald-400 bg-emerald-500/10',
    pillBg: 'bg-emerald-600',
  },
  {
    lineBg: 'bg-violet-500/70',
    activeBox: 'border-violet-600 ring-2 ring-violet-300 bg-violet-500/10',
    idleBox: 'border-violet-400 bg-violet-500/10',
    pillBg: 'bg-violet-600',
  },
  {
    lineBg: 'bg-sky-500/70',
    activeBox: 'border-sky-600 ring-2 ring-sky-300 bg-sky-500/10',
    idleBox: 'border-sky-400 bg-sky-500/10',
    pillBg: 'bg-sky-600',
  },
  {
    lineBg: 'bg-amber-500/70',
    activeBox: 'border-amber-600 ring-2 ring-amber-300 bg-amber-500/10',
    idleBox: 'border-amber-400 bg-amber-500/10',
    pillBg: 'bg-amber-600',
  },
];

const STAMP_PALETTES = [
  {
    activeBox: 'border-rose-600 ring-2 ring-rose-300 bg-rose-500/10',
    idleBox: 'border-rose-400 bg-rose-500/10',
    pillBg: 'bg-rose-600',
  },
  {
    activeBox: 'border-orange-600 ring-2 ring-orange-300 bg-orange-500/10',
    idleBox: 'border-orange-400 bg-orange-500/10',
    pillBg: 'bg-orange-600',
  },
  {
    activeBox: 'border-fuchsia-600 ring-2 ring-fuchsia-300 bg-fuchsia-500/10',
    idleBox: 'border-fuchsia-400 bg-fuchsia-500/10',
    pillBg: 'bg-fuchsia-600',
  },
];

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfBytes,
  sharedPdfDoc,
  pageIndex,
  zoom,
  signers,
  stamps,
  activeTool,
  compareOriginal,
  onSelectTool,
  onMoveItem,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PdfJsDocumentProxy | null>(null);

  const [pageDims, setPageDims] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });
  const [renderError, setRenderError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize';
    tool: NonNullable<ReviewEditTool>;
    startClientX: number;
    startClientY: number;
    origRect: Rect;
  } | null>(null);

  useEffect(() => {
    if (sharedPdfDoc !== undefined) {
      pdfDocRef.current = sharedPdfDoc;
      return;
    }

    let cancelled = false;
    let docInstance: PdfJsDocumentProxy | null = null;
    let taskInstance: { promise: Promise<PdfJsDocumentProxy>; destroy: () => Promise<void> } | null =
      null;

    const openDoc = async () => {
      try {
        setRenderError(null);
        const pdfJs = await loadPdfJs();
        const task = pdfJs.getDocument({
          data: new Uint8Array(pdfBytes),
          cMapUrl: '/wasm/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/wasm/pdfjs/standard_fonts/',
          isEvalSupported: false,
        });
        taskInstance = task;
        docInstance = await task.promise;
        if (cancelled) {
          await docInstance.cleanup().catch(() => undefined);
          await task.destroy().catch(() => undefined);
          return;
        }
        pdfDocRef.current = docInstance;
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void openDoc();

    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        void pdfDocRef.current.cleanup().catch(() => undefined);
        pdfDocRef.current = null;
      } else if (docInstance) {
        void docInstance.cleanup().catch(() => undefined);
      }
      if (taskInstance) {
        void taskInstance.destroy().catch(() => undefined);
      }
    };
  }, [pdfBytes, sharedPdfDoc]);

  useEffect(() => {
    let cancelled = false;
    let renderTimeout: ReturnType<typeof setTimeout> | null = null;

    const renderPage = async () => {
      const doc = sharedPdfDoc !== undefined ? sharedPdfDoc : pdfDocRef.current;
      if (!doc || !canvasRef.current) {
        renderTimeout = setTimeout(() => {
          if (!cancelled) void renderPage();
        }, 80);
        return;
      }

      try {
        const clampedIndex = Math.max(0, Math.min(doc.numPages - 1, pageIndex));
        const page = await doc.getPage(clampedIndex + 1);
        const viewport1 = page.getViewport({ scale: 1 });
        const viewportZoom = page.getViewport({ scale: zoom });
        if (cancelled || !canvasRef.current) {
          page.cleanup();
          return;
        }

        setPageDims({ width: viewport1.width, height: viewport1.height });

        const canvas = canvasRef.current;
        canvas.width = Math.round(viewportZoom.width);
        canvas.height = Math.round(viewportZoom.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          page.cleanup();
          return;
        }

        await page.render({ canvasContext: ctx, viewport: viewportZoom }).promise;
        page.cleanup();
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTimeout) clearTimeout(renderTimeout);
    };
  }, [pdfBytes, sharedPdfDoc, pageIndex, zoom]);

  const toVisualPx = (pt: number) => pt * zoom;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (compareOriginal || dragState || !activeTool) return;
    if ((e.target as HTMLElement).dataset.overlayItem) return;
    const container = overlayRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickPtX = (e.clientX - rect.left) / zoom;
    const clickPtY = (e.clientY - rect.top) / zoom;

    let currentRect: Rect | undefined;
    let asset: PngAsset | null = null;

    if (activeTool.kind === 'SIGNER') {
      const s = signers.find((item) => item.id === activeTool.id);
      currentRect = s?.anchor?.placementBounds;
      asset = s?.asset ?? null;
    } else {
      const st = stamps.find((item) => item.id === activeTool.id);
      currentRect = st?.placement?.bounds;
      asset = st?.asset ?? null;
    }

    const defaultW = activeTool.kind === 'STAMP' ? (currentRect?.width ?? 112) : (currentRect?.width ?? 110);
    const defaultH =
      currentRect?.height ??
      (asset && asset.naturalWidth > 0 && asset.naturalHeight > 0
        ? defaultW / (asset.naturalWidth / asset.naturalHeight)
        : activeTool.kind === 'STAMP'
          ? 112
          : 42);

    const nextRect: Rect = {
      x: Math.max(0, Math.min(pageDims.width - defaultW, clickPtX - defaultW / 2)),
      y: Math.max(0, Math.min(pageDims.height - defaultH, clickPtY - defaultH / 2)),
      width: defaultW,
      height: defaultH,
    };

    onMoveItem(activeTool, nextRect, pageIndex);
  };

  const handlePointerDownItem = (
    e: React.PointerEvent<HTMLDivElement>,
    tool: NonNullable<ReviewEditTool>,
    origRect: Rect,
    mode: 'move' | 'resize' = 'move',
  ) => {
    if (compareOriginal) return;
    e.stopPropagation();
    onSelectTool?.(tool);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      mode,
      tool,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origRect,
    });
  };

  const handlePointerMoveItem = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const dxPt = (e.clientX - dragState.startClientX) / zoom;
    const dyPt = (e.clientY - dragState.startClientY) / zoom;

    if (dragState.mode === 'resize') {
      const aspect =
        dragState.origRect.height > 0
          ? dragState.origRect.width / dragState.origRect.height
          : 1;
      const maxW = pageDims.width - dragState.origRect.x;
      const maxH = pageDims.height - dragState.origRect.y;
      const rawW = Math.max(24, dragState.origRect.width + dxPt);
      const cappedW = Math.min(maxW, maxH * aspect, rawW);
      const nextH = Math.max(16, cappedW / Math.max(0.25, aspect));
      onMoveItem(
        dragState.tool,
        {
          ...dragState.origRect,
          width: Number(cappedW.toFixed(2)),
          height: Number(nextH.toFixed(2)),
        },
        pageIndex,
      );
      return;
    }

    const nextRect: Rect = {
      ...dragState.origRect,
      x: Math.max(0, Math.min(pageDims.width - dragState.origRect.width, dragState.origRect.x + dxPt)),
      y: Math.max(0, Math.min(pageDims.height - dragState.origRect.height, dragState.origRect.y + dyPt)),
    };
    onMoveItem(dragState.tool, nextRect, pageIndex);
  };

  const handlePointerUpItem = () => {
    setDragState(null);
  };

  return (
    <div className="relative inline-block overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      {renderError && (
        <div role="alert" className="bg-rose-50 p-3 text-xs font-medium text-rose-700">
          {renderError}
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        style={{
          width: `${toVisualPx(pageDims.width)}px`,
          height: `${toVisualPx(pageDims.height)}px`,
        }}
        className="absolute inset-0 cursor-crosshair select-none"
      >
        {!compareOriginal &&
          signers.map((signer, idx) => {
            if (signer.skipped || !signer.anchor || signer.anchor.pageIndex !== pageIndex) {
              return null;
            }
            const palette = SIGNER_PALETTES[idx % SIGNER_PALETTES.length]!;
            const isActive = activeTool?.kind === 'SIGNER' && activeTool.id === signer.id;
            return (
              <React.Fragment key={signer.id}>
                <div
                  aria-hidden="true"
                  style={{
                    left: `${toVisualPx(signer.anchor.lineBounds.x)}px`,
                    top: `${toVisualPx(signer.anchor.lineBounds.y)}px`,
                    width: `${toVisualPx(signer.anchor.lineBounds.width)}px`,
                    height: `${Math.max(2, toVisualPx(signer.anchor.lineBounds.height))}px`,
                  }}
                  className={`pointer-events-none absolute ${palette.lineBg}`}
                />
                <div
                  data-overlay-item={`SIGNER-${signer.id}`}
                  onPointerDown={(e) =>
                    handlePointerDownItem(
                      e,
                      { kind: 'SIGNER', id: signer.id },
                      signer.anchor!.placementBounds,
                    )
                  }
                  onPointerMove={handlePointerMoveItem}
                  onPointerUp={handlePointerUpItem}
                  style={{
                    left: `${toVisualPx(signer.anchor.placementBounds.x)}px`,
                    top: `${toVisualPx(signer.anchor.placementBounds.y)}px`,
                    width: `${toVisualPx(signer.anchor.placementBounds.width)}px`,
                    height: `${toVisualPx(signer.anchor.placementBounds.height)}px`,
                  }}
                  className={`absolute touch-none cursor-move rounded border-2 ${
                    isActive ? palette.activeBox : palette.idleBox
                  }`}
                >
                  <span
                    className={`pointer-events-none absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap ${palette.pillBg}`}
                  >
                    {signer.label}
                  </span>
                  {signer.asset && (
                    <img
                      src={signer.asset.objectUrl}
                      alt={signer.label}
                      className="pointer-events-none h-full w-full object-contain"
                    />
                  )}
                  {isActive && (
                    <div
                      data-overlay-item={`RESIZE-SIGNER-${signer.id}`}
                      onPointerDown={(e) =>
                        handlePointerDownItem(
                          e,
                          { kind: 'SIGNER', id: signer.id },
                          signer.anchor!.placementBounds,
                          'resize',
                        )
                      }
                      onPointerMove={handlePointerMoveItem}
                      onPointerUp={handlePointerUpItem}
                      className="absolute -right-2 -bottom-2 h-4 w-4 touch-none cursor-nwse-resize rounded-full border-2 border-white bg-indigo-600 shadow-xs sm:-right-1.5 sm:-bottom-1.5 sm:h-3 sm:w-3"
                    />
                  )}
                </div>
              </React.Fragment>
            );
          })}

        {!compareOriginal &&
          stamps.map((stamp, idx) => {
            if (stamp.skipped || !stamp.placement || stamp.placement.pageIndex !== pageIndex) {
              return null;
            }
            const palette = STAMP_PALETTES[idx % STAMP_PALETTES.length]!;
            const isActive = activeTool?.kind === 'STAMP' && activeTool.id === stamp.id;
            return (
              <div
                key={stamp.id}
                data-overlay-item={`STAMP-${stamp.id}`}
                onPointerDown={(e) =>
                  handlePointerDownItem(
                    e,
                    { kind: 'STAMP', id: stamp.id },
                    stamp.placement!.bounds,
                  )
                }
                onPointerMove={handlePointerMoveItem}
                onPointerUp={handlePointerUpItem}
                style={{
                  left: `${toVisualPx(stamp.placement.bounds.x)}px`,
                  top: `${toVisualPx(stamp.placement.bounds.y)}px`,
                  width: `${toVisualPx(stamp.placement.bounds.width)}px`,
                  height: `${toVisualPx(stamp.placement.bounds.height)}px`,
                  transform: `rotate(${stamp.placement.rotation}deg)`,
                }}
                className={`absolute touch-none cursor-move rounded border-2 ${
                  isActive ? palette.activeBox : palette.idleBox
                }`}
              >
                <span
                  className={`pointer-events-none absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap ${palette.pillBg}`}
                >
                  {stamp.label}
                </span>
                {stamp.asset && (
                  <img
                    src={stamp.asset.objectUrl}
                    alt={stamp.label}
                    className="pointer-events-none h-full w-full object-contain"
                  />
                )}
                {isActive && (
                  <div
                    data-overlay-item={`RESIZE-STAMP-${stamp.id}`}
                    onPointerDown={(e) =>
                      handlePointerDownItem(
                        e,
                        { kind: 'STAMP', id: stamp.id },
                        stamp.placement!.bounds,
                        'resize',
                      )
                    }
                    onPointerMove={handlePointerMoveItem}
                    onPointerUp={handlePointerUpItem}
                    className="absolute -right-2 -bottom-2 h-4 w-4 touch-none cursor-nwse-resize rounded-full border-2 border-white bg-rose-600 shadow-xs sm:-right-1.5 sm:-bottom-1.5 sm:h-3 sm:w-3"
                  />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};
