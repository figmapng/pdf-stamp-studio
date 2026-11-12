/**
 * Text Normalization & Fuzzy / OCR-Aware Matching utilities.
 * Supports Kazakh (Cyrillic + Latin), Russian, and Latin scripts.
 * Always preserves original raw strings for audit/preview while normalizing for comparison.
 */

const CYRILLIC_TO_LATIN_CONFUSIONS: Record<string, string> = {
  'а': 'a',
  'в': 'b',
  'е': 'e',
  'ё': 'e',
  'к': 'k',
  'м': 'm',
  'н': 'h',
  'о': 'o',
  'р': 'p',
  'с': 'c',
  'т': 't',
  'у': 'y',
  'х': 'x',
  'і': 'i',
};

const KAZAKH_CYRILLIC_RELAXED: Record<string, string> = {
  'ә': 'а',
  'ғ': 'г',
  'қ': 'к',
  'ң': 'н',
  'ө': 'о',
  'ұ': 'у',
  'ү': 'у',
  'һ': 'х',
  'і': 'и',
  'ё': 'е',
  'й': 'и',
  'щ': 'ш',
  'ъ': '',
  'ь': '',
};

const KAZAKH_CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a',
  'ә': 'a',
  'б': 'b',
  'в': 'v',
  'г': 'g',
  'ғ': 'g',
  'д': 'd',
  'е': 'e',
  'ё': 'yo',
  'ж': 'zh',
  'з': 'z',
  'и': 'i',
  'й': 'y',
  'к': 'k',
  'қ': 'q',
  'л': 'l',
  'м': 'm',
  'н': 'n',
  'ң': 'ng',
  'о': 'o',
  'ө': 'o',
  'п': 'p',
  'р': 'r',
  'с': 's',
  'т': 't',
  'у': 'u',
  'ұ': 'u',
  'ү': 'u',
  'ф': 'f',
  'х': 'kh',
  'һ': 'h',
  'ц': 'ts',
  'ч': 'ch',
  'ш': 'sh',
  'щ': 'shch',
  'ъ': '',
  'ы': 'y',
  'і': 'i',
  'ь': '',
  'э': 'e',
  'ю': 'yu',
  'я': 'ya',
};

/**
 * Strict text normalization: NFC Unicode, lowercase, unify dashes/quotes,
 * collapse whitespace, trim surrounding punctuation on tokens.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[«»„“”"']/g, ' ')
    .replace(/[.,;:!?()[\]{}<>/\\|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Candidate-level OCR-tolerant normalization: folds Kazakh-specific diacritics
 * to base Cyrillic letters and normalizes common OCR homoglyphs (`0->o`, `1->i`, Latin<->Cyrillic).
 * Used ONLY at candidate scoring level, never as sole match proof.
 */
