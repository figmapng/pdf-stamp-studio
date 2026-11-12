import React from 'react';
import { FileQuestion } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-10 text-center shadow-[var(--shadow-xs)]',
        className,
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">
        {icon ?? <FileQuestion className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />}
      </div>
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs text-[var(--color-text-secondary)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
