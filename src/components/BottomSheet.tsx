import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional header title; omit to render no header. */
  title?: ReactNode;
  /** Sheet body. */
  children: ReactNode;
  /** Pinned footer — typically a row of action buttons. */
  footer?: ReactNode;
}

/**
 * Modal sheet that slides up from the bottom on phone-class viewports.
 * Mirrors the patterns used by the central `Modal` (portal into body,
 * Escape closes, scroll-lock while open) but lays out as a bottom
 * sheet so the iOS keyboard can sit naturally beneath the content
 * area when an input inside the sheet is focused.
 *
 * Closing on backdrop tap, the × button, or Escape all route through
 * the same `onClose`. The sheet is content-sized up to `max-h-[85vh]`
 * so a long body scrolls inside instead of bleeding off-screen.
 *
 * Includes `env(safe-area-inset-bottom)` padding so the pinned
 * footer doesn't get cut off by the iOS home indicator.
 */
export default function BottomSheet({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[160] flex items-end justify-center"
    >
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-md rounded-t-xl bg-white dark:bg-neutral-900 shadow-2xl border-t border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[85vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={event => event.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-100">
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="close"
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
