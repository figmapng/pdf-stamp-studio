import type {
  DocumentStampEntry,
  PageAnalysis,
  Placement,
  PngAsset,
  Rect,
  ResolvedStampOwner,
  SignatureAnchor,
  StampConfig,
  StampOwner,
  StampPolicy,
} from '../../types';

export const DEFAULT_STAMP_POLICY: StampPolicy = {
  countPerDocument: 1,
  owner: 'PERSON_A',
  placementMode: 'ADAPTIVE',
  relation: 'OVERLAP',
  anchorPosition: 'AUTO',
  allowDuplicate: false,
  allowFallbackPlacement: false,
  defaultWidthPt: 112,
  overlapRatio: 0.3,
  defaultRotation: 0,
};

export function createDefaultStampPolicy(owner: StampOwner = 'MANUAL_PER_DOCUMENT'): StampPolicy {
  return {
    ...DEFAULT_STAMP_POLICY,
    owner,
    placementMode: owner === 'MANUAL_PER_DOCUMENT' ? 'MANUAL' : 'ADAPTIVE',
  };
}

export interface StampResolutionResult {
  owner: ResolvedStampOwner;
  placement: Placement | null;
  count: number;
  requiresManualConfirmation: boolean;
  warnings: string[];
  errors: string[];
}

function clampPlacementToPage(bounds: Rect, pageWidth: number, pageHeight: number): Rect {
  const margin = 4;
  const w = Math.min(bounds.width, Math.max(20, pageWidth - margin * 2));
  const h = Math.min(bounds.height, Math.max(20, pageHeight - margin * 2));
  const x = Math.max(margin, Math.min(pageWidth - margin - w, bounds.x));
  const y = Math.max(margin, Math.min(pageHeight - margin - h, bounds.y));
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(w.toFixed(2)),
    height: Number(h.toFixed(2)),
  };
}

function rectsOverlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

/**
 * Computes candidate adaptive stamp placement relative to the selected owner's signature anchor.
 * Never falls back to the other person's anchor.
 */
