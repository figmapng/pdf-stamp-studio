import React from 'react';
import { cn } from '../../lib/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError = false, rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={hasError || undefined}
        className={cn(
          'w-full rounded-[var(--radius-md)] border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:opacity-60',
          hasError
            ? 'border-[var(--color-danger)] ring-1 ring-[var(--color-danger)]'
            : 'border-[var(--color-border-default)] hover:border-slate-400',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
