import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-colors duration-[var(--duration-fast)] select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--color-primary)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-hover)]',
        secondary:
          'bg-[var(--color-secondary)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--color-secondary-hover)]',
        outline:
          'border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] hover:bg-[var(--color-bg-subtle)]',
        ghost:
          'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
        destructive:
          'border border-rose-200 bg-[var(--color-danger-subtle)] text-[var(--color-danger)] hover:bg-rose-100',
        destructiveSolid:
          'bg-[var(--color-danger)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--color-danger-hover)]',
        success:
          'bg-[var(--color-success)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--color-success-hover)]',
      },
      size: {
        sm: 'min-h-9 px-3 py-1.5 text-xs',
        md: 'min-h-10 px-4 py-2 text-sm',
        lg: 'min-h-11 px-5 py-2.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading = false, disabled, children, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof buttonVariants> {
  icon: React.ReactNode;
  'aria-label': string;
  isLoading?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'outline', size = 'sm', icon, isLoading = false, disabled, type = 'button', ...props }, ref) => {
    const dim =
      size === 'lg' ? 'min-h-11 min-w-11' : size === 'md' ? 'min-h-10 min-w-10' : 'min-h-9 min-w-9';
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(buttonVariants({ variant, size }), 'p-0', dim, className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          icon
        )}
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';