export function computeAdaptiveStampPlacement(
  ownerAnchor: SignatureAnchor,
  otherAnchor: SignatureAnchor | null,
  page: PageAnalysis | undefined,
  policy: StampPolicy,
  stampAsset?: PngAsset | null,
  extraContext?: {
    otherAnchors?: SignatureAnchor[];
    occupiedRects?: Rect[];
  },
): { placement: Placement; isClean: boolean; warning?: string } {
  const pageWidth = page?.width ?? 595;
  const pageHeight = page?.height ?? 842;

  const aspect =
    stampAsset && stampAsset.naturalHeight > 0
      ? stampAsset.naturalWidth / stampAsset.naturalHeight
      : 1;
  const stampW = policy.defaultWidthPt;
  const stampH = stampW / Math.max(0.4, aspect);

  const sig = ownerAnchor.placementBounds;
  const line = ownerAnchor.lineBounds;
  const ownerNameNorm = (ownerAnchor.matchedNameText ?? '').trim().toLowerCase();

  const allOtherAnchors = extraContext?.otherAnchors ?? (otherAnchor ? [otherAnchor] : []);
  const occupiedRects = extraContext?.occupiedRects ?? [];

  const scoreCandidate = (opt: Rect, tieBias = 0): number => {
    const fitsPage =
      opt.x >= 4 &&
      opt.y >= 4 &&
      opt.x + opt.width <= pageWidth - 4 &&
      opt.y + opt.height <= pageHeight - 4;

    let otherCollision = 0;
    for (const oa of allOtherAnchors) {
      if (oa.pageIndex === ownerAnchor.pageIndex) {
        otherCollision += rectsOverlapArea(opt, oa.placementBounds);
      }
    }

    let occupiedCollision = 0;
    for (const occ of occupiedRects) {
      occupiedCollision += rectsOverlapArea(opt, occ);
    }

    let textPenalty = 0;
    if (page) {
      for (const tb of page.extractedText) {
        if (/^[_\s/\\-]+$/.test(tb.text)) continue;
        const area = rectsOverlapArea(opt, tb.bounds);
        if (area <= 0) continue;
        const isNameBlock =
          ownerNameNorm.length > 0 && tb.text.toLowerCase().includes(ownerNameNorm);
        textPenalty += area * (isNameBlock ? 5 : 1.5);
      }
    }

    return (
      (fitsPage ? 10000 : 0) +
      tieBias -
      otherCollision * 3 -
      occupiedCollision * 6 -
      textPenalty
    );
  };

  let candidate: Rect;
  const ratio = Math.max(0.1, Math.min(0.6, policy.overlapRatio));
  const centerY = sig.y + sig.height / 2 - stampH / 2 + 4;
  const anchorPos = policy.anchorPosition ?? 'AUTO';

  const leftOverlapOpt: Rect = {
    x: sig.x - stampW * (1 - ratio),
    y: centerY,
    width: stampW,
    height: stampH,
  };
  const rightOverlapOpt: Rect = {
    x: sig.x + sig.width - stampW * ratio,
    y: centerY,
    width: stampW,
    height: stampH,
  };
  const centeredOverlapOpt: Rect = {
    x: sig.x + sig.width / 2 - stampW / 2,
    y: centerY,
    width: stampW,
    height: stampH,
  };
  const besideLeftOpt: Rect = {
    x: Math.min(sig.x, line.x) - stampW - 8,
    y: sig.y + sig.height / 2 - stampH / 2,
    width: stampW,
    height: stampH,
  };
  const besideRightOpt: Rect = {
    x: Math.max(sig.x + sig.width, line.x + line.width) + 8,
    y: sig.y + sig.height / 2 - stampH / 2,
    width: stampW,
    height: stampH,
  };
  const belowOpt: Rect = {
    x: sig.x + sig.width / 2 - stampW / 2,
    y: line.y + line.height + 10,
    width: stampW,
    height: stampH,
  };

  if (anchorPos !== 'AUTO') {
    const explicitMap: Record<Exclude<typeof anchorPos, 'AUTO'>, Rect> = {
      OVERLAP_LEFT: leftOverlapOpt,
      OVERLAP_CENTER: centeredOverlapOpt,
      OVERLAP_RIGHT: rightOverlapOpt,
      BESIDE_LEFT: besideLeftOpt,
      BESIDE_RIGHT: besideRightOpt,
      BELOW: belowOpt,
    };
    const primary = explicitMap[anchorPos];
    if (occupiedRects.length === 0) {
      candidate = clampPlacementToPage(primary, pageWidth, pageHeight);
    } else {
      const candidates = [
        { rect: primary, bias: 200 },
        { rect: besideRightOpt, bias: 20 },
        { rect: besideLeftOpt, bias: 10 },
        { rect: belowOpt, bias: 0 },
      ];
      let picked = primary;
      let bestScore = -Infinity;
      for (const opt of candidates) {
        const score = scoreCandidate(opt.rect, opt.bias);
        if (score > bestScore) {
          bestScore = score;
          picked = opt.rect;
        }
      }
      candidate = clampPlacementToPage(picked, pageWidth, pageHeight);
    }
  } else if (policy.relation === 'BESIDE') {
    const farRightOpt: Rect = {
      x: Math.max(sig.x + sig.width, line.x + line.width) + stampW + 16,
      y: sig.y + sig.height / 2 - stampH / 2,
      width: stampW,
      height: stampH,
    };

    const options = [
      { rect: besideLeftOpt, bias: 50 },
      { rect: besideRightOpt, bias: 0 },
      { rect: belowOpt, bias: -20 },
      ...(occupiedRects.length > 0 ? [{ rect: farRightOpt, bias: -40 }] : []),
    ];
    let picked = besideLeftOpt;
    let bestScore = -Infinity;

    for (const opt of options) {
      const score = scoreCandidate(opt.rect, opt.bias);
      if (score > bestScore) {
        bestScore = score;
        picked = opt.rect;
      }
    }
    candidate = clampPlacementToPage(picked, pageWidth, pageHeight);
  } else {
    // OVERLAP (or CUSTOM baseline): evaluate left-edge overlap (title + sig start) vs right-edge overlap
    // and pick the placement that avoids covering the signatory's printed name or earlier stamps.
    const sideRightOpt: Rect = {
      x: Math.max(sig.x + sig.width, line.x + line.width) + 12,
      y: centerY,
      width: stampW,
      height: stampH,
    };
    const sideLeftOpt: Rect = {
      x: Math.min(sig.x, line.x) - stampW - 12,
      y: centerY,
      width: stampW,
      height: stampH,
    };

    const options = [
      { rect: leftOverlapOpt, bias: 60 },
      { rect: centeredOverlapOpt, bias: 20 },
      { rect: rightOverlapOpt, bias: 0 },
      ...(occupiedRects.length > 0
        ? [
            { rect: sideRightOpt, bias: -15 },
            { rect: sideLeftOpt, bias: -25 },
          ]
        : []),
    ];
    let picked = leftOverlapOpt;
    let bestScore = -Infinity;

    for (const opt of options) {
      const score = scoreCandidate(opt.rect, opt.bias);
      if (score > bestScore) {
        bestScore = score;
        picked = opt.rect;
      }
    }
    candidate = clampPlacementToPage(picked, pageWidth, pageHeight);
  }

  let isClean = true;
  let warning: string | undefined;

  if (
    allOtherAnchors.some(
      (oa) =>
        oa.pageIndex === ownerAnchor.pageIndex &&
        rectsOverlapArea(candidate, oa.placementBounds) > stampW * stampH * 0.15,
    )
  ) {
    isClean = false;
    warning = 'STAMP_OVERLAPS_OTHER_PERSON: Proposed stamp position overlaps the other signatory.';
  }

  return {
    placement: {
      pageIndex: ownerAnchor.pageIndex,
      bounds: candidate,
      rotation: policy.defaultRotation,
    },
    isClean,
    warning,
  };
}

