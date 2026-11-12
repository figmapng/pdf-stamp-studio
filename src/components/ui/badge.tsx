import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
        primary: 'border-indigo-200 bg-[var(--color-primary-subtle)] text-[var(--color-primary)]',
        success: 'border-emerald-200 bg-[var(--color-success-subtle)] text-[var(--color-success)]',
        warning: 'border-amber-200 bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
        danger: 'border-rose-200 bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge: React.FC<BadgeProps> = ({ className, variant, ...props }) => {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
};
