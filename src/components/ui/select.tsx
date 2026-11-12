import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  selectSize?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, hasError = false, selectSize = 'md', children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          aria-invalid={hasError || undefined}
          className={cn(
            'w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--color-bg-surface)] pr-8 text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:opacity-60',
            selectSize === 'sm' ? 'min-h-9 px-2.5 text-xs font-medium' : 'min-h-10 px-3 text-sm font-medium',
            hasError
              ? 'border-[var(--color-danger)]'
              : 'border-[var(--color-border-default)] hover:border-slate-400',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
    );
  },
);
Select.displayName = 'Select';
