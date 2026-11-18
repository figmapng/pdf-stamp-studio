import type { PngAsset, SignerConfig, StampConfig } from '../types';

/**
 * Bridge to the Windows desktop shell (pywebview). In the browser build there is no bridge and
 * every function here is a harmless no-op.
 */
interface DesktopApi {
  syncProfiles?: (payload: ExcelSyncPayload) => Promise<{ success: boolean; error?: string }>;
  installExcelAddin?: () => Promise<{ success: boolean; error?: string; output?: string }>;
  uninstallExcelAddin?: () => Promise<{ success: boolean; error?: string; output?: string }>;
  getExcelStatus?: () => Promise<ExcelStatus>;
  prewarmOffice?: () => Promise<boolean>;
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
    enabled: boolean;
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

/** Longest side (px) sent to Excel: sharp enough for print, small enough to keep PDFs light. */
const MAX_EXCEL_IMAGE_SIDE = 1400;
const encodedCache = new WeakMap<Uint8Array, string>();

/** PNG as base64, downscaled when huge (phone photos are 4000 px+). Falls back to the original. */
async function assetToBase64(asset: PngAsset | null): Promise<string | null> {
  if (!asset) return null;
  const cached = encodedCache.get(asset.bytes);
  if (cached) return cached;

  let out: string;
  const longest = Math.max(asset.naturalWidth || 0, asset.naturalHeight || 0);
  if (longest > MAX_EXCEL_IMAGE_SIDE && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(asset.bytes)], { type: 'image/png' }));
      const scale = MAX_EXCEL_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('encode failed');
      out = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    } catch {
      out = bytesToBase64(asset.bytes);
    }
  } else {
    out = bytesToBase64(asset.bytes);
  }
  encodedCache.set(asset.bytes, out);
  return out;
}

export async function buildExcelSyncPayload(
  signers: SignerConfig[],
  stamps: StampConfig[],
): Promise<ExcelSyncPayload> {
  const offSigners = new Set(signers.filter((s) => s.profile.enabled === false).map((s) => s.id));
  return {
    signers: await Promise.all(
      signers.map(async (s) => ({
        id: s.id,
        enabled: s.profile.enabled !== false,
        fullName: s.profile.fullName.trim(),
        names: Array.from(new Set([s.profile.fullName, ...s.profile.nameVariants]))
          .map((n) => n.trim())
          .filter(Boolean),
        roles: s.profile.roleNames.map((r) => r.trim()).filter(Boolean),
        imageBase64: await assetToBase64(s.asset),
        widthPt: 110,
      })),
    ),
    stamps: await Promise.all(
      stamps.map(async (st) => ({
        id: st.id,
        enabled: st.enabled !== false && !offSigners.has(st.policy.owner),
        label: st.label,
        owner: st.policy.owner,
        relation: st.policy.relation,
        anchorPosition: st.policy.anchorPosition ?? 'AUTO',
        widthPt: st.policy.defaultWidthPt,
        overlapRatio: st.policy.overlapRatio,
        rotation: st.policy.defaultRotation,
        imageBase64: await assetToBase64(st.asset),
      })),
    ),
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
    await api.syncProfiles(await buildExcelSyncPayload(signers, stamps));
  } catch {
    // Sync is best-effort; the UI keeps working without it.
  }
}
