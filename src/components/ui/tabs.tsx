import React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn';

export const Tabs = TabsPrimitive.Root;

export const TabsList: React.FC<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
> = ({ className, ...props }) => (
  <TabsPrimitive.List
    className={cn(
      'flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]',
      className,
    )}
    {...props}
  />
);

export const TabsTrigger: React.FC<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
> = ({ className, ...props }) => (
  <TabsPrimitive.Trigger
    className={cn(
      'relative flex-none min-h-10 cursor-pointer items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] data-[state=active]:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...props}
  />
);

export const TabsContent: React.FC<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
> = ({ className, ...props }) => (
  <TabsPrimitive.Content className={cn('pt-4 outline-none', className)} {...props} />
);
