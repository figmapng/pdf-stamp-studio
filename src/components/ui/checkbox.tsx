import React from 'react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, id, label, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;

    const box = (
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn(
          'h-4 w-4 shrink-0 rounded-[4px] border border-[var(--color-border-default)] accent-[var(--color-primary)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );

    if (!label) return box;

    return (
      <div className="flex items-start gap-2.5 min-h-6">
        <div className="flex h-5 items-center">{box}</div>
        <label
          htmlFor={inputId}
          className="text-xs font-medium leading-5 text-[var(--color-text-primary)] cursor-pointer select-none"
        >
          {label}
        </label>
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';
