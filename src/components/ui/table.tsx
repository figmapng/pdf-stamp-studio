import React from 'react';
import { cn } from '../../lib/cn';

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  className,
  ...props
}) => (
  <div className="w-full overflow-x-auto">
    <table
      className={cn('w-full border-collapse text-left text-sm text-[var(--color-text-primary)]', className)}
      {...props}
    />
  </div>
);

export const TableCaption: React.FC<React.HTMLAttributes<HTMLTableCaptionElement>> = ({
  className,
  ...props
}) => <caption className={cn('visually-hidden', className)} {...props} />;

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  ...props
}) => (
  <thead
    className={cn(
      'bg-[var(--color-bg-subtle)] text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]',
      className,
    )}
    {...props}
  />
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  ...props
}) => <tbody className={cn('divide-y divide-[var(--color-border-subtle)]', className)} {...props} />;

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className,
  ...props
}) => (
  <tr
    className={cn('transition-colors hover:bg-[var(--color-bg-canvas)]', className)}
    {...props}
  />
);

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  scope = 'col',
  ...props
}) => <th scope={scope} className={cn('px-2 py-2.5 font-semibold whitespace-nowrap sm:px-3 sm:py-3', className)} {...props} />;

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  ...props
}) => <td className={cn('px-2 py-2 align-middle sm:px-3 sm:py-2.5', className)} {...props} />;
