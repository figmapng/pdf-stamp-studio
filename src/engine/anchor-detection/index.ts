import type {
  AnchorStatus,
  DetectionEvidence,
  DetectionMethod,
  DetectionScores,
  DetectionThresholds,
  LineCandidate,
  PageAnalysis,
  PersonProfile,
  PngAsset,
  Rect,
  SignatureAnchor,
  SignatureCandidate,
  TextBlock,
} from '../../types';
import {
  horizontalOverlapRatio,
  matchPersonAcrossPages,
  rectDistance,
  type RoleBlockMatch,
} from '../person-matching';
import { normalizeText } from '../text-normalizer';

export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  autoReadyMinScore: 0.78,
  ambiguityMargin: 0.08,
  minNameScore: 0.75,
  minLineScore: 0.5,
};

const SIGNATURE_CUE_WORDS = [
  'қолы',
  'қол',
  'подпись',
  'подп',
  'signature',
  'sign',
  'м о',
  'м п',
  'мп',
  'мо',
];

function rectsOverlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function rectsCollide(a: Rect, b: Rect): boolean {
  const area = rectsOverlapArea(a, b);
  if (area <= 0) return false;
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea > 0 && area / minArea > 0.25;
}

function clampRectToPage(rect: Rect, pageWidth: number, pageHeight: number): Rect {
  const margin = 4;
  const w = Math.min(rect.width, Math.max(10, pageWidth - margin * 2));
  const h = Math.min(rect.height, Math.max(10, pageHeight - margin * 2));
  const x = Math.max(margin, Math.min(pageWidth - margin - w, rect.x));
  const y = Math.max(margin, Math.min(pageHeight - margin - h, rect.y));
  return { x, y, width: w, height: h };
}

/**
 * Computes optimal non-overlapping signature placement bounds for a given signature line
 * and optional PNG aspect ratio.
 */
export function computeSignaturePlacementBounds(
  lineBounds: Rect,
  pageWidth: number,
  pageHeight: number,
  textBlocks: TextBlock[],
  signatureAsset?: PngAsset | null,
): { placementBounds: Rect; overlapPenalty: number } {
  const aspect =
    signatureAsset && signatureAsset.naturalHeight > 0
      ? signatureAsset.naturalWidth / signatureAsset.naturalHeight
      : 2.4;

  // Target visual signature size proportional to line width, bounded to reasonable physical pt sizes
  const targetWidth = Math.max(64, Math.min(135, lineBounds.width * 0.88));
  const targetHeight = Math.max(24, Math.min(62, targetWidth / Math.max(0.5, aspect)));
  const finalWidth = targetHeight * aspect;

  // Candidate positions:
  // 1. Resting directly on the signature line (~72% above, ~28% crossing line/descenders)
  // 2. Slightly higher along the line if printed text closely touches the baseline
  // 3. Shifted right or left along the line if one side has text
  const centerX = lineBounds.x + lineBounds.width / 2 - finalWidth / 2;
  const options: Array<{ rect: Rect; tieBias: number }> = [
    {
      rect: {
        x: centerX,
        y: lineBounds.y - targetHeight * 0.72,
        width: finalWidth,
        height: targetHeight,
      },
      tieBias: 0,
    },
    {
      rect: {
        x: centerX,
        y: lineBounds.y - targetHeight * 0.9,
        width: finalWidth,
        height: targetHeight,
      },
      tieBias: 0.04,
    },
    {
      rect: {
        x: lineBounds.x + 4,
        y: lineBounds.y - targetHeight * 0.72,
        width: finalWidth,
        height: targetHeight,
      },
      tieBias: 0.03,
    },
    {
      rect: {
        x: lineBounds.x + lineBounds.width - finalWidth - 4,
        y: lineBounds.y - targetHeight * 0.72,
        width: finalWidth,
        height: targetHeight,
      },
      tieBias: 0.03,
    },
  ];

  // Exclude pure underscore runs and merged inline-underscore rows right on the signature baseline
  // so inline labels like "Инженер-химик ______ Затыбек" don't push the signature awkwardly high.
  const nonUnderscoreTexts = textBlocks.filter((tb) => {
    if (/^[_\s/\\-]+$/.test(tb.text)) return false;
    if (/_{3,}/.test(tb.text) && Math.abs(tb.bounds.y + tb.bounds.height - lineBounds.y) <= 10) {
      return false;
    }
    return true;
  });

  let bestRect = clampRectToPage(options[0]!.rect, pageWidth, pageHeight);
  let bestPenalty = Infinity;
  let bestScore = Infinity;

  for (const { rect: rawOpt, tieBias } of options) {
    const opt = clampRectToPage(rawOpt, pageWidth, pageHeight);
    let overlapArea = 0;
    for (const tb of nonUnderscoreTexts) {
      overlapArea += rectsOverlapArea(opt, tb.bounds);
    }
    const optArea = Math.max(1, opt.width * opt.height);
    const penalty = Math.min(1, overlapArea / optArea);
    const effective = penalty + tieBias;
    if (effective < bestScore) {
      bestScore = effective;
      bestPenalty = penalty;
      bestRect = opt;
    }
  }

  return {
    placementBounds: bestRect,
    overlapPenalty: Number.isFinite(bestPenalty) ? bestPenalty : 0,
  };
}

