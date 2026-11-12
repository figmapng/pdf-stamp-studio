import React from 'react';
import { Stamp } from 'lucide-react';
import type { PngAsset } from '../../types';
import { SignaturePreview } from './signature-preview';

export interface StampPreviewProps {
  asset: PngAsset | null;
  alt: string;
  emptyLabel: string;
  transparentOkLabel: string;
  opaqueWarningLabel: string;
  paddingLabel: string;
  ownerSummary?: string;
  className?: string;
}

export const StampPreview: React.FC<StampPreviewProps> = ({
  ownerSummary,
  ...props
}) => {
  return (
    <div className="space-y-2">
      <SignaturePreview {...props} />
      {ownerSummary && (
        <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
          <Stamp className="h-3.5 w-3.5 text-[var(--color-danger)]" strokeWidth={1.75} aria-hidden="true" />
          <span>{ownerSummary}</span>
        </div>
      )}
    </div>
  );
};
