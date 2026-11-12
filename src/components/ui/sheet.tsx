import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './button';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'left' | 'right';
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  open,
  onOpenChange,
  side = 'right',
  title,
  description,
  children,
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
      className={cn(
        'studio-sheet flex flex-col',
        side === 'left' && 'studio-sheet-left',
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
        <div>
          <h2 id={titleId} className="text-base font-bold text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {description}
            </p>
          )}
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Close panel"
          icon={<X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => onOpenChange(false)}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </dialog>
  );
};