/**
 * Evaluates spatial relationship between a name block, optional role block, and a line candidate.
 */
function scoreLineForPersonContext(
  line: LineCandidate,
  nameBlock: TextBlock,
  roleBlock: TextBlock | null,
  page: PageAnalysis,
): { lineScore: number; contextScore: number; evidence: DetectionEvidence[] } {
  const evidence: DetectionEvidence[] = [];
  const anchorTextBounds = nameBlock.bounds;

  // Check column/horizontal compatibility:
  // In two-column signature blocks, a line on the opposite side of the page (> 180pt horizontal gap)
  // should NOT match unless it's clearly inline with the name/role!
  const sameRowWithName = Math.abs(
    line.bounds.y - (anchorTextBounds.y + anchorTextBounds.height),
  ) <= 18;
  const distToName = rectDistance(line.bounds, anchorTextBounds);
  const hOverlapName = horizontalOverlapRatio(line.bounds, anchorTextBounds);

  let lineProximityScore = 0;
  if (sameRowWithName && distToName <= 125) {
    // Inline signature: e.g., "Директор ________ А. Б. Серіков"
    lineProximityScore = Math.max(0.35, 1 - distToName / 145);
  } else if (
    line.bounds.y >= anchorTextBounds.y - 52 &&
    line.bounds.y <= anchorTextBounds.y + anchorTextBounds.height + 52 &&
    (hOverlapName > 0.2 || distToName <= 55)
  ) {
    // Stacked signature: line directly above or below name in the same column
    lineProximityScore = Math.max(0.4, 1 - distToName / 110);
  }

  // Also check proximity to roleBlock if present
  if (roleBlock) {
    const distToRole = rectDistance(line.bounds, roleBlock.bounds);
    const sameRowWithRole = Math.abs(
      line.bounds.y - (roleBlock.bounds.y + roleBlock.bounds.height),
    ) <= 18;
    const hOverlapRole = horizontalOverlapRatio(line.bounds, roleBlock.bounds);
    if ((sameRowWithRole && distToRole <= 120) || (hOverlapRole > 0.2 && distToRole <= 65)) {
      const roleLineProx = Math.max(0.45, 1 - distToRole / 135);
      lineProximityScore = Math.max(lineProximityScore, roleLineProx);
    }
  }

  // Strongly penalize lines that sit horizontally far from both name and role (opposite column in 2-col layouts)
  const minHorizGapToBlock = Math.min(
    Math.max(0, Math.max(line.bounds.x - (anchorTextBounds.x + anchorTextBounds.width), anchorTextBounds.x - (line.bounds.x + line.bounds.width))),
    roleBlock
      ? Math.max(0, Math.max(line.bounds.x - (roleBlock.bounds.x + roleBlock.bounds.width), roleBlock.bounds.x - (line.bounds.x + line.bounds.width)))
      : Infinity,
  );
  if (minHorizGapToBlock > 75) {
    lineProximityScore *= 0.35;
  }

  const lineScore = line.isLikelyTableBorder
    ? lineProximityScore * 0.35
    : lineProximityScore * (0.55 + 0.45 * line.lineQualityScore);

  if (lineScore > 0.25) {
    evidence.push({
      type: 'LINE',
      description: `Line (${line.source}, ${Math.round(line.length)}pt) near signature block`,
      bounds: line.bounds,
      score: Number(lineScore.toFixed(3)),
    });
  }

  // Context score: role-to-name proximity + signature cue words nearby
  let contextScore = 0.2;
  if (roleBlock) {
    const nrDist = rectDistance(nameBlock.bounds, roleBlock.bounds);
    const nrHOverlap = horizontalOverlapRatio(nameBlock.bounds, roleBlock.bounds);
    const sameRow = Math.abs(nameBlock.bounds.y - roleBlock.bounds.y) <= 18;
    if ((sameRow && nrDist <= 240) || (nrDist <= 140 && (nrHOverlap > 0.1 || nrDist <= 85))) {
      contextScore += 0.55 * (1 - nrDist / 280);
      evidence.push({
        type: 'SPATIAL',
        description: `Name and role aligned within ${Math.round(nrDist)}pt`,
        bounds: roleBlock.bounds,
        score: Number(contextScore.toFixed(3)),
      });
    }
  }

  // Signature cue words nearby (e.g. "қолы", "подпись")
  const hasNearbyCue = page.extractedText.some((tb) => {
    const d = rectDistance(tb.bounds, line.bounds);
    if (d > 75) return false;
    const norm = normalizeText(tb.text);
    return SIGNATURE_CUE_WORDS.some((cue) => norm.includes(cue));
  });
  if (hasNearbyCue) {
    contextScore = Math.min(1, contextScore + 0.25);
    evidence.push({
      type: 'LAYOUT',
      description: 'Signature cue label (e.g., қолы / подпись) detected nearby',
    });
  }

  return {
    lineScore: Number(Math.max(0, Math.min(1, lineScore)).toFixed(3)),
    contextScore: Number(Math.max(0, Math.min(1, contextScore)).toFixed(3)),
    evidence,
  };
}

