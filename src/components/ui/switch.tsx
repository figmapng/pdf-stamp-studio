import React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  id,
  disabled = false,
  className,
}) => {
  const autoId = React.useId();
  const switchId = id ?? autoId;

  const toggle = (
    <SwitchPrimitive.Root
      id={switchId}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-[var(--radius-full)] border-2 border-transparent transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-[var(--color-primary)]' : 'bg-slate-300',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-[var(--radius-full)] bg-white shadow-[var(--shadow-xs)] transition-transform duration-[var(--duration-fast)]',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return toggle;

  return (
    <div className="flex items-center gap-3">
      {toggle}
      <label
        htmlFor={switchId}
        className="text-xs font-medium text-[var(--color-text-primary)] cursor-pointer select-none"
      >
        {label}
      </label>
    </div>
  );
};
