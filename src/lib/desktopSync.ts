import type { SignerConfig, StampConfig } from '../types';

/**
 * Bridge to the Windows desktop shell (pywebview). In the browser build there is no bridge and
 * every function here is a harmless no-op.
 */
interface DesktopApi {
  syncProfiles?: (payload: ExcelSyncPayload) => Promise<{ success: boolean; error?: string }>;
  installExcelAddin?: () => Promise<{ success: boolean; error?: string; output?: string }>;
  uninstallExcelAddin?: () => Promise<{ success: boolean; error?: string; output?: string }>;
  getExcelStatus?: () => Promise<ExcelStatus>;
}

export interface ExcelStatus {
  installed: boolean;
  signers: number;
  stamps: number;
  configPath: string;
}

export interface ExcelSyncPayload {
  signers: Array<{
    id: string;
    enabled: boolean;
    fullName: string;
    names: string[];
    roles: string[];
    imageBase64: string | null;
    widthPt: number;
  }>;
  stamps: Array<{
    id: string;
    label: string;
    owner: string;
    relation: string;
    anchorPosition: string;
    widthPt: number;
    overlapRatio: number;
    rotation: number;
    imageBase64: string | null;
  }>;
}

export function getDesktopApi(): DesktopApi | null {
  const api = (window as unknown as { pywebview?: { api?: DesktopApi } }).pywebview?.api;
  return api ?? null;
}

export function isDesktopShell(): boolean {
  return getDesktopApi() !== null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function buildExcelSyncPayload(
  signers: SignerConfig[],
  stamps: StampConfig[],
): ExcelSyncPayload {
  return {
    signers: signers.map((s) => ({
      id: s.id,
      enabled: s.profile.enabled !== false,
      fullName: s.profile.fullName.trim(),
      names: Array.from(new Set([s.profile.fullName, ...s.profile.nameVariants]))
        .map((n) => n.trim())
        .filter(Boolean),
      roles: s.profile.roleNames.map((r) => r.trim()).filter(Boolean),
      imageBase64: s.asset ? bytesToBase64(s.asset.bytes) : null,
      widthPt: 110,
    })),
    stamps: stamps.map((st) => ({
      id: st.id,
      label: st.label,
      owner: st.policy.owner,
      relation: st.policy.relation,
      anchorPosition: st.policy.anchorPosition ?? 'AUTO',
      widthPt: st.policy.defaultWidthPt,
      overlapRatio: st.policy.overlapRatio,
      rotation: st.policy.defaultRotation,
      imageBase64: st.asset ? bytesToBase64(st.asset.bytes) : null,
    })),
  };
}

/** Writes the current signatories/stamps where the Excel button can read them. */
export async function syncProfilesToExcel(
  signers: SignerConfig[],
  stamps: StampConfig[],
): Promise<void> {
  const api = getDesktopApi();
  if (!api?.syncProfiles) return;
  try {
    await api.syncProfiles(buildExcelSyncPayload(signers, stamps));
  } catch {
    // Sync is best-effort; the UI keeps working without it.
  }
}
