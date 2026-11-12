import type { AppLanguage } from '../types';
import { kk } from './kk';
import { ru } from './ru';

export type Translations = typeof kk | typeof ru;

const DICTS: Record<AppLanguage, Translations> = {
  kk,
  ru,
};

export function getTranslations(lang: AppLanguage): Translations {
  return DICTS[lang] ?? kk;
}
