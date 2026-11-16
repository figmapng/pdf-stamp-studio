import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileWarning,
  Lock,
  Trash2,
} from 'lucide-react';
import type { UploadedPdfFile } from '../../types';
import type { Translations } from '../../i18n';
import { inspectPdfIntegrity } from '../../engine/pdf-parser';
import {
  MAX_PDF_BATCH_MVP,
  MAX_PDF_FILE_BYTES,
  makeUniqueFileName,
} from '../../engine/validation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui';
import { FileUploader } from '../domain';

interface PdfUploaderProps {
  files: UploadedPdfFile[];
  onAddFiles: (added: UploadedPdfFile[]) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  t: Translations;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] ?? res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  t,
}) => {
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const processFileList = async (fileList: FileList | File[]) => {
    setUploadWarning(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const remainingSlots = Math.max(0, MAX_PDF_BATCH_MVP - files.length);
    let toProcess = incoming;
    if (incoming.length > remainingSlots) {
      toProcess = incoming.slice(0, remainingSlots);
      setUploadWarning(t.upload.limitWarning);
    }

    const usedNames = new Set(files.map((f) => f.fileName));
    const parsed: UploadedPdfFile[] = [];

    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]!;
      const uniqueName = makeUniqueFileName(file.name, usedNames);

      if (file.size > MAX_PDF_FILE_BYTES) {
        parsed.push({
          id: `pdf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: uniqueName,
          originalFileName: file.name,
          fileSize: file.size,
          bytes: new Uint8Array(0),
          pageCount: null,
          isValid: false,
          integrity: {
            isEncrypted: false,
            hasDigitalSignature: false,
            hasInteractiveForms: false,
            hasAnnotations: false,
            hasJavaScriptOrActions: false,
            errorCode: 'MEMORY_LIMIT',
          },
          error: `File exceeds 100 MB per-PDF safety limit.`,
        });
        continue;
      }

      const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
      let bytes: Uint8Array;
      let targetName = uniqueName;

      if (isExcel) {
        const pyApi = (window as unknown as { pywebview?: { api?: { convertExcelToPdf?: (b64: string, name: string) => Promise<string> } } }).pywebview?.api;
        if (pyApi?.convertExcelToPdf) {
          try {
            const b64 = await fileToBase64(file);
            const convertedB64 = await pyApi.convertExcelToPdf(b64, file.name);
            bytes = base64ToUint8Array(convertedB64);
            targetName = uniqueName.replace(/\.xlsx?$/i, '.pdf');
          } catch (e) {
            setUploadWarning(`Ошибка конвертации Excel в PDF: ${e instanceof Error ? e.message : String(e)}`);
            continue;
          }
        } else {
          setUploadWarning(`Файлы Excel (.xlsx) автоматически конвертируются в приложении Windows. Для работы в браузере сохраните файл в Excel через 'Файл ➔ Экспорт в PDF'.`);
          continue;
        }
      } else {
        const buffer = await file.arrayBuffer();
        bytes = new Uint8Array(buffer);
      }

      const inspection = await inspectPdfIntegrity(bytes);

      parsed.push({
        id: `pdf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: targetName,
        originalFileName: file.name,
        fileSize: file.size,
        bytes,
        pageCount: inspection.pageCount,
        isValid: inspection.isValid,
        integrity: inspection.integrity,
        error: inspection.error,
      });
    }

    if (parsed.length > 0) {
      onAddFiles(parsed);
    }
  };

  const formatBytes = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <section aria-labelledby="upload-heading">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h2 id="upload-heading" className="text-sm font-bold text-[var(--color-text-primary)]">
              {t.upload.pdfSectionTitle}
            </h2>
            {files.length > 0 && (
              <Badge variant="neutral">{files.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearFiles}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {t.upload.clearPdfsBtn}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          <FileUploader
            accept=".pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            multiple
            label={t.upload.dropzoneLabel}
            buttonLabel={t.upload.selectPdfBtn}
            error={uploadWarning}
            onFilesSelected={(fl) => void processFileList(fl)}
          />

          {files.length > 0 && (
            <Table>
              <TableCaption>{t.upload.pdfSectionTitle}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.upload.fileName}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t.upload.fileSize}</TableHead>
                  <TableHead>{t.upload.pageCount}</TableHead>
                  <TableHead>{t.upload.integrity}</TableHead>
                  <TableHead className="text-right">{t.upload.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden="true" />
                        <span className="max-w-[115px] truncate sm:max-w-[320px]">{file.fileName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-[var(--color-text-secondary)] tabular-nums whitespace-nowrap sm:table-cell">
                      {formatBytes(file.fileSize)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--color-text-primary)] tabular-nums">
                      {file.pageCount ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {file.isValid ? (
                          <Badge variant="success">
                            <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            {t.upload.validPdf}
                          </Badge>
                        ) : file.integrity.isEncrypted ? (
                          <Badge variant="danger">
                            <Lock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            {t.upload.encryptedPdf}
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <FileWarning className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            {t.upload.invalidPdf}
                          </Badge>
                        )}

                        {file.integrity.hasDigitalSignature && (
                          <Badge variant="warning">
                            <AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            {t.upload.cryptoSignedWarning}
                          </Badge>
                        )}

                        {(file.integrity.hasInteractiveForms || file.integrity.hasAnnotations) && (
                          <Badge variant="neutral">{t.upload.formsWarning}</Badge>
                        )}
                      </div>
                      {file.error && (
                        <p className="mt-1 text-xs text-[var(--color-danger)]">{file.error}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveFile(file.id)}
                        aria-label={`${t.upload.remove} ${file.fileName}`}
                        icon={<Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" strokeWidth={1.75} aria-hidden="true" />}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