/**
 * Generates ranked SignatureCandidates for a single person across all pages of a document.
 */
export function findSignatureCandidatesForPerson(
  profile: PersonProfile,
  otherProfile: PersonProfile | PersonProfile[] | null,
  pages: PageAnalysis[],
  signatureAsset?: PngAsset | null,
): SignatureCandidate[] {
  const matches = matchPersonAcrossPages(profile, otherProfile, pages);
  const candidates: SignatureCandidate[] = [];

  for (const nameMatch of matches.nameMatches) {
    const page = pages.find((p) => p.pageIndex === nameMatch.pageIndex);
    if (!page) continue;

    // Find closest role match on the same page
    const pageRoles = matches.roleMatches.filter((r) => r.pageIndex === page.pageIndex);
    let bestRole: RoleBlockMatch | null = null;
    let bestRoleDist = Infinity;
    for (const r of pageRoles) {
      const d = rectDistance(nameMatch.block.bounds, r.block.bounds);
      if (d < bestRoleDist && d <= 220) {
        bestRoleDist = d;
        bestRole = r;
      }
    }

    const roleScore =
      profile.roleNames.length === 0
        ? 0.45 // Neutral when user didn't configure roleNames (prevents silent 0, keeps below auto-ready if other cues weak)
        : bestRole
          ? bestRole.score
          : 0;

    // Find nearby lines on the same page
    const candidatePageLines = page.candidateLines.filter(
      (line) => rectDistance(line.bounds, nameMatch.block.bounds) <= 185,
    );

    if (candidatePageLines.length === 0) {
      // No line found near name: emit a low-score virtual candidate ONLY so Review Center
      // can show where the name appeared, while keeping lineMatch = 0 so it never auto-approves!
      const fallbackLineBounds: Rect = {
        x: Math.max(12, nameMatch.block.bounds.x),
        y: nameMatch.block.bounds.y - 8,
        width: Math.max(90, nameMatch.block.bounds.width),
        height: 1.5,
      };
      const { placementBounds, overlapPenalty } = computeSignaturePlacementBounds(
        fallbackLineBounds,
        page.width,
        page.height,
        page.extractedText,
        signatureAsset,
      );
      const scores: DetectionScores = {
        nameMatch: Number(nameMatch.evaluation.score.toFixed(3)),
        roleMatch: Number(roleScore.toFixed(3)),
        contextMatch: bestRole ? 0.45 : 0.15,
        lineMatch: 0,
        geometryMatch: Number(Math.max(0, 1 - overlapPenalty).toFixed(3)),
      };
      const heuristicScore = computeCompositeScore(scores);

      candidates.push({
        personId: profile.id,
        pageIndex: page.pageIndex,
        lineBounds: fallbackLineBounds,
        placementBounds,
        scores,
        heuristicScore,
        detectionMethod: page.ocrExecuted ? 'OCR' : 'DIGITAL_TEXT',
        evidence: [
          {
            type: 'NAME',
            description: `Matched "${nameMatch.block.text}" (${nameMatch.evaluation.matchKind}) without explicit signature line`,
            bounds: nameMatch.block.bounds,
            score: scores.nameMatch,
          },
          ...(bestRole
            ? [
                {
                  type: 'ROLE' as const,
                  description: `Matched role "${bestRole.matchedRole}"`,
                  bounds: bestRole.block.bounds,
                  score: bestRole.score,
                },
              ]
            : []),
        ],
        matchedNameText: nameMatch.block.text,
        matchedRoleText: bestRole?.block.text,
        matchedBySurnameOnly: nameMatch.matchedBySurnameOnly,
      });
      continue;
    }

    for (const line of candidatePageLines) {
      const { lineScore, contextScore, evidence } = scoreLineForPersonContext(
        line,
        nameMatch.block,
        bestRole?.block ?? null,
        page,
      );
      if (lineScore < 0.2) continue;

      const { placementBounds, overlapPenalty } = computeSignaturePlacementBounds(
        line.bounds,
        page.width,
        page.height,
        page.extractedText,
        signatureAsset,
      );

      const geometryMatch = Number(Math.max(0, 1 - overlapPenalty).toFixed(3));
      const effectiveRoleScore =
        profile.roleNames.length === 0
          ? !nameMatch.matchedBySurnameOnly && nameMatch.evaluation.score >= 0.85 && lineScore >= 0.65
            ? 0.85
            : 0.45
          : roleScore;
      const effectiveContextScore =
        profile.roleNames.length === 0 && !nameMatch.matchedBySurnameOnly && lineScore >= 0.65
          ? Math.max(contextScore, 0.55)
          : contextScore;

      const scores: DetectionScores = {
        nameMatch: Number(nameMatch.evaluation.score.toFixed(3)),
        roleMatch: Number(effectiveRoleScore.toFixed(3)),
        contextMatch: effectiveContextScore,
        lineMatch: lineScore,
        geometryMatch,
      };
      const heuristicScore = computeCompositeScore(scores);

      const detectionMethod: DetectionMethod =
        page.ocrExecuted && line.source === 'VISION'
          ? 'HYBRID'
          : page.ocrExecuted
            ? 'OCR'
            : line.source === 'VISION'
              ? 'VISION'
              : 'DIGITAL_TEXT';

      candidates.push({
        personId: profile.id,
        pageIndex: page.pageIndex,
        lineBounds: line.bounds,
        placementBounds,
        scores,
        heuristicScore,
        detectionMethod,
        evidence: [
          {
            type: 'NAME',
            description: `Matched "${nameMatch.block.text}" (${nameMatch.evaluation.matchKind})`,
            bounds: nameMatch.block.bounds,
            score: scores.nameMatch,
          },
          ...(bestRole
            ? [
                {
                  type: 'ROLE' as const,
                  description: `Matched role "${bestRole.matchedRole}"`,
                  bounds: bestRole.block.bounds,
                  score: bestRole.score,
                },
              ]
            : []),
          ...evidence,
        ],
        matchedNameText: nameMatch.block.text,
        matchedRoleText: bestRole?.block.text,
        matchedBySurnameOnly: nameMatch.matchedBySurnameOnly,
      });
    }
  }

  // Deduplicate candidates sharing nearly identical lineBounds on same page (keep highest score)
  candidates.sort((a, b) => b.heuristicScore - a.heuristicScore);
  const deduped: SignatureCandidate[] = [];
  for (const c of candidates) {
    const dup = deduped.some(
      (d) => d.pageIndex === c.pageIndex && rectDistance(d.lineBounds, c.lineBounds) <= 8,
    );
    if (!dup) deduped.push(c);
  }
  return deduped;
}

