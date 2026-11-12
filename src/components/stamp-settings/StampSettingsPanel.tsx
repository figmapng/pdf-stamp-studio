import React, { useId } from 'react';
import { Sparkles, Stamp, Trash2 } from 'lucide-react';
import type {
  PngAsset,
  SignerConfig,
  StampAnchorPosition,
  StampConfig,
  StampOwner,
} from '../../types';
import type { Translations } from '../../i18n';
import { Card, CardContent, CardHeader, CardTitle, IconButton, Select } from '../ui';
import { AssetManagerCard } from '../profile-setup/AssetManagerCard';

interface StampSettingsPanelProps {
  index: number;
  stamp: StampConfig;
  signers: SignerConfig[];
  onChange: (next: StampConfig) => void;
  onRemove: () => void;
  t: Translations;
}

const StampPlacementDiagram: React.FC<{ pos: Exclude<StampAnchorPosition, 'AUTO'> }> = ({ pos }) => {
  // Crisp vector illustration of signature underline + flourish + circular stamp placement
  let lineX1 = 10;
  let lineX2 = 54;
  let lineY = 16;
  let sigTransform = '';
  let stampCx = 18;
  let stampCy = 11.5;
  let stampR = 5.5;

  if (pos === 'OVERLAP_LEFT') {
    stampCx = 16;
  } else if (pos === 'OVERLAP_CENTER') {
    stampCx = 32;
  } else if (pos === 'OVERLAP_RIGHT') {
    stampCx = 48;
  } else if (pos === 'BESIDE_LEFT') {
    lineX1 = 22;
    lineX2 = 58;
    sigTransform = 'translate(8, 0)';
    stampCx = 11;
  } else if (pos === 'BESIDE_RIGHT') {
    lineX1 = 6;
    lineX2 = 42;
    sigTransform = 'translate(-8, 0)';
    stampCx = 53;
  } else if (pos === 'BELOW') {
    lineY = 10;
    sigTransform = 'translate(0, -6)';
    stampCx = 32;
    stampCy = 17.5;
    stampR = 4.2;
  }

  return (
    <svg viewBox="0 0 64 24" className="h-4.5 w-11 shrink-0" aria-hidden="true">
      <line
        x1={lineX1}
        y1={lineY}
        x2={lineX2}
        y2={lineY}
        stroke="#94a3b8"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M21 13.5 C24 7.5, 28 14.5, 31 9.5 C33 6.5, 37 13.5, 43 10.5"
        transform={sigTransform}
        fill="none"
        stroke="#4f46e5"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle
        cx={stampCx}
        cy={stampCy}
        r={stampR}
        fill="rgba(225, 29, 72, 0.16)"
        stroke="#e11d48"
        strokeWidth="1.5"
        strokeDasharray="2 1.5"
      />
      <circle cx={stampCx} cy={stampCy} r={stampR * 0.42} fill="#e11d48" fillOpacity="0.6" />
    </svg>
  );
};

export const StampSettingsPanel: React.FC<StampSettingsPanelProps> = ({
  index,
  stamp,
  signers,
  onChange,
  onRemove,
  t,
}) => {
  const ownerId = useId();
  const { policy, asset } = stamp;

  const isManual = policy.owner === 'MANUAL_PER_DOCUMENT';
  const cardTitle = `${index + 1}. ${t.stamp.cardTitle}`;
  const currentAnchorPos: StampAnchorPosition =
    policy.anchorPosition ?? (policy.relation === 'BESIDE' ? 'BESIDE_LEFT' : 'AUTO');

  const setPosition = (anchorPosition: StampAnchorPosition) => {
    const isBeside =
      anchorPosition === 'BESIDE_LEFT' ||
      anchorPosition === 'BESIDE_RIGHT' ||
      anchorPosition === 'BELOW';
    onChange({
      ...stamp,
      policy: {
        ...policy,
        anchorPosition,
        relation: isBeside ? 'BESIDE' : 'OVERLAP',
      },
    });
  };

  const positionTiles: Array<{
    value: Exclude<StampAnchorPosition, 'AUTO'>;
    shortLabel: string;
    fullLabel: string;
  }> = [
    { value: 'OVERLAP_LEFT', shortLabel: t.stamp.shortOverlapLeft, fullLabel: t.stamp.posOverlapLeft },
    { value: 'OVERLAP_CENTER', shortLabel: t.stamp.shortOverlapCenter, fullLabel: t.stamp.posOverlapCenter },
    { value: 'OVERLAP_RIGHT', shortLabel: t.stamp.shortOverlapRight, fullLabel: t.stamp.posOverlapRight },
    { value: 'BESIDE_LEFT', shortLabel: t.stamp.shortBesideLeft, fullLabel: t.stamp.posBesideLeft },
    { value: 'BELOW', shortLabel: t.stamp.shortBelow, fullLabel: t.stamp.posBelow },
    { value: 'BESIDE_RIGHT', shortLabel: t.stamp.shortBesideRight, fullLabel: t.stamp.posBesideRight },
  ];

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] text-[var(--color-danger)]">
            <Stamp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <CardTitle className="text-sm">{cardTitle}</CardTitle>
        </div>

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${t.profiles.removeCardBtn} ${cardTitle}`}
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
              htmlFor={ownerId}
              className="text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t.stamp.ownerLegend}
            </label>
            <Select
              id={ownerId}
              value={
                signers.some((s) => s.id === policy.owner) ? policy.owner : 'MANUAL_PER_DOCUMENT'
              }
              onChange={(e) => {
                const owner = e.target.value as StampOwner;
                onChange({
                  ...stamp,
                  policy: {
                    ...policy,
                    owner,
                    placementMode: owner === 'MANUAL_PER_DOCUMENT' ? 'MANUAL' : 'ADAPTIVE',
                  },
                });
              }}
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
              <option value="MANUAL_PER_DOCUMENT">{t.stamp.ownerManual}</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                {t.stamp.relationLegend}
              </span>
              <button
                type="button"
                disabled={isManual}
                aria-pressed={currentAnchorPos === 'AUTO'}
                title={t.stamp.posAuto}
                onClick={() => setPosition('AUTO')}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  currentAnchorPos === 'AUTO' && !isManual
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)]'
                }`}
              >
                <Sparkles className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
                {t.stamp.shortAuto}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {positionTiles.map((tile) => {
                const isSelected = currentAnchorPos === tile.value && !isManual;
                return (
                  <button
                    key={tile.value}
                    type="button"
                    disabled={isManual}
                    aria-label={tile.fullLabel}
                    aria-pressed={isSelected}
                    title={tile.fullLabel}
                    onClick={() => setPosition(tile.value)}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border px-1 py-1 transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-surface)]'
                    }`}
                  >
                    <StampPlacementDiagram pos={tile.value} />
                    <span className="mt-0.5 text-[10px] font-medium leading-tight">
                      {tile.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <AssetManagerCard
          embedded
          kind="STAMP"
          title={t.assets.stamp}
          asset={asset}
          onAssetChange={(next: PngAsset | null) =>
            onChange({
              ...stamp,
              asset: next,
            })
          }
          t={t}
        />
      </CardContent>
    </Card>
  );
};
