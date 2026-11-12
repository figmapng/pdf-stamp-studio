import type { PageAnalysis, PersonProfile, Rect, TextBlock } from '../../types';
import {
  evaluateNameMatch,
  evaluateRoleMatch,
  findSharedNameTokens,
  type NameMatchEvaluation,
} from '../text-normalizer';

export interface NameBlockMatch {
  block: TextBlock;
  pageIndex: number;
  evaluation: NameMatchEvaluation;
  matchedBySurnameOnly: boolean;
}

export interface RoleBlockMatch {
  block: TextBlock;
  pageIndex: number;
  score: number;
  matchedRole: string;
}

export interface PersonBlockMatches {
  personId: PersonProfile['id'];
  nameMatches: NameBlockMatch[];
  roleMatches: RoleBlockMatch[];
}

export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

export function horizontalOverlapRatio(a: Rect, b: Rect): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (overlap <= 0) return 0;
  const minW = Math.min(a.width, b.width);
  return minW > 0 ? overlap / minW : 0;
}

/**
 * Scans all analyzed pages for text blocks matching a PersonProfile's name/variants
 * and role names, enforcing surname-collision awareness across the two profiles.
 */
export function matchPersonAcrossPages(
  profile: PersonProfile,
  otherProfile: PersonProfile | PersonProfile[] | null,
  pages: PageAnalysis[],
): PersonBlockMatches {
  const sharedSurnameTokens = new Set<string>();
  const others = Array.isArray(otherProfile)
    ? otherProfile
    : otherProfile
      ? [otherProfile]
      : [];
  for (const other of others) {
    if (other.id === profile.id) continue;
    for (const token of findSharedNameTokens(profile.fullName, other.fullName)) {
      sharedSurnameTokens.add(token);
    }
  }

  const nameMatches: NameBlockMatch[] = [];
  const roleMatches: RoleBlockMatch[] = [];

  if (!profile.enabled || !profile.fullName.trim()) {
    return { personId: profile.id, nameMatches, roleMatches };
  }

  for (const page of pages) {
    for (let i = 0; i < page.extractedText.length; i++) {
      const block = page.extractedText[i]!;

      // Evaluate single block and also adjacent block merged (in case name split across two adjacent spans)
      const evalSingle = evaluateNameMatch(
        block.text,
        profile.fullName,
        profile.nameVariants,
        sharedSurnameTokens,
      );

      if (evalSingle.score >= 0.25) {
        nameMatches.push({
          block,
          pageIndex: page.pageIndex,
          evaluation: evalSingle,
          matchedBySurnameOnly: evalSingle.matchKind === 'SURNAME_ONLY',
        });
      }

      if (profile.roleNames.length > 0) {
        const roleEval = evaluateRoleMatch(block.text, profile.roleNames);
        if (roleEval.score >= 0.65 && roleEval.matchedRole) {
          roleMatches.push({
            block,
            pageIndex: page.pageIndex,
            score: roleEval.score,
            matchedRole: roleEval.matchedRole,
          });
        }
      }
    }
  }

  return {
    personId: profile.id,
    nameMatches,
    roleMatches,
  };
}