export function computeCompositeScore(scores: DetectionScores): number {
  const raw =
    scores.nameMatch * 0.35 +
    scores.roleMatch * 0.25 +
    scores.contextMatch * 0.15 +
    scores.lineMatch * 0.15 +
    scores.geometryMatch * 0.1;
  return Number(Math.max(0, Math.min(1, raw)).toFixed(3));
}

function candidateToAnchor(
  cand: SignatureCandidate,
  status: AnchorStatus,
  candidateCount: number,
  extraEvidence: DetectionEvidence[] = [],
): SignatureAnchor {
  return {
    personId: cand.personId,
    pageIndex: cand.pageIndex,
    lineBounds: cand.lineBounds,
    placementBounds: cand.placementBounds,
    confidence: cand.heuristicScore,
    scores: cand.scores,
    detectionMethod: cand.detectionMethod,
    status,
    evidence: [...cand.evidence, ...extraEvidence],
    candidateCount,
    matchedNameText: cand.matchedNameText,
    matchedRoleText: cand.matchedRoleText,
  };
}

function evaluateCandidateStatus(
  best: SignatureCandidate,
  second: SignatureCandidate | undefined,
  thresholds: DetectionThresholds,
  profile: PersonProfile,
): AnchorStatus {
  if (best.matchedBySurnameOnly) return 'REVIEW_REQUIRED';
  if (best.scores.nameMatch < thresholds.minNameScore) return 'REVIEW_REQUIRED';
  if (best.scores.lineMatch < thresholds.minLineScore) return 'REVIEW_REQUIRED';
  if (profile.roleNames.length > 0 && best.scores.roleMatch < 0.65) return 'REVIEW_REQUIRED';
  if (best.heuristicScore < thresholds.autoReadyMinScore) return 'REVIEW_REQUIRED';

  if (second && best.heuristicScore - second.heuristicScore < thresholds.ambiguityMargin) {
    return 'REVIEW_REQUIRED';
  }
  return 'AUTO_READY';
}