/**
 * Resolves the single stamp placement for a document under strict StampPolicy invariants:
 * - Exactly 1 stamp per document
 * - No fallback to the other person's signature zone
 * - Manual / Custom modes require explicit user confirmation
 */
export function resolveStampPolicy(params: {
  policy: StampPolicy;
  personA: SignatureAnchor | null;
  personB: SignatureAnchor | null;
  pages: PageAnalysis[];
  stampAsset?: PngAsset | null;
  manualOwnerOverride?: ResolvedStampOwner;
  manualPlacementOverride?: Placement | null;
  manualApprovalConfirmed?: boolean;
}): StampResolutionResult {
  const {
    policy,
    personA,
    personB,
    pages,
    stampAsset,
    manualOwnerOverride,
    manualPlacementOverride,
    manualApprovalConfirmed = false,
  } = params;

  const warnings: string[] = [];
  const errors: string[] = [];

  // Enforce invariant: countPerDocument must be 1 and allowDuplicate/allowFallbackPlacement must be false
  if (policy.countPerDocument !== 1 || policy.allowDuplicate || policy.allowFallbackPlacement) {
    errors.push('DUPLICATE_STAMP_PREVENTED');
    return {
      owner: 'MANUAL',
      placement: null,
      count: 0,
      requiresManualConfirmation: true,
      warnings,
      errors,
    };
  }

  // Determine effective owner
  let resolvedOwner: ResolvedStampOwner;
  if (policy.owner === 'MANUAL_PER_DOCUMENT') {
    if (!manualOwnerOverride) {
      return {
        owner: 'MANUAL',
        placement: manualPlacementOverride ?? null,
        count: manualPlacementOverride ? 1 : 0,
        requiresManualConfirmation: true,
        warnings: ['STAMP_OWNER_SELECTION_REQUIRED'],
        errors: [],
      };
    }
    resolvedOwner = manualOwnerOverride;
  } else {
    resolvedOwner = policy.owner;
  }

  // If user already manually placed & confirmed stamp in Review Center, respect exact placement (count = 1)
  if (manualPlacementOverride) {
    const page = pages.find((p) => p.pageIndex === manualPlacementOverride.pageIndex);
    const clampedBounds = page
      ? clampPlacementToPage(manualPlacementOverride.bounds, page.width, page.height)
      : manualPlacementOverride.bounds;
    return {
      owner: resolvedOwner,
      placement: {
        ...manualPlacementOverride,
        bounds: clampedBounds,
      },
      count: 1,
      requiresManualConfirmation: !manualApprovalConfirmed,
      warnings,
      errors,
    };
  }

  // Manual or Custom mode with no placement yet -> requires user placement in Review Center
  if (policy.placementMode === 'MANUAL' || policy.placementMode === 'CUSTOM' || resolvedOwner === 'MANUAL') {
    // Optionally provide an initial centered anchor preview ONLY if owner anchor exists, but mark unconfirmed
    const ownerAnchor =
      resolvedOwner === 'PERSON_A' ? personA : resolvedOwner === 'PERSON_B' ? personB : null;
    if (policy.placementMode === 'CUSTOM' && ownerAnchor) {
      const page = pages.find((p) => p.pageIndex === ownerAnchor.pageIndex);
      const { placement } = computeAdaptiveStampPlacement(
        ownerAnchor,
        resolvedOwner === 'PERSON_A' ? personB : personA,
        page,
        policy,
        stampAsset,
      );
      return {
        owner: resolvedOwner,
        placement,
        count: 1,
        requiresManualConfirmation: true,
        warnings: ['CUSTOM_STAMP_CONFIRMATION_REQUIRED'],
        errors,
      };
    }

    return {
      owner: resolvedOwner,
      placement: null,
      count: 0,
      requiresManualConfirmation: true,
      warnings: ['MANUAL_STAMP_PLACEMENT_REQUIRED'],
      errors,
    };
  }

  // ADAPTIVE mode: strict owner anchor lookup with NO fallback to the other person
  const ownerAnchor = resolvedOwner === 'PERSON_A' ? personA : personB;
  const otherAnchor = resolvedOwner === 'PERSON_A' ? personB : personA;

  if (!ownerAnchor) {
    errors.push('STAMP_OWNER_NOT_FOUND');
    return {
      owner: resolvedOwner,
      placement: null,
      count: 0,
      requiresManualConfirmation: true,
      warnings,
      errors,
    };
  }

  const page = pages.find((p) => p.pageIndex === ownerAnchor.pageIndex);
  const adaptive = computeAdaptiveStampPlacement(ownerAnchor, otherAnchor, page, policy, stampAsset);
  if (adaptive.warning) {
    warnings.push(adaptive.warning);
  }

  const requiresManualConfirmation =
    ownerAnchor.status !== 'AUTO_READY' || !adaptive.isClean;

  return {
    owner: resolvedOwner,
    placement: adaptive.placement,
    count: 1,
    requiresManualConfirmation,
    warnings,
    errors,
  };
}

