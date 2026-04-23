import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Lightweight toast system — meant for quick confirmations, undoable
// deletes, and "saved" feedback. Mount <Toaster /> once at the app
// root; anywhere beneath that, call `useToast()` to push messages.
//
// Toasts with an `action` (typically "Undo") default to 10s lifetime;
// plain confirmations default to 3s. Either can be dismissed with ×.

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  message: string;
  /** Action button rendered inside the toast (e.g. Undo). */
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Defaults: 3000 plain / 10000 when action present. */
  duration?: number;
  /** Style variant — affects the left border accent color. */
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

interface ToastRecord extends ToastInput {
  id: string;
  createdAt: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Degrade gracefully outside a Toaster — log to console instead of
    // crashing in the rare case a component is mounted in isolation.
    return {
      toast: (input) => { console.info('[toast]', input.message); return ''; },
      dismiss: () => {},
    };
  }
  return ctx;
}

function uid(): string {
  return `t-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback((input: ToastInput): string => {
    const id = uid();
    const duration = input.duration ?? (input.action ? 10000 : 3000);
    const record: ToastRecord = { ...input, id, createdAt: Date.now() };
    setToasts(t => [...t, record]);
    const handle = window.setTimeout(() => dismiss(id), duration);
    timers.current.set(id, handle);
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    // Clean up any outstanding timers on unmount.
    timers.current.forEach(h => window.clearTimeout(h));
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: ToastRecord[];
  dismiss: (id: string) => void;
}) {
  // SSR guard — no document on first server-side render.
  if (typeof document === 'undefined') return null;
  if (toasts.length === 0) return null;
  return createPortal(
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none px-3 w-full max-w-md"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const accent: Record<NonNullable<ToastInput['variant']>, string> = {
    default: 'border-l-fluent',
    success: 'border-l-fluent',
    warning: 'border-l-developing',
    danger: 'border-l-needswork',
  };
  return (
    <div
      role="status"
      className={`pointer-events-auto w-full rounded-lg border border-neutral-200 dark:border-neutral-800 ${accent[toast.variant ?? 'default']} border-l-4 bg-white dark:bg-neutral-900 shadow-md px-3 py-2.5 flex items-center gap-2 text-sm animate-in fade-in slide-in-from-bottom-2 duration-200`}
    >
      <span className="flex-1 text-neutral-700 dark:text-neutral-200 truncate" title={toast.message}>
        {toast.message}
      </span>
      {toast.action && (
        <button
          onClick={() => { toast.action?.onClick(); onDismiss(); }}
          className="px-2.5 py-0.5 rounded-md text-xs font-medium text-fluent border border-fluent hover:bg-fluent/10 shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="dismiss"
        className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 shrink-0"
      >
        ×
      </button>
    </div>
  );
}
