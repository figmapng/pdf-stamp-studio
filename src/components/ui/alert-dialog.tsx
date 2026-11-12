import React, { useEffect, useId, useRef } from 'react';
import { Button } from './button';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
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
    const dlg = ref.current;
    if (!dlg) return;
    const val = dlg.returnValue;
    dlg.returnValue = '';
    onOpenChange(false);
    if (val === 'confirm') {
      onConfirm();
    }
  };

  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-describedby={descId} onClose={handleClose}>
      <div className="space-y-4 p-6">
        <h2 id={titleId} className="text-base font-bold text-[var(--color-text-primary)]">
          {title}
        </h2>
        <p id={descId} className="text-sm text-[var(--color-text-secondary)]">
          {description}
        </p>
        <form method="dialog" className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="submit" value="cancel" variant="outline" size="md" autoFocus>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            value="confirm"
            variant={destructive ? 'destructiveSolid' : 'primary'}
            size="md"
          >
            {confirmLabel}
          </Button>
        </form>
      </div>
    </dialog>
  );
};
