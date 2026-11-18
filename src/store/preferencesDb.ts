import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppLanguage,
  DetectionThresholds,
  OcrConfig,
  PersonProfile,
  PngAsset,
  SignerConfig,
  StampConfig,
  StampPolicy,
} from '../types';

export type PersistedPngAsset = Omit<PngAsset, 'objectUrl'>;

export interface PersistedSignerConfig {
  id: string;
  profile: Omit<PersonProfile, 'signatureAssetId'>;
  asset: PersistedPngAsset | null;
}

export interface PersistedStampConfig {
  id: string;
  label: string;
  policy: StampPolicy;
  asset: PersistedPngAsset | null;
  enabled?: boolean;
}

export interface SavedPreferences {
  language: AppLanguage;
  stampPolicy: StampPolicy;
  thresholds: DetectionThresholds;
  ocrConfig: OcrConfig;
  enableOpenCv: boolean;
  /** Opt-in (enabled by default) to persist signatories, stamps, and their PNGs locally in browser IndexedDB. */
  rememberProfileTextsOptIn: boolean;
  savedProfiles?: {
    personA: Omit<PersonProfile, 'signatureAssetId'>;
    personB: Omit<PersonProfile, 'signatureAssetId'>;
  };
  savedSigners?: Array<Omit<PersonProfile, 'signatureAssetId'>>;
  savedStamps?: Array<{ id: string; label: string; policy: StampPolicy }>;
  savedSignerConfigs?: PersistedSignerConfig[];
  savedStampConfigs?: PersistedStampConfig[];
}

export function serializePngAsset(asset: PngAsset | null): PersistedPngAsset | null {
  if (!asset) return null;
  const { objectUrl: _ignored, bytes, ...rest } = asset;
  return {
    ...rest,
    bytes: new Uint8Array(bytes),
  };
}

export function hydratePngAsset(persisted: PersistedPngAsset | null): PngAsset | null {
  if (!persisted || !persisted.bytes) return null;
  const copy = new Uint8Array(persisted.bytes);
  const blob = new Blob([copy], { type: 'image/png' });
  const objectUrl = URL.createObjectURL(blob);
  return {
    ...persisted,
    bytes: copy,
    objectUrl,
  };
}

export function serializeSignerConfig(signer: SignerConfig): PersistedSignerConfig {
  const { signatureAssetId: _ignored, ...profileRest } = signer.profile;
  return {
    id: signer.id,
    profile: profileRest,
    asset: serializePngAsset(signer.asset),
  };
}

export function hydrateSignerConfig(persisted: PersistedSignerConfig): SignerConfig {
  const asset = hydratePngAsset(persisted.asset);
  return {
    id: persisted.id,
    profile: {
      ...persisted.profile,
      signatureAssetId: asset?.id ?? null,
      enabled: persisted.profile.enabled !== false,
    },
    asset,
  };
}

export function serializeStampConfig(stamp: StampConfig): PersistedStampConfig {
  return {
    id: stamp.id,
    label: stamp.label,
    policy: stamp.policy,
    asset: serializePngAsset(stamp.asset),
    enabled: stamp.enabled !== false,
  };
}

export function hydrateStampConfig(persisted: PersistedStampConfig): StampConfig {
  return {
    id: persisted.id,
    label: persisted.label,
    policy: persisted.policy,
    asset: hydratePngAsset(persisted.asset),
    enabled: persisted.enabled !== false,
  };
}

interface PdfStampStudioDB extends DBSchema {
  preferences: {
    key: string;
    value: SavedPreferences;
  };
}

const DB_NAME = 'pdf-stamp-studio-prefs';
const DB_VERSION = 1;
const STORE_NAME = 'preferences';
const PREF_KEY = 'user-settings';

let dbPromise: Promise<IDBPDatabase<PdfStampStudioDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PdfStampStudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PdfStampStudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function loadPreferences(): Promise<SavedPreferences | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await getDb();
    const record = await db.get(STORE_NAME, PREF_KEY);
    return record ?? null;
  } catch {
    return null;
  }
}

export async function savePreferences(prefs: SavedPreferences): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await getDb();
    const payload: SavedPreferences = {
      ...prefs,
      savedProfiles: prefs.rememberProfileTextsOptIn ? prefs.savedProfiles : undefined,
      savedSigners: prefs.rememberProfileTextsOptIn ? prefs.savedSigners : undefined,
      savedStamps: prefs.rememberProfileTextsOptIn ? prefs.savedStamps : undefined,
      savedSignerConfigs: prefs.rememberProfileTextsOptIn ? prefs.savedSignerConfigs : undefined,
      savedStampConfigs: prefs.rememberProfileTextsOptIn ? prefs.savedStampConfigs : undefined,
    };
    await db.put(STORE_NAME, payload, PREF_KEY);
  } catch {
    // Non-fatal storage error
  }
}

export async function clearPreferences(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, PREF_KEY);
  } catch {
    // Ignore
  }
}