export function normalizeOcrTolerant(raw: string): string {
  const base = normalizeText(raw);
  let out = '';
  for (const ch of base) {
    if (ch === '0') {
      out += 'о';
    } else if (ch === '1') {
      out += 'і';
    } else if (ch === '3') {
      out += 'з';
    } else if (KAZAKH_CYRILLIC_RELAXED[ch] !== undefined) {
      out += KAZAKH_CYRILLIC_RELAXED[ch];
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Homoglyph skeleton folding both Cyrillic and Latin lookalikes into one comparison key.
 */
export function toHomoglyphSkeleton(raw: string): string {
  const relaxed = normalizeOcrTolerant(raw);
  let out = '';
  for (const ch of relaxed) {
    out += CYRILLIC_TO_LATIN_CONFUSIONS[ch] ?? ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Rough phonetic/transliteration folding from Kazakh/Russian Cyrillic to Latin,
 * useful when a profile has Cyrillic fullName and the document uses Latin (or vice versa).
 */
export function transliterateToLatin(raw: string): string {
  const norm = normalizeText(raw);
  let out = '';
  for (const ch of norm) {
    out += KAZAKH_CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function tokenize(raw: string): string[] {
  const norm = normalizeText(raw);
  return norm ? norm.split(' ').filter(Boolean) : [];
}

/**
 * Standard Levenshtein edit distance.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j] ?? 0;
    }
  }

  return prev[b.length] ?? 0;
}

export function stringSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshteinDistance(na, nb);
  return Math.max(0, 1 - dist / maxLen);
}

export interface ParsedPersonName {
  raw: string;
  tokens: string[];
  surnameCandidates: string[];
  givenTokens: string[];
  /** Generated canonical & abbreviated forms, e.g. "а б серіков", "серіков а б", "серіков а" */
  generatedVariants: string[];
}

/**
 * Extracts plausible surname/given tokens and generates standard Kazakh/Russian
 * initial-based name forms without making rigid First/Last assumptions.
 */
export function parsePersonName(fullName: string): ParsedPersonName {
  const tokens = tokenize(fullName);
  const variants = new Set<string>();
  const joined = tokens.join(' ');
  if (joined) variants.add(joined);

  const longTokens = tokens.filter((t) => t.length > 1);
  const initials = tokens.map((t) => t[0] ?? '').filter(Boolean);

  if (tokens.length >= 2) {
    // Pattern 1: "Surname Name Patronymic" -> "Surname N. P.", "N. P. Surname", "Surname N."
    const first = tokens[0] ?? '';
    const last = tokens[tokens.length - 1] ?? '';

    const restInitialsFromFirst = tokens.slice(1).map((t) => t[0] ?? '').filter(Boolean);
    if (first.length > 1 && restInitialsFromFirst.length > 0) {
      variants.add(`${first} ${restInitialsFromFirst.join(' ')}`);
      variants.add(`${restInitialsFromFirst.join(' ')} ${first}`);
      variants.add(`${first} ${restInitialsFromFirst[0]}`);
      variants.add(`${restInitialsFromFirst[0]} ${first}`);
      variants.add(`${first} ${restInitialsFromFirst.join('')}`);
      variants.add(`${restInitialsFromFirst.join('')} ${first}`);
    }

    // Pattern 2: "Name Patronymic Surname" or "Name Surname" -> "N. P. Surname", "Surname N. P."
    const prefixInitialsFromLast = tokens.slice(0, -1).map((t) => t[0] ?? '').filter(Boolean);
    if (last.length > 1 && prefixInitialsFromLast.length > 0) {
      variants.add(`${prefixInitialsFromLast.join(' ')} ${last}`);
      variants.add(`${last} ${prefixInitialsFromLast.join(' ')}`);
      variants.add(`${prefixInitialsFromLast[0]} ${last}`);
      variants.add(`${last} ${prefixInitialsFromLast[0]}`);
      variants.add(`${prefixInitialsFromLast.join('')} ${last}`);
      variants.add(`${last} ${prefixInitialsFromLast.join('')}`);
    }
  }

  return {
    raw: fullName,
    tokens,
    surnameCandidates: longTokens.length > 0 ? [longTokens[0]!, longTokens[longTokens.length - 1]!] : initials,
    givenTokens: longTokens,
    generatedVariants: Array.from(variants),
  };
}

export interface NameMatchEvaluation {
  score: number;
  matchKind: 'EXACT_VARIANT' | 'INITIALS_MATCH' | 'FUZZY_VARIANT' | 'SURNAME_ONLY' | 'NONE';
  matchedText?: string;
}

/**
 * Evaluates how well a text snippet matches a person's full name & variants.
 * Enforces the rule that matching only a single surname token is marked as SURNAME_ONLY
 * and receives a capped score so it cannot auto-approve when ambiguous.
 */
export function evaluateNameMatch(
  candidateText: string,
  fullName: string,
  explicitVariants: string[],
  sharedSurnameTokens: Set<string> = new Set(),
): NameMatchEvaluation {
  const normCandidate = normalizeText(candidateText);
  const ocrCandidate = normalizeOcrTolerant(candidateText);
  const skelCandidate = toHomoglyphSkeleton(candidateText);
  const latCandidate = transliterateToLatin(candidateText);

  if (!normCandidate) {
    return { score: 0, matchKind: 'NONE' };
  }

  const parsed = parsePersonName(fullName);
  const allVariants = Array.from(
    new Set([
      ...parsed.generatedVariants,
      ...explicitVariants.map(normalizeText).filter(Boolean),
    ]),
  );

  // 1. Exact or substring match on full/explicit/generated multi-token variants
  for (const variant of allVariants) {
    const vTokens = tokenize(variant);
    if (vTokens.length < 2) continue;

    if (
      normCandidate === variant ||
      normCandidate.includes(variant) ||
      ocrCandidate.includes(normalizeOcrTolerant(variant)) ||
      skelCandidate.includes(toHomoglyphSkeleton(variant)) ||
      latCandidate.includes(transliterateToLatin(variant))
    ) {
      const isInitials = vTokens.some((t) => t.length <= 2);
      return {
        score: isInitials ? 0.94 : 1.0,
        matchKind: isInitials ? 'INITIALS_MATCH' : 'EXACT_VARIANT',
        matchedText: candidateText,
      };
    }
  }

  // 2. Token-level set & fuzzy matching across multi-token forms
  const candTokens = tokenize(candidateText);
  const candOcrTokens = tokenize(ocrCandidate);
  const candSkelTokens = tokenize(skelCandidate);

  let bestFuzzyScore = 0;
  for (const variant of allVariants) {
    const vTokens = tokenize(variant);
    if (vTokens.length < 2) continue;

    let matchedTokenWeight = 0;
    let totalWeight = 0;
    let nonInitialMatched = 0;
    let initialMatched = 0;

    for (const vt of vTokens) {
      const weight = vt.length > 2 ? 1.0 : 0.45;
      totalWeight += weight;

      const vtOcr = normalizeOcrTolerant(vt);
      const vtSkel = toHomoglyphSkeleton(vt);

      let tokenBest = 0;
      for (let i = 0; i < candTokens.length; i++) {
        const ct = candTokens[i] ?? '';
        const ctOcr = candOcrTokens[i] ?? '';
        const ctSkel = candSkelTokens[i] ?? '';

        if (vt.length <= 2) {
          // Initial match: either exact initial or prefix of full given name
          if (ct === vt || ctOcr === vtOcr || ctSkel === vtSkel || (ct.length > 1 && ct.startsWith(vt[0] ?? ''))) {
            tokenBest = 1;
            break;
          }
        } else {
          if (ct === vt || ctOcr === vtOcr || ctSkel === vtSkel) {
            tokenBest = 1;
            break;
          }
          const sim = Math.max(
            stringSimilarity(ct, vt),
            stringSimilarity(ctOcr, vtOcr),
            stringSimilarity(ctSkel, vtSkel),
          );
          if (sim >= 0.78 && sim > tokenBest) {
            tokenBest = sim;
          }
        }
      }

      if (tokenBest >= 0.78) {
        matchedTokenWeight += weight * tokenBest;
        if (vt.length > 2) nonInitialMatched++;
        else initialMatched++;
      }
    }

    if (totalWeight > 0) {
      const ratio = matchedTokenWeight / totalWeight;
      // Require either 2+ full tokens matched, or 1 full token + at least 1 initial
      if ((nonInitialMatched >= 2 || (nonInitialMatched >= 1 && initialMatched >= 1)) && ratio >= 0.72) {
        bestFuzzyScore = Math.max(bestFuzzyScore, Math.min(0.92, ratio));
      }
    }
  }

  if (bestFuzzyScore >= 0.72) {
    return {
      score: bestFuzzyScore,
      matchKind: 'FUZZY_VARIANT',
      matchedText: candidateText,
    };
  }

  // 3. Single-token surname / explicit single-token variant check (strictly capped!)
  const singleCandidates = parsed.tokens.filter((t) => t.length >= 3);
  for (const token of singleCandidates) {
    const tOcr = normalizeOcrTolerant(token);
    const hit = candTokens.some((ct, idx) => {
      const ctOcr = candOcrTokens[idx] ?? '';
      return ct === token || ctOcr === tOcr || stringSimilarity(ctOcr, tOcr) >= 0.88;
    });

    if (hit) {
      const isSharedSurname = sharedSurnameTokens.has(tOcr) || sharedSurnameTokens.has(token);
      return {
        // Heavily penalized if shared surname, capped even if not shared so surname alone never reaches 1.0
        score: isSharedSurname ? 0.25 : 0.45,
        matchKind: 'SURNAME_ONLY',
        matchedText: candidateText,
      };
    }
  }

  return { score: 0, matchKind: 'NONE' };
}

/**
 * Evaluates role title match (Kazakh/Russian/Latin variants).
 */
export function evaluateRoleMatch(candidateText: string, roleNames: string[]): { score: number; matchedRole?: string } {
  const normCand = normalizeText(candidateText);
  const ocrCand = normalizeOcrTolerant(candidateText);
  const latCand = transliterateToLatin(candidateText);
  if (!normCand) return { score: 0 };

  let bestScore = 0;
  let matchedRole: string | undefined;

  for (const rawRole of roleNames) {
    const normRole = normalizeText(rawRole);
    const ocrRole = normalizeOcrTolerant(rawRole);
    const latRole = transliterateToLatin(rawRole);
    if (!normRole) continue;

    if (
      normCand === normRole ||
      normCand.includes(normRole) ||
      ocrCand.includes(ocrRole) ||
      latCand.includes(latRole)
    ) {
      return { score: 1.0, matchedRole: rawRole };
    }

    // Token coverage for multi-word roles like "Бас директор" / "Генеральный директор"
    // Supports Kazakh/Russian inflected suffixes via stem-prefix overlap (>= 5 chars)
    const roleTokens = tokenize(normRole);
    const candTokens = tokenize(normCand);
    if (roleTokens.length >= 1) {
      let matched = 0;
      for (const rt of roleTokens) {
        const rtOcr = normalizeOcrTolerant(rt);
        const stemLen = Math.max(4, Math.min(rtOcr.length, 5));
        const rtStem = rtOcr.slice(0, stemLen);
        const found = candTokens.some((ct) => {
          const ctOcr = normalizeOcrTolerant(ct);
          return (
            ct === rt ||
            ctOcr === rtOcr ||
            stringSimilarity(ctOcr, rtOcr) >= 0.72 ||
            (rtOcr.length >= 5 && ctOcr.length >= 5 && ctOcr.startsWith(rtStem))
          );
        });
        if (found) matched++;
      }
      const ratio = matched / roleTokens.length;
      if (ratio >= 0.7 && ratio > bestScore) {
        bestScore = Math.min(0.95, ratio);
        matchedRole = rawRole;
      }
    }
  }

  return { score: bestScore, matchedRole };
}

/**
 * Finds surname/long tokens shared between Person A and Person B so we prevent
 * ambiguous surname-only matches.
 */
export function findSharedNameTokens(nameA: string, nameB: string): Set<string> {
  const tokensA = new Set(
    tokenize(nameA)
      .filter((t) => t.length >= 3)
      .map(normalizeOcrTolerant),
  );
  const shared = new Set<string>();
  for (const tb of tokenize(nameB)) {
    if (tb.length >= 3) {
      const tbOcr = normalizeOcrTolerant(tb);
      if (tokensA.has(tbOcr)) {
        shared.add(tbOcr);
      }
    }
  }
  return shared;
}
