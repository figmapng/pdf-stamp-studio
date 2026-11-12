import React from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, IconButton } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export interface PDFViewerToolbarProps {
  pageIndex: number;
  pageCount: number;
  zoom: number;
  compareOriginal: boolean;
  viewMode?: 'PLACED' | 'SINGLE';
  placedPageCount?: number;
  placedPagesLabel?: string;
  singlePageLabel?: string;
  onViewModeChange?: (mode: 'PLACED' | 'SINGLE') => void;
  pageLabel: string;
  ofPagesLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  compareOriginalLabel: string;
  compareStampedLabel: string;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleCompare: () => void;
  className?: string;
}

export const PDFViewerToolbar: React.FC<PDFViewerToolbarProps> = ({
  pageIndex,
  pageCount,
  zoom,
  compareOriginal,
  viewMode = 'SINGLE',
  placedPageCount = 0,
  placedPagesLabel = 'Placed pages',
  singlePageLabel = 'By page',
  onViewModeChange,
  pageLabel,
  ofPagesLabel,
  zoomInLabel,
  zoomOutLabel,
  compareOriginalLabel,
  compareStampedLabel,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onToggleCompare,
  className,
}) => {
  return (
    <TooltipProvider>
      <div
        role="toolbar"
        aria-label="PDF preview controls"
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2 shadow-[var(--shadow-xs)]',
          className,
        )}
      >
        <div role="group" aria-label="Page navigation" className="flex flex-wrap items-center gap-1.5">
          {onViewModeChange && placedPageCount > 1 && (
            <div className="mr-1 inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] p-0.5">
              <button
                type="button"
                aria-pressed={viewMode === 'PLACED'}
                onClick={() => onViewModeChange('PLACED')}
                className={cn(
                  'cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-semibold transition-colors',
                  viewMode === 'PLACED'
                    ? 'bg-[var(--color-bg-surface)] text-[var(--color-primary)] shadow-[var(--shadow-xs)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {placedPagesLabel} ({placedPageCount})
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'SINGLE'}
                onClick={() => onViewModeChange('SINGLE')}
                className={cn(
                  'cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-semibold transition-colors',
                  viewMode === 'SINGLE'
                    ? 'bg-[var(--color-bg-surface)] text-[var(--color-primary)] shadow-[var(--shadow-xs)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {singlePageLabel}
              </button>
            </div>
          )}

          {viewMode === 'SINGLE' && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="outline"
                    size="sm"
                    disabled={pageIndex <= 0}
                    onClick={onPrevPage}
                    aria-label="Previous page"
                    icon={<ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                  />
                </TooltipTrigger>
                <TooltipContent>Previous page</TooltipContent>
              </Tooltip>

              <span className="px-2 text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
                {pageLabel} {pageIndex + 1} {ofPagesLabel} {pageCount}
              </span>

              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="outline"
                    size="sm"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={onNextPage}
                    aria-label="Next page"
                    icon={<ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                  />
                </TooltipTrigger>
                <TooltipContent>Next page</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <span
          role="separator"
          aria-orientation="vertical"
          className="hidden h-5 w-px bg-[var(--color-border-subtle)] sm:inline-block"
        />

        <div role="group" aria-label="Zoom and comparison" className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="outline"
                size="sm"
                onClick={onZoomOut}
                aria-label={zoomOutLabel}
                icon={<ZoomOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              />
            </TooltipTrigger>
            <TooltipContent>{zoomOutLabel}</TooltipContent>
          </Tooltip>

          <span className="w-12 text-center text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
            {Math.round(zoom * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="outline"
                size="sm"
                onClick={onZoomIn}
                aria-label={zoomInLabel}
                icon={<ZoomIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              />
            </TooltipTrigger>
            <TooltipContent>{zoomInLabel}</TooltipContent>
          </Tooltip>

          <Button
            type="button"
            variant={compareOriginal ? 'primary' : 'outline'}
            size="sm"
            aria-pressed={compareOriginal}
            onClick={onToggleCompare}
            className="ml-1"
          >
            {compareOriginal ? (
              <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            <span>{compareOriginal ? compareStampedLabel : compareOriginalLabel}</span>
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
};
