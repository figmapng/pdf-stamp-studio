import React, { useId } from 'react';
import { cn } from '../../lib/cn';

export interface ProgressProps {
  label?: string;
  value?: number;
  max?: number;
  showPercent?: boolean;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  label,
  value,
  max = 100,
  showPercent = true,
  className,
}) => {
  const id = useId();
  const isDeterminate = value !== undefined;
  const pct =
    isDeterminate && max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || (isDeterminate && showPercent)) && (
        <div className="flex items-center justify-between text-xs font-medium text-[var(--color-text-secondary)]">
          {label ? <label htmlFor={id}>{label}</label> : <span />}
          {isDeterminate && showPercent && <span className="tabular-nums">{pct}%</span>}
        </div>
      )}
      <progress
        id={id}
        className="studio-progress"
        max={Math.max(1, max)}
        value={isDeterminate ? value : undefined}
        aria-label={label ? undefined : 'Progress'}
      />
    </div>
  );
};
