import React, { useId, useRef, useState } from 'react';
import { AlertTriangle, UploadCloud } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FileUploaderProps {
  accept: string;
  multiple?: boolean;
  label: string;
  hint?: string;
  buttonLabel: string;
  error?: string | null;
  disabled?: boolean;
  onFilesSelected: (files: FileList) => void;
  className?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  accept,
  multiple = false,
  label,
  hint,
  buttonLabel,
  error,
  disabled = false,
  onFilesSelected,
  className,
}) => {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed px-4 py-5 text-center transition-colors duration-[var(--duration-fast)]',
          isDragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
            : 'border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)]',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <UploadCloud
          className="mb-2 h-7 w-7 text-[var(--color-primary)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
        <span className="mt-3 inline-flex min-h-8 items-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)] shadow-[var(--shadow-xs)]">
          {buttonLabel}
        </span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
          }
          e.target.value = '';
        }}
        className="visually-hidden"
      />

      {error && (
        <div
          id={errorId}
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-rose-200 bg-[var(--color-danger-subtle)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