export interface MultiStampResolutionResult {
  entries: DocumentStampEntry[];
  requiresManualConfirmation: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Resolves 0..M stamp placements independently while preventing multiple stamps
 * assigned to the same signatory or page from stacking directly on top of each other.
 */
export function resolveMultiStampPlacements(params: {
  stamps: StampConfig[];
  anchorsBySignerId: Record<string, SignatureAnchor | null>;
  skippedSignerIds?: Set<string>;
  existingStampEntries?: Record<string, DocumentStampEntry>;
  pages: PageAnalysis[];
  manualApprovalConfirmed?: boolean;
}): MultiStampResolutionResult {
  const {
    stamps,
    anchorsBySignerId,
    skippedSignerIds = new Set<string>(),
    existingStampEntries = {},
    pages,
    manualApprovalConfirmed = false,
  } = params;

  const entries: DocumentStampEntry[] = [];
  const allWarnings: string[] = [];
  const allErrors: string[] = [];
  const occupiedByPage = new Map<number, Rect[]>();
  let requiresManualConfirmation = false;

  const markOccupied = (placement: Placement | null) => {
    if (!placement) return;
    const list = occupiedByPage.get(placement.pageIndex) ?? [];
    list.push(placement.bounds);
    occupiedByPage.set(placement.pageIndex, list);
  };

  // Pre-seed occupied rects from manual/skipped overrides so auto stamps respect manual positions
  for (const stamp of stamps) {
    const existing = existingStampEntries[stamp.id];
    if (existing && !existing.skipped && existing.isManuallyAdjusted && existing.placement) {
      markOccupied(existing.placement);
    }
  }

  for (const stamp of stamps) {
    const existing = existingStampEntries[stamp.id];
    if (existing?.skipped) {
      entries.push({
        stampId: stamp.id,
        label: stamp.label,
        owner: existing.owner,
        placement: null,
        skipped: true,
        isManuallyAdjusted: true,
        warnings: [],
        errors: [],
      });
      continue;
    }

    const effectiveOwner: ResolvedStampOwner =
      existing?.owner ??
      (stamp.policy.owner === 'MANUAL_PER_DOCUMENT' ? 'MANUAL' : stamp.policy.owner);

    if (existing?.isManuallyAdjusted && existing.placement) {
      const page = pages.find((p) => p.pageIndex === existing.placement!.pageIndex);
      const clampedBounds = page
        ? clampPlacementToPage(existing.placement.bounds, page.width, page.height)
        : existing.placement.bounds;
      const clampedPlacement: Placement = {
        ...existing.placement,
        bounds: clampedBounds,
      };
      if (!manualApprovalConfirmed) requiresManualConfirmation = true;
      entries.push({
        stampId: stamp.id,
        label: stamp.label,
        owner: effectiveOwner,
        placement: clampedPlacement,
        isManuallyAdjusted: true,
        warnings: [],
        errors: [],
      });
      continue;
    }

    if (effectiveOwner === 'MANUAL' || stamp.policy.placementMode === 'MANUAL') {
      requiresManualConfirmation = true;
      allWarnings.push('MANUAL_STAMP_PLACEMENT_REQUIRED');
      entries.push({
        stampId: stamp.id,
        label: stamp.label,
        owner: effectiveOwner,
        placement: null,
        warnings: ['MANUAL_STAMP_PLACEMENT_REQUIRED'],
        errors: [],
      });
      continue;
    }

    const ownerAnchor = skippedSignerIds.has(effectiveOwner)
      ? null
      : (anchorsBySignerId[effectiveOwner] ?? null);

    if (!ownerAnchor) {
      requiresManualConfirmation = true;
      allErrors.push('STAMP_OWNER_NOT_FOUND');
      entries.push({
        stampId: stamp.id,
        label: stamp.label,
        owner: effectiveOwner,
        placement: null,
        warnings: [],
        errors: ['STAMP_OWNER_NOT_FOUND'],
      });
      continue;
    }

    const otherAnchors = Object.entries(anchorsBySignerId)
      .filter(([id, a]) => id !== effectiveOwner && a !== null && !skippedSignerIds.has(id))
      .map(([, a]) => a!);
    const page = pages.find((p) => p.pageIndex === ownerAnchor.pageIndex);
    const occupiedRects = occupiedByPage.get(ownerAnchor.pageIndex) ?? [];

    const adaptive = computeAdaptiveStampPlacement(
      ownerAnchor,
      otherAnchors[0] ?? null,
      page,
      stamp.policy,
      stamp.asset,
      { otherAnchors, occupiedRects },
    );

    markOccupied(adaptive.placement);
    const entryWarnings = adaptive.warning ? [adaptive.warning] : [];
    if (adaptive.warning) allWarnings.push(adaptive.warning);

    if (ownerAnchor.status !== 'AUTO_READY' || !adaptive.isClean) {
      requiresManualConfirmation = true;
    }

    entries.push({
      stampId: stamp.id,
      label: stamp.label,
      owner: effectiveOwner,
      placement: adaptive.placement,
      warnings: entryWarnings,
      errors: [],
    });
  }

  return {
    entries,
    requiresManualConfirmation,
    warnings: Array.from(new Set(allWarnings)),
    errors: Array.from(new Set(allErrors)),
  };
}
