import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The diary's full-height sheet from the bottom.
 *
 * One shell for whatever the Harmonic Diary slides up over the page:
 * the chord naming reference today, the diary's player panel when it
 * is built. Closes on ×, Escape, or a tap on the dimmed strip above it.
 *
 * Portalled into `document.body` so it clears the diary's own stacking
 * context (`.diary-root` isolates), which is also why it carries
 * `.diary-palette`: the tokens would otherwise stay behind on the page.
 */
export default function DiarySheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Latest onClose without re-running the mount effect, which would
  // re-lock scroll and pull focus back to the panel on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return createPortal(
    <div
      className="diary-palette fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top, 0px))' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl h-full min-w-0 flex flex-col rounded-t-2xl shadow-xl overflow-hidden focus:outline-none"
        style={{ background: 'linear-gradient(160deg, var(--diary-bg-start) 0%, var(--diary-bg-end) 100%)' }}
      >
        <header
          className="shrink-0 px-4 sm:px-6 pt-4 pb-3 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid var(--diary-rule)' }}
        >
          <h2 className="diary-serif text-2xl sm:text-3xl font-medium tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="shrink-0 text-2xl leading-none -mt-0.5"
            style={{ color: 'var(--diary-text-muted)' }}
          >
            ×
          </button>
        </header>
        <div
          className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-4"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
