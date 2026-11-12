import React, { useId } from 'react';
import { AlertTriangle, Ban, CheckCircle2, CopyCheck, EyeOff, RotateCcw } from 'lucide-react';
import type { DocumentResult, ResolvedStampOwner, SignerConfig, StampConfig } from '../../types';
import type { Translations } from '../../i18n';
import { canApproveDocument } from '../../engine/validation';
import type { ReviewEditTool } from '../pdf-viewer/PdfPageCanvas';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Select } from '../ui/select';
import { DetectionStatus } from './detection-status';

export interface ReviewPanelProps {
  doc: DocumentResult;
  signers: SignerConfig[];
  stamps: StampConfig[];
  activeTool: ReviewEditTool;
  onActiveToolChange: (tool: NonNullable<ReviewEditTool>, jumpToPage?: number) => void;
  onToggleSkipSigner: (signerId: string, skipped: boolean) => void;
  onToggleSkipStamp: (stampId: string, skipped: boolean) => void;
  onStampOwnerChange: (stampId: string, owner: ResolvedStampOwner) => void;
  onCryptoAckChange: (acknowledged: boolean) => void;
  onApprove: () => void;
  onApplyToAll: () => void;
  onExclude: () => void;
  t: Translations;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  doc,
  signers,
  stamps,
  activeTool,
  onActiveToolChange,
  onToggleSkipSigner,
  onToggleSkipStamp,
  onStampOwnerChange,
  onCryptoAckChange,
  onApprove,
  onApplyToAll,
  onExclude,
  t,
}) => {
  const cryptoAckId = useId();
  const ownerSelectId = useId();

  const canApprove = canApproveDocument(doc);

  const signerEntries = doc.signerResults ?? [];
  const stampEntries = doc.stampResults ?? [];

  const canApplyToAll =
    signerEntries.some((s) => !s.skipped && Boolean(s.anchor)) ||
    stampEntries.some((s) => !s.skipped && Boolean(s.placement));

  const activeStampEntry =
    activeTool?.kind === 'STAMP'
      ? stampEntries.find((s) => s.stampId === activeTool.id) ?? null
      : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Dynamic Signers & Stamps Tool Picker */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-[var(--color-text-secondary)]">
            {t.review.activeTool}
          </div>

          <div className="space-y-1.5">
            {signerEntries.map((entry, idx) => {
              const cfg = signers.find((s) => s.id === entry.signerId);
              const name = cfg?.profile.fullName.trim();
              const label = name ? `${idx + 1}. ${name}` : `${idx + 1}. ${t.profiles.signerHeading}`;
              const isSelected = activeTool?.kind === 'SIGNER' && activeTool.id === entry.signerId;

              return (
                <div
                  key={entry.signerId}
                  className={`flex items-center justify-between gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 transition-colors ${
                    entry.skipped
                      ? 'border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] opacity-60'
                      : isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-canvas)]'
                  }`}
                >
                  <button
                    type="button"
                    disabled={entry.skipped}
                    onClick={() =>
                      onActiveToolChange(
                        { kind: 'SIGNER', id: entry.signerId },
                        entry.anchor?.pageIndex,
                      )
                    }
                    className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-default"
                  >
                    <span className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                      {label}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums">
                      {entry.skipped ? (
                        <span className="text-[var(--color-text-muted)]">{t.review.skippedBadge}</span>
                      ) : entry.anchor ? (
                        <span className="text-[var(--color-success)]">
                          {entry.anchor.pageIndex + 1}-{t.analyze.pageSuffix} ({Math.round(entry.anchor.confidence * 100)}%)
                        </span>
                      ) : (
                        <span className="text-[var(--color-warning)]">{t.review.notFoundLabel}</span>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label={entry.skipped ? t.review.restoreForDocBtn : t.review.skipForDocBtn}
                    title={entry.skipped ? t.review.restoreForDocBtn : t.review.skipForDocBtn}
                    onClick={() => onToggleSkipSigner(entry.signerId, !entry.skipped)}
                    className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
                  >
                    {entry.skipped ? (
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}

            {stampEntries.map((entry, idx) => {
              const cfg = stamps.find((s) => s.id === entry.stampId);
              const label = cfg?.label || `${idx + 1}. ${t.stamp.cardTitle}`;
              const isSelected = activeTool?.kind === 'STAMP' && activeTool.id === entry.stampId;

              return (
                <div
                  key={entry.stampId}
                  className={`flex items-center justify-between gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 transition-colors ${
                    entry.skipped
                      ? 'border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] opacity-60'
                      : isSelected
                        ? 'border-rose-500 bg-rose-50/70'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-canvas)]'
                  }`}
                >
                  <button
                    type="button"
                    disabled={entry.skipped}
                    onClick={() =>
                      onActiveToolChange(
                        { kind: 'STAMP', id: entry.stampId },
                        entry.placement?.pageIndex,
                      )
                    }
                    className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-default"
                  >
                    <span className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                      {label}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums">
                      {entry.skipped ? (
                        <span className="text-[var(--color-text-muted)]">{t.review.skippedBadge}</span>
                      ) : entry.placement ? (
                        <span className="text-[var(--color-success)]">
                          {entry.placement.pageIndex + 1}-{t.analyze.pageSuffix}
                        </span>
                      ) : (
                        <span className="text-[var(--color-warning)]">{t.review.notFoundLabel}</span>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label={entry.skipped ? t.review.restoreForDocBtn : t.review.skipForDocBtn}
                    title={entry.skipped ? t.review.restoreForDocBtn : t.review.skipForDocBtn}
                    onClick={() => onToggleSkipStamp(entry.stampId, !entry.skipped)}
                    className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
                  >
                    {entry.skipped ? (
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stamp Owner selector when a stamp is active */}
        {activeStampEntry && !activeStampEntry.skipped && (
          <div className="flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
            <label
              htmlFor={ownerSelectId}
              className="text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t.review.stampOwnerField}
            </label>
            <Select
              id={ownerSelectId}
              selectSize="sm"
              value={
                signers.some((s) => s.id === activeStampEntry.owner)
                  ? activeStampEntry.owner
                  : 'MANUAL'
              }
              onChange={(e) =>
                onStampOwnerChange(activeStampEntry.stampId, e.target.value as ResolvedStampOwner)
              }
            >
              {signers.map((signer, idx) => {
                const name = signer.profile.fullName.trim();
                const label = name
                  ? `${idx + 1}. ${name}`
                  : `${idx + 1}. ${t.profiles.signerHeading}`;
                return (
                  <option key={signer.id} value={signer.id}>
                    {label}
                  </option>
                );
              })}
              <option value="MANUAL">{t.review.ownerOptionManual}</option>
            </Select>
          </div>
        )}

        {/* Collapsible Detection Evidence & Score Breakdown */}
        {signerEntries.length > 0 && (
          <details className="group border-t border-[var(--color-border-subtle)] pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              <span>{t.review.evidenceTitle}</span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                {signerEntries
                  .map((s) => (s.skipped ? '—' : s.anchor ? `${Math.round(s.anchor.confidence * 100)}%` : '—'))
                  .join(' / ')}
              </span>
            </summary>
            <div className="mt-2.5 space-y-2">
              {signerEntries.map((entry, idx) => {
                const cfg = signers.find((s) => s.id === entry.signerId);
                const label = cfg?.profile.fullName.trim() || `${t.profiles.signerHeading} ${idx + 1}`;
                return (
                  <DetectionStatus
                    key={entry.signerId}
                    label={label}
                    anchor={entry.skipped ? null : entry.anchor}
                    notFoundLabel={entry.skipped ? t.review.skippedBadge : t.review.notFoundLabel}
                    scoreLabels={{
                      name: t.review.scoreName,
                      role: t.review.scoreRole,
                      context: t.review.scoreContext,
                      line: t.review.scoreLine,
                    }}
                  />
                );
              })}
            </div>
          </details>
        )}

        {/* Cryptographic signature acknowledgement */}
        {doc.integrity.hasDigitalSignature && (
          <div className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--color-warning-subtle)] p-2.5 text-xs text-[var(--color-warning)]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <Checkbox
                id={cryptoAckId}
                checked={doc.cryptoSignatureAcknowledged}
                onChange={(e) => onCryptoAckChange(e.target.checked)}
                label={t.review.cryptoAckLabel}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 border-t border-[var(--color-border-subtle)] pt-3">
          <Button
            variant="success"
            size="md"
            disabled={!canApprove}
            onClick={onApprove}
            className="w-full text-xs"
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t.review.confirmApproveBtn}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={!canApplyToAll}
            onClick={onApplyToAll}
            className="w-full"
          >
            <CopyCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t.review.applyToAllBtn}
          </Button>

          <Button variant="destructive" size="sm" onClick={onExclude} className="w-full">
            <Ban className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t.review.excludeDocBtn}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