export interface DualAnchorResolution {
  personA: SignatureAnchor | null;
  personB: SignatureAnchor | null;
  hasConflict: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Resolves Person A and Person B anchors jointly across the document, enforcing:
 * - No shared signature line / colliding placement between Person A and Person B
 * - Ambiguity detection when multiple high-scoring anchors exist
 * - Surname-only match prevention
 */
export function resolveSignatureAnchors(
  profileA: PersonProfile,
  profileB: PersonProfile,
  pages: PageAnalysis[],
  assetA: PngAsset | null,
  assetB: PngAsset | null,
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS,
): DualAnchorResolution {
  const candsA = profileA.enabled
    ? findSignatureCandidatesForPerson(profileA, profileB, pages, assetA)
    : [];
  const candsB = profileB.enabled
    ? findSignatureCandidatesForPerson(profileB, profileA, pages, assetB)
    : [];

  const warnings: string[] = [];
  const errors: string[] = [];

  if (profileA.enabled && candsA.length === 0) {
    errors.push('PERSON_A_NOT_FOUND');
  }
  if (profileB.enabled && candsB.length === 0) {
    errors.push('PERSON_B_NOT_FOUND');
  }

  let bestA = candsA[0] ?? null;
  let bestB = candsB[0] ?? null;
  let hasConflict = false;

  // Check cross-person collision
  if (bestA && bestB && bestA.pageIndex === bestB.pageIndex) {
    const linesCollide =
      rectsCollide(bestA.lineBounds, bestB.lineBounds) ||
      rectDistance(bestA.lineBounds, bestB.lineBounds) <= 12;
    const placementsCollide = rectsCollide(bestA.placementBounds, bestB.placementBounds);

    if (linesCollide || placementsCollide) {
      // Try bipartite fallback to a non-colliding alternative candidate
      let resolvedPair: { a: SignatureCandidate; b: SignatureCandidate } | null = null;
      let bestPairScore = -1;

      for (const a of candsA.slice(0, 4)) {
        for (const b of candsB.slice(0, 4)) {
          if (a.pageIndex === b.pageIndex) {
            const collide =
              rectsCollide(a.lineBounds, b.lineBounds) ||
              rectDistance(a.lineBounds, b.lineBounds) <= 12 ||
              rectsCollide(a.placementBounds, b.placementBounds);
            if (collide) continue;
          }
          const sum = a.heuristicScore + b.heuristicScore;
          if (sum > bestPairScore) {
            bestPairScore = sum;
            resolvedPair = { a, b };
          }
        }
      }

      if (resolvedPair) {
        bestA = resolvedPair.a;
        bestB = resolvedPair.b;
        warnings.push('AMBIGUOUS_PERSON_MATCH: Initial top candidates collided; alternative pair selected for review.');
        hasConflict = true;
      } else {
        hasConflict = true;
        errors.push('MULTIPLE_ANCHORS_FOUND: Person A and Person B matched the same signature anchor.');
      }
    }
  }

  const anchorA = bestA
    ? candidateToAnchor(
        bestA,
        hasConflict
          ? errors.some((e) => e.startsWith('MULTIPLE_ANCHORS_FOUND'))
            ? 'BLOCKED'
            : 'REVIEW_REQUIRED'
          : evaluateCandidateStatus(bestA, candsA[1], thresholds, profileA),
        candsA.length,
        bestA.matchedBySurnameOnly
          ? [{ type: 'NAME', description: 'Surname-only match requires manual confirmation' }]
          : [],
      )
    : null;

  const anchorB = bestB
    ? candidateToAnchor(
        bestB,
        hasConflict
          ? errors.some((e) => e.startsWith('MULTIPLE_ANCHORS_FOUND'))
            ? 'BLOCKED'
            : 'REVIEW_REQUIRED'
          : evaluateCandidateStatus(bestB, candsB[1], thresholds, profileB),
        candsB.length,
        bestB.matchedBySurnameOnly
          ? [{ type: 'NAME', description: 'Surname-only match requires manual confirmation' }]
          : [],
      )
    : null;

  if (anchorA && anchorA.scores.lineMatch === 0) {
    warnings.push('PERSON_A: Name found without an explicit signature line.');
  }
  if (anchorB && anchorB.scores.lineMatch === 0) {
    warnings.push('PERSON_B: Name found without an explicit signature line.');
  }

  return {
    personA: anchorA,
    personB: anchorB,
    hasConflict,
    warnings,
    errors,
  };
}

export interface MultiAnchorResolution {
  anchors: Record<string, SignatureAnchor | null>;
  hasConflict: boolean;
  warnings: string[];
  errors: string[];
}

function candidatesCollide(a: SignatureCandidate, b: SignatureCandidate): boolean {
  if (a.pageIndex !== b.pageIndex) return false;
  return (
    rectsCollide(a.lineBounds, b.lineBounds) ||
    rectDistance(a.lineBounds, b.lineBounds) <= 12 ||
    rectsCollide(a.placementBounds, b.placementBounds)
  );
}

/**
 * Jointly resolves signature anchors for N enabled profiles across a document,
 * avoiding cross-person anchor collisions via non-overlapping candidate assignment.
 */
export function resolveMultiSignatureAnchors(
  profiles: PersonProfile[],
  assetsBySignerId: Record<string, PngAsset | null>,
  pages: PageAnalysis[],
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS,
): MultiAnchorResolution {
  const enabledProfiles = profiles.filter((p) => p.enabled);
  const candsById: Record<string, SignatureCandidate[]> = {};
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const profile of enabledProfiles) {
    const others = enabledProfiles.filter((other) => other.id !== profile.id);
    const cands = findSignatureCandidatesForPerson(
      profile,
      others,
      pages,
      assetsBySignerId[profile.id] ?? null,
    );
    candsById[profile.id] = cands;
    if (cands.length === 0) {
      errors.push(`SIGNER_NOT_FOUND:${profile.id}`);
    }
  }

