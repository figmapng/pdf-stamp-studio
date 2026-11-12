import React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn';

export const TooltipProvider: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>
> = ({ delayDuration = 250, ...props }) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
);

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
> = ({ className, sideOffset = 6, ...props }) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      sideOffset={sideOffset}
      className={cn(
        'z-[var(--z-dropdown)] max-w-xs rounded-[var(--radius-sm)] bg-[var(--color-secondary)] px-2.5 py-1.5 text-xs font-medium text-white shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
);
