import React from 'react';
import { cn } from '../../lib/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rect' | 'text' | 'circle';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rect',
  ...props
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-[var(--color-bg-muted)] motion-reduce:animate-none',
        variant === 'circle'
          ? 'rounded-[var(--radius-full)]'
          : variant === 'text'
            ? 'h-3.5 rounded-[var(--radius-sm)]'
            : 'rounded-[var(--radius-md)]',
        className,
      )}
      {...props}
    />
  );
};
