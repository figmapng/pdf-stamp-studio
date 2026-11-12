import React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent: React.FC<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
> = ({ className, align = 'center', sideOffset = 6, ...props }) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-[var(--z-dropdown)] w-72 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 text-xs text-[var(--color-text-primary)] shadow-[var(--shadow-md)] outline-none',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);
