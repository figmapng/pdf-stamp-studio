import React from 'react';
import { cn } from '../../lib/cn';

export interface RadioGroupProps {
  legend: string;
  name: string;
  value: string;
  onValueChange: (val: string) => void;
  className?: string;
  children: React.ReactNode;
}

const RadioGroupContext = React.createContext<{
  name: string;
  value: string;
  onValueChange: (val: string) => void;
} | null>(null);

export const RadioGroup: React.FC<RadioGroupProps> = ({
  legend,
  name,
  value,
  onValueChange,
  className,
  children,
}) => {
  return (
    <RadioGroupContext.Provider value={{ name, value, onValueChange }}>
      <fieldset
        className={cn(
          'rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3 shadow-[var(--shadow-xs)]',
          className,
        )}
      >
        <legend className="px-1 text-xs font-semibold text-[var(--color-text-secondary)]">
          {legend}
        </legend>
        <div className="mt-1.5 space-y-1">{children}</div>
      </fieldset>
    </RadioGroupContext.Provider>
  );
};

export interface RadioGroupItemProps {
  value: string;
  label: React.ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const RadioGroupItem: React.FC<RadioGroupItemProps> = ({
  value,
  label,
  id,
  disabled = false,
  className,
}) => {
  const ctx = React.useContext(RadioGroupContext);
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const checked = ctx?.value === value;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 transition-colors',
        checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
          : 'border-transparent hover:bg-[var(--color-bg-subtle)]',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <input
        id={inputId}
        type="radio"
        name={ctx?.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => ctx?.onValueChange(value)}
        className="h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)] cursor-pointer"
      />
      <label
        htmlFor={inputId}
        className="flex-1 text-xs font-medium text-[var(--color-text-primary)] cursor-pointer select-none"
      >
        {label}
      </label>
    </div>
  );
};
