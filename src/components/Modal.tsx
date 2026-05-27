import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Accessible label override if you want something different from the visible title. */
  ariaLabel?: string;
  /** Optional small pill / chip rendered to the left of the title.
   *  Used by goal modals to surface the timeframe (Weekly / Monthly /
   *  Yearly) so users know what scope they're editing without
   *  parsing the title text. */
  titleBadge?: ReactNode;
}

// Reusable modal with a portal into document.body so it escapes any
// ancestor stacking context (filter / backdrop-blur / transform, etc.).
// Locks body scroll while open, moves focus into the dialog on mount,
// closes on Escape or backdrop click. Body scrolls internally; header and
// footer stay pinned.
export default function Modal({ open, onClose, title, description, children, footer, ariaLabel, titleBadge }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Body scroll lock. Preserve whatever the page already had set.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog. Prefer an element explicitly marked
    // `data-autofocus`; otherwise focus the panel itself so keyboard
    // users land inside and subsequent Tab traverses the content.
    const root = panelRef.current;
    if (root) {
      const marked = root.querySelector<HTMLElement>('[data-autofocus]');
      if (marked) marked.focus();
      else root.focus();
    }

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 rounded-2xl border border-black/[0.07] shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden focus:outline-none"
      >
        <header className="shrink-0 px-4 sm:px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titleBadge && <div className="mb-1.5">{titleBadge}</div>}
            <h3 className="text-base sm:text-lg font-medium tracking-tight truncate">{title}</h3>
            {description && <p className="text-xs sm:text-sm text-neutral-500 mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            className="shrink-0 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-2xl leading-none -mt-1"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4">
          {children}
        </div>

        {footer && (
          <footer
            className="shrink-0 px-4 sm:px-5 pt-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            // env(safe-area-inset-bottom) keeps the action row above
            // the iPhone home-indicator bar AND mobile Safari's
            // collapsible toolbar (which can overlap the bottom of the
            // viewport on first paint). +0.5rem extra buffer beyond
            // the inset so the buttons don't sit flush against the
            // chrome edge. 0.75rem floor preserves desktop spacing
            // where no inset is reported.
            style={{
              paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px) + 0.5rem)',
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
