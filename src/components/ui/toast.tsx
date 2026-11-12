import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './button';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => undefined,
  dismissToast: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast, dismissToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-16 right-4 z-[var(--z-toast)] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((item) => {
          const styles: Record<ToastVariant, string> = {
            info: 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]',
            success: 'border-emerald-200 bg-[var(--color-success-subtle)] text-[var(--color-success)]',
            warning: 'border-amber-200 bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
            error: 'border-rose-200 bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
          };
          const Icon =
            item.variant === 'success'
              ? CheckCircle2
              : item.variant === 'warning'
                ? AlertTriangle
                : item.variant === 'error'
                  ? AlertCircle
                  : Info;

          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-lg)] border p-3.5 shadow-[var(--shadow-md)]',
                styles[item.variant],
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-semibold">{item.title}</p>
                {item.description && <p className="mt-0.5 opacity-90">{item.description}</p>}
              </div>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Dismiss notification"
                icon={<X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />}
                onClick={() => dismissToast(item.id)}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
