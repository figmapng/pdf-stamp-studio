import { describe, expect, it } from 'vitest';
import {
  evaluateNameMatch,
  evaluateRoleMatch,
  findSharedNameTokens,
  normalizeOcrTolerant,
  normalizeText,
  parsePersonName,
} from '../../src/engine/text-normalizer';

describe('Text Normalizer & Person Name/Role Matching', () => {
  it('normalizes Unicode, case, quotes, dashes, and whitespace', () => {
    const raw = '  «Серіков—Асылбек»   Бекболатұлы,  ';
    expect(normalizeText(raw)).toBe('серіков-асылбек бекболатұлы');
  });

  it('generates initial variants for Kazakh/Russian full names', () => {
    const parsed = parsePersonName('Серіков Асылбек Бекболатұлы');
    expect(parsed.generatedVariants).toContain('серіков а б');
    expect(parsed.generatedVariants).toContain('а б серіков');
    expect(parsed.generatedVariants).toContain('серіков а');
  });

  it('matches exact, initial-based, and explicit variants accurately', () => {
    const res1 = evaluateNameMatch(
      'А. Б. Серіков',
      'Серіков Асылбек Бекболатұлы',
      ['Serikov A.B.'],
    );
    expect(res1.score).toBeGreaterThanOrEqual(0.9);
    expect(res1.matchKind).toBe('INITIALS_MATCH');

    const res2 = evaluateNameMatch(
      'Serikov A.B.',
      'Серіков Асылбек Бекболатұлы',
      ['Serikov A.B.'],
    );
    expect(res2.score).toBeGreaterThanOrEqual(0.9);
  });

  it('handles OCR-confused Kazakh characters and Cyrillic/Latin homoglyphs at candidate level', () => {
    expect(normalizeOcrTolerant('Қайрат Ғабитов')).toBe('каират габитов');
    // Latin 'A' and 'C'/'e'/'o' mixed into Cyrillic text
    const res = evaluateNameMatch(
      'А. С. Сериков',
      'Серіков Асылбек',
      [],
    );
    expect(res.score).toBeGreaterThanOrEqual(0.75);
  });

  it('never gives a full match for surname-only, and heavily penalizes shared surnames', () => {
    const shared = findSharedNameTokens('Ахметов Марат Сейітұлы', 'Ахметов Дамир Болатұлы');
    expect(shared.has('ахметов')).toBe(true);

    const surnameOnlyNormal = evaluateNameMatch('Серіков', 'Серіков Асылбек', []);
    expect(surnameOnlyNormal.matchKind).toBe('SURNAME_ONLY');
    expect(surnameOnlyNormal.score).toBeLessThan(0.5);

    const surnameOnlyShared = evaluateNameMatch('Ахметов', 'Ахметов Марат Сейітұлы', [], shared);
    expect(surnameOnlyShared.matchKind).toBe('SURNAME_ONLY');
    expect(surnameOnlyShared.score).toBeLessThanOrEqual(0.25);
  });

  it('matches multi-language role names cleanly', () => {
    const r1 = evaluateRoleMatch('Бас директор', ['Генеральный директор', 'Бас директор']);
    expect(r1.score).toBe(1);

    const r2 = evaluateRoleMatch('Исполняющий обязанности главного бухгалтера', ['Главный бухгалтер']);
    expect(r2.score).toBeGreaterThanOrEqual(0.9);

    const r3 = evaluateRoleMatch('Менеджер по продажам', ['Бас директор']);
    expect(r3.score).toBe(0);
  });
});
