import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Plus, Save, Stamp, Trash2, UserCheck } from 'lucide-react';
import type { PersonProfile, PngAsset, SignerConfig, StampConfig } from '../../types';
import type { Translations } from '../../i18n';
import { findSharedNameTokens } from '../../engine/text-normalizer';
import { cn } from '../../lib/cn';
import { Button, Card, CardContent, CardHeader, CardTitle, IconButton, Input } from '../ui';
import { AssetManagerCard } from './AssetManagerCard';
import { StampSettingsPanel } from '../stamp-settings/StampSettingsPanel';

interface ProfileSetupPanelProps {
  signers: SignerConfig[];
  stamps: StampConfig[];
  /** true when signatories/stamps were changed after the last Save */
  isDirty: boolean;
  /** time of the last Save click in this session (null = not saved yet in this session) */
  savedAt: number | null;
  /** running inside the Windows app (saved data also goes to the Excel button) */
  isDesktop: boolean;
  onSave: () => void;
  onAddSigner: () => void;
  onUpdateSigner: (id: string, next: SignerConfig) => void;
  onRemoveSigner: (id: string) => void;
  onAddStamp: () => void;
  onUpdateStamp: (id: string, next: StampConfig) => void;
  onRemoveStamp: (id: string) => void;
  t: Translations;
}

const SIGNER_ACCENTS = [
  'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]',
  'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
  'bg-violet-50 text-violet-600',
  'bg-sky-50 text-sky-600',
  'bg-amber-50 text-amber-600',
  'bg-teal-50 text-teal-600',
];

function splitListInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface SignerFormCardProps {
  index: number;
  signer: SignerConfig;
  accentClass: string;
  isHighlighted?: boolean;
  onChange: (next: SignerConfig) => void;
  onRemove: () => void;
  t: Translations;
}

