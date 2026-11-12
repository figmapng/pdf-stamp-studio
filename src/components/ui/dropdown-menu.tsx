import React from 'react';
import { DropdownMenu as DropdownPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
> = ({ className, sideOffset = 6, ...props }) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      sideOffset={sideOffset}
      className={cn(
        'z-[var(--z-dropdown)] min-w-44 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1 shadow-[var(--shadow-md)]',
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
);

export const DropdownMenuItem: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>
> = ({ className, ...props }) => (
  <DropdownPrimitive.Item
    className={cn(
      'flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] outline-none data-[highlighted]:bg-[var(--color-bg-subtle)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
);

export const DropdownMenuSeparator: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
> = ({ className, ...props }) => (
  <DropdownPrimitive.Separator
    className={cn('my-1 h-px bg-[var(--color-border-subtle)]', className)}
    {...props}
  />
);
