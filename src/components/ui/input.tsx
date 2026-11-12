import React from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  inputSize?: 'sm' | 'md';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError = false, inputSize = 'md', type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={hasError || undefined}
        className={cn(
          'w-full rounded-[var(--radius-md)] border bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:opacity-60',
          inputSize === 'sm' ? 'min-h-9 px-2.5 py-1 text-xs' : 'min-h-11 px-3 py-2 text-sm',
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
Input.displayName = 'Input';
