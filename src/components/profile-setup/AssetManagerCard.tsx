import React, { useId, useRef, useState } from 'react';
import { Eraser, Loader2, RotateCcw, Trash2, Upload, UploadCloud } from 'lucide-react';
import type { PngAsset } from '../../types';
import type { Translations } from '../../i18n';
import { inspectPngBytes } from '../../engine/image-processing';
import { prepareUploadedAsset } from '../../engine/image-processing/browserAssetProcessor';
import { MAX_PNG_FILE_BYTES } from '../../engine/validation';
import { Button, Card, CardContent, CardHeader, CardTitle, IconButton } from '../ui';
import { SignaturePreview, StampPreview } from '../domain';

interface AssetManagerCardProps {
  kind: PngAsset['kind'];
  title: string;
  asset: PngAsset | null;
  onAssetChange: (next: PngAsset | null) => void;
  embedded?: boolean;
  t: Translations;
}

export const AssetManagerCard: React.FC<AssetManagerCardProps> = ({
  kind,
  title,
  asset,
  onAssetChange,
  embedded = false,
  t,
}) => {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [rawSource, setRawSource] = useState<{ blob: Blob; fileName: string } | null>(null);

  const commitProcessedBlob = async (
    sourceBlob: Blob,
    sourceName: string,
    mode: 'auto' | 'always' | 'never',
  ) => {
    setError(null);
    setIsProcessing(true);
    try {
      const processed = await prepareUploadedAsset({
        blob: sourceBlob,
        fileName: sourceName,
        removeBackground: mode,
      });
      const inspection = await inspectPngBytes(processed.pngBytes);

      if (!inspection.isValid) {
        setError(inspection.error ?? t.assets.pngOnlyError);
        return;
      }

      if (asset?.objectUrl) {
        URL.revokeObjectURL(asset.objectUrl);
      }

      const copy = new Uint8Array(processed.pngBytes.byteLength);
      copy.set(processed.pngBytes);
      const outBlob = new Blob([copy], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(outBlob);

      setBgRemoved(processed.bgRemoved);
      onAssetChange({
        id: `${kind}-${Date.now()}`,
        kind,
        fileName: processed.outputFileName,
        fileSize: processed.pngBytes.byteLength,
        bytes: processed.pngBytes,
        objectUrl,
        naturalWidth: inspection.width,
        naturalHeight: inspection.height,
        opaqueBounds: inspection.opaqueBounds,
        transparentPaddingRatio: inspection.transparentPaddingRatio,
        hasAlphaTransparency: inspection.hasAlphaTransparency,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.assets.pngOnlyError);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);

    if (file.size > MAX_PNG_FILE_BYTES) {
      setError(`File exceeds 15 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }

    const lower = file.name.toLowerCase();
    const isSupportedName =
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp');
    const isSupportedMime =
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/webp' ||
      file.type === '';
    if (!isSupportedName && !isSupportedMime) {
      setError(t.assets.pngOnlyError);
      return;
    }

    setRawSource({ blob: file, fileName: file.name });
    await commitProcessedBlob(file, file.name, 'auto');
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const removeAsset = () => {
    setError(null);
    setBgRemoved(false);
    setRawSource(null);
    if (asset?.objectUrl) {
      URL.revokeObjectURL(asset.objectUrl);
    }
    onAssetChange(null);
  };

  const handleToggleBackground = async () => {
    if (!asset) return;
    const copy = new Uint8Array(asset.bytes.byteLength);
    copy.set(asset.bytes);
    const source = rawSource ?? {
      blob: new Blob([copy], { type: 'image/png' }),
      fileName: asset.fileName,
    };
    if (bgRemoved) {
      await commitProcessedBlob(source.blob, source.fileName, 'never');
    } else {
      await commitProcessedBlob(source.blob, source.fileName, 'always');
    }
  };

  const contentBody = (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        onChange={onInputChange}
        aria-describedby={error ? errorId : undefined}
        className="visually-hidden"
      />

      {!asset ? (
        <div
          role="button"
          tabIndex={isProcessing ? -1 : 0}
          aria-label={`${title}: ${t.assets.uploadPng}`}
          onClick={() => !isProcessing && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!isProcessing && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed px-3 py-5 text-center transition-colors ${
            isDragging
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
              : 'border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/35'
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-primary)] shadow-[var(--shadow-xs)]">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <UploadCloud className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </span>
          <p className="text-xs font-semibold text-[var(--color-text-primary)]">
            {isProcessing ? t.assets.processingNote : t.assets.uploadPng}
          </p>
          <p className="text-[11px] text-[var(--color-text-muted)]">{t.assets.dropHint}</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`space-y-2.5 rounded-[var(--radius-md)] border p-2.5 transition-colors ${
            isDragging
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]'
          }`}
        >
          {kind === 'STAMP' ? (
            <StampPreview
              asset={asset}
              alt={title}
              emptyLabel={t.assets.emptyAsset}
              transparentOkLabel={t.assets.transparentOk}
              opaqueWarningLabel={t.assets.opaqueWarning}
              paddingLabel={t.assets.paddingInfo}
            />
          ) : (
            <SignaturePreview
              asset={asset}
              alt={title}
              emptyLabel={t.assets.emptyAsset}
              transparentOkLabel={t.assets.transparentOk}
              opaqueWarningLabel={t.assets.opaqueWarning}
              paddingLabel={t.assets.paddingInfo}
            />
          )}

          <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border-subtle)] pt-2">
            <Button
              variant="outline"
              size="sm"
              isLoading={isProcessing}
              onClick={() => inputRef.current?.click()}
              className="flex-1"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t.assets.replacePng}
            </Button>
            {(!bgRemoved || rawSource) && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isProcessing}
                onClick={() => void handleToggleBackground()}
                title={bgRemoved ? t.assets.bgAutoRemovedNote : undefined}
              >
                {bgRemoved ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {t.assets.restoreOriginalBtn}
                  </>
                ) : (
                  <>
                    <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {t.assets.removeBgBtn}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-xs font-medium text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-2 border-t border-[var(--color-border-subtle)] pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{title}</span>
          {asset && (
            <IconButton
              variant="ghost"
              size="sm"
              onClick={removeAsset}
              aria-label={t.assets.removePng}
              icon={<Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" strokeWidth={1.75} aria-hidden="true" />}
            />
          )}
        </div>
        {contentBody}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="px-3.5 py-2">
        <CardTitle className="text-xs font-semibold">{title}</CardTitle>
        {asset && (
          <IconButton
            variant="ghost"
            size="sm"
            onClick={removeAsset}
            aria-label={t.assets.removePng}
            icon={<Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" strokeWidth={1.75} aria-hidden="true" />}
          />
        )}
      </CardHeader>

      <CardContent className="p-3">{contentBody}</CardContent>
    </Card>
  );
};