  const matchedProfiles = enabledProfiles.filter((p) => (candsById[p.id]?.length ?? 0) > 0);
  const chosenById: Record<string, SignatureCandidate> = {};
  for (const p of matchedProfiles) {
    chosenById[p.id] = candsById[p.id]![0]!;
  }

  let hasCollisionInTop = false;
  for (let i = 0; i < matchedProfiles.length; i++) {
    for (let j = i + 1; j < matchedProfiles.length; j++) {
      if (candidatesCollide(chosenById[matchedProfiles[i]!.id]!, chosenById[matchedProfiles[j]!.id]!)) {
        hasCollisionInTop = true;
        break;
      }
    }
    if (hasCollisionInTop) break;
  }

  let hasUnresolvedConflict = false;
  let hasResolvedSwap = false;

  if (hasCollisionInTop) {
    const k = matchedProfiles.length <= 5 ? 4 : 2;
    let bestScore = -Infinity;
    let bestAssignment: Record<string, SignatureCandidate> | null = null;
    const current: SignatureCandidate[] = [];

    const search = (idx: number, accScore: number) => {
      if (idx === matchedProfiles.length) {
        if (accScore > bestScore) {
          bestScore = accScore;
          bestAssignment = {};
          for (let m = 0; m < matchedProfiles.length; m++) {
            bestAssignment[matchedProfiles[m]!.id] = current[m]!;
          }
        }
        return;
      }
      const p = matchedProfiles[idx]!;
      const pool = (candsById[p.id] ?? []).slice(0, k);
      for (const cand of pool) {
        if (current.some((picked) => candidatesCollide(picked, cand))) continue;
        current.push(cand);
        search(idx + 1, accScore + cand.heuristicScore);
        current.pop();
      }
    };

    search(0, 0);

    if (bestAssignment) {
      Object.assign(chosenById, bestAssignment);
      hasResolvedSwap = true;
      warnings.push(
        'AMBIGUOUS_PERSON_MATCH: Initial top candidates collided; non-overlapping assignment selected for review.',
      );
    } else {
      hasUnresolvedConflict = true;
      errors.push('MULTIPLE_ANCHORS_FOUND: Multiple signatories matched the same signature anchor.');
    }
  }

  const hasConflict = hasResolvedSwap || hasUnresolvedConflict;
  const anchors: Record<string, SignatureAnchor | null> = {};

  for (const profile of profiles) {
    if (!profile.enabled) {
      anchors[profile.id] = null;
      continue;
    }
    const chosen = chosenById[profile.id] ?? null;
    if (!chosen) {
      anchors[profile.id] = null;
      continue;
    }

    const cands = candsById[profile.id] ?? [];
    const second = cands[1];
    const status: AnchorStatus = hasConflict
      ? 'REVIEW_REQUIRED'
      : evaluateCandidateStatus(chosen, second, thresholds, profile);

    anchors[profile.id] = candidateToAnchor(
      chosen,
      status,
      cands.length,
      chosen.matchedBySurnameOnly
        ? [{ type: 'NAME', description: 'Surname-only match requires manual confirmation' }]
        : [],
    );

    if (anchors[profile.id]!.scores.lineMatch === 0) {
      warnings.push(`${profile.id}: Name found without an explicit signature line.`);
    }
  }

  return {
    anchors,
    hasConflict,
    warnings,
    errors,
  };
}
