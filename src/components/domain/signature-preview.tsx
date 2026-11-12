import React from 'react';
import { AlertTriangle, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import type { PngAsset } from '../../types';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/badge';

export interface SignaturePreviewProps {
  asset: PngAsset | null;
  alt: string;
  emptyLabel: string;
  transparentOkLabel: string;
  opaqueWarningLabel: string;
  paddingLabel?: string;
  className?: string;
}

export const SignaturePreview: React.FC<SignaturePreviewProps> = ({
  asset,
  alt,
  emptyLabel,
  transparentOkLabel,
  opaqueWarningLabel,
  className,
}) => {
  if (!asset) {
    return (
      <div
        className={cn(
          'flex h-20 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] text-center text-xs text-[var(--color-text-muted)]',
          className,
        )}
      >
        <ImageIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="png-checkerboard flex h-20 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5">
        <img src={asset.objectUrl} alt={alt} className="max-h-full max-w-full object-contain" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <span className="max-w-[140px] truncate font-medium text-[var(--color-text-primary)]">
          {asset.fileName}
        </span>
        <span className="font-mono text-[11px] tabular-nums">
          {asset.naturalWidth}×{asset.naturalHeight}
        </span>
        {asset.hasAlphaTransparency ? (
          <Badge variant="success">
            <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            {transparentOkLabel}
          </Badge>
        ) : (
          <Badge variant="warning">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            {opaqueWarningLabel}
          </Badge>
        )}
      </div>
    </div>
  );
};