const SignerFormCard: React.FC<SignerFormCardProps> = ({
  index,
  signer,
  accentClass,
  isHighlighted = false,
  onChange,
  onRemove,
  t,
}) => {
  const fullNameId = useId();
  const rolesId = useId();
  const { profile, asset } = signer;

  const displayTitle = profile.fullName.trim()
    ? `${index + 1}. ${profile.fullName.trim()}`
    : `${index + 1}. ${t.profiles.signerHeading}`;

  const updateProfile = (patch: Partial<PersonProfile>) => {
    onChange({
      ...signer,
      profile: {
        ...profile,
        ...patch,
      },
    });
  };

  return (
    <Card
      data-setup-card-id={`signer-${signer.id}`}
      className={cn(
        'flex h-full min-w-0 scroll-mt-24 flex-col transition-shadow duration-300',
        isHighlighted && 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30',
      )}
    >
      <CardHeader className="px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${accentClass}`}
          >
            <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <CardTitle className="truncate text-sm">{displayTitle}</CardTitle>
        </div>

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${t.profiles.removeCardBtn} ${displayTitle}`}
          icon={
            <Trash2
              className="h-3.5 w-3.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              strokeWidth={1.75}
            />
          }
          onClick={onRemove}
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={fullNameId}
              className="text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t.profiles.fullNameLabel} <span aria-hidden="true">*</span>
            </label>
            <Input
              id={fullNameId}
              name={`${signer.id}-fullName`}
              type="text"
              required
              value={profile.fullName}
              placeholder={t.profiles.fullNamePlaceholder}
              onChange={(e) => updateProfile({ fullName: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={rolesId}
              className="text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t.profiles.roleNamesLabel}
            </label>
            <Input
              id={rolesId}
              name={`${signer.id}-roles`}
              type="text"
              value={profile.roleNames.join(', ')}
              placeholder={t.profiles.roleNamesPlaceholder}
              onChange={(e) => updateProfile({ roleNames: splitListInput(e.target.value) })}
            />
          </div>
        </div>

        <AssetManagerCard
          embedded
          kind="SIGNATURE"
          title={t.profiles.signatureLabel}
          asset={asset}
          onAssetChange={(next: PngAsset | null) =>
            onChange({
              ...signer,
              asset: next,
              profile: {
                ...profile,
                signatureAssetId: next?.id ?? null,
              },
            })
          }
          t={t}
        />
      </CardContent>
    </Card>
  );
};

export const ProfileSetupPanel: React.FC<ProfileSetupPanelProps> = ({
  signers,
  stamps,
  isDirty,
  savedAt,
  isDesktop,
  onSave,
  onAddSigner,
  onUpdateSigner,
  onRemoveSigner,
  onAddStamp,
  onUpdateStamp,
  onRemoveStamp,
  t,
}) => {
  const listGridRef = useRef<HTMLDivElement | null>(null);
  const pendingAddKindRef = useRef<'SIGNER' | 'STAMP' | null>(null);
  const prevCountRef = useRef({ signers: signers.length, stamps: stamps.length });
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = { signers: signers.length, stamps: stamps.length };

    const pendingKind = pendingAddKindRef.current;
    if (!pendingKind) return;

    let targetKey: string | null = null;
    if (pendingKind === 'SIGNER' && signers.length > prev.signers) {
      const added = signers[signers.length - 1];
      if (added) targetKey = `signer-${added.id}`;
    } else if (pendingKind === 'STAMP' && stamps.length > prev.stamps) {
      const added = stamps[stamps.length - 1];
      if (added) targetKey = `stamp-${added.id}`;
    }

    pendingAddKindRef.current = null;
    if (!targetKey) return;

    setHighlightedCardId(targetKey);
    const rafId = requestAnimationFrame(() => {
      const cardEl = listGridRef.current?.querySelector<HTMLElement>(
        `[data-setup-card-id="${CSS.escape(targetKey)}"]`,
      );
      if (!cardEl) return;
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusTarget = cardEl.querySelector<HTMLElement>('input[type="text"], select');
      focusTarget?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [signers, stamps]);

  useEffect(() => {
    if (!highlightedCardId) return;
    const timer = window.setTimeout(() => {
      setHighlightedCardId(null);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [highlightedCardId]);

  const handleAddSigner = () => {
    pendingAddKindRef.current = 'SIGNER';
    onAddSigner();
  };

  const handleAddStamp = () => {
    pendingAddKindRef.current = 'STAMP';
    onAddStamp();
  };
  const hasSharedSurname = useMemo(() => {
    for (let i = 0; i < signers.length; i++) {
      for (let j = i + 1; j < signers.length; j++) {
        if (
          findSharedNameTokens(signers[i]!.profile.fullName, signers[j]!.profile.fullName).size > 0
        ) {
          return true;
        }
      }
    }
    return false;
  }, [signers]);

  const isEmpty = signers.length === 0 && stamps.length === 0;

  return (
    <section aria-labelledby="profiles-heading" className="space-y-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-start sm:gap-4">
          <h2 id="profiles-heading" className="text-base font-bold text-[var(--color-text-primary)]">
            {t.profiles.heading}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button variant="outline" size="sm" onClick={handleAddSigner} className="w-full sm:w-auto">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {t.profiles.addSignerBtn}
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddStamp} className="w-full sm:w-auto">
            <Stamp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t.profiles.addStampBtn}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span
            role="status"
            aria-live="polite"
            className={
              isDirty
                ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-warning)]'
                : 'inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-success)]'
            }
          >
            {isDirty ? (
              <>
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
                {t.profiles.unsavedLabel}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                {savedAt !== null
                  ? isDesktop
                    ? t.profiles.savedToExcelLabel
                    : t.profiles.savedLabel
                  : t.profiles.allSavedLabel}
              </>
            )}
          </span>
          <Button
            variant={isDirty ? 'primary' : 'outline'}
            size="sm"
            disabled={!isDirty}
            onClick={onSave}
          >
            <Save className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t.profiles.saveBtn}
          </Button>
        </div>
      </div>

      {hasSharedSurname && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-[var(--color-warning-subtle)] px-3 py-2 text-xs font-medium text-[var(--color-warning)]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{t.profiles.sharedSurnameWarning}</span>
        </div>
      )}

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
              <UserCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t.profiles.emptyTitle}
              </h3>
              <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                {t.profiles.emptyHint}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button variant="primary" size="md" onClick={onAddSigner}>
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {t.profiles.addSignerBtn}
              </Button>
              <Button variant="outline" size="md" onClick={onAddStamp}>
                <Stamp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {t.profiles.addStampBtn}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div ref={listGridRef} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {signers.map((signer, index) => (
            <SignerFormCard
              key={signer.id}
              index={index}
              signer={signer}
              accentClass={SIGNER_ACCENTS[index % SIGNER_ACCENTS.length]!}
              isHighlighted={highlightedCardId === `signer-${signer.id}`}
              onChange={(next) => onUpdateSigner(signer.id, next)}
              onRemove={() => onRemoveSigner(signer.id)}
              t={t}
            />
          ))}

          {stamps.map((stamp, index) => (
            <StampSettingsPanel
              key={stamp.id}
              index={index}
              stamp={stamp}
              signers={signers}
              isHighlighted={highlightedCardId === `stamp-${stamp.id}`}
              onChange={(next) => onUpdateStamp(stamp.id, next)}
              onRemove={() => onRemoveStamp(stamp.id)}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
};
