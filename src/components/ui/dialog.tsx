import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './button';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const handleClose = () => {
    if (ref.current) ref.current.returnValue = '';
    onOpenChange(false);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={handleClose}
      className={cn('p-0', className)}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
        <div>
          <h2 id={titleId} className="text-base font-bold text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {description}
            </p>
          )}
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Close dialog"
          icon={<X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => onOpenChange(false)}
        />
      </div>
      <div className="px-5 py-4 text-sm text-[var(--color-text-primary)]">{children}</div>
      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
};
