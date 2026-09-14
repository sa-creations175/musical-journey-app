import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The diary's sheet from the bottom. One shell, two forms.
 *
 *   dimmed  the chord naming reference and the qualities chart: full
 *           height, the page dimmed and held still behind it. Closes on
 *           ×, Escape, or a tap on the dimmed strip above it.
 *
 *   live    the player panel (Silas's spec of 12 Sep 2026, §1): no dim,
 *           at most 60% of the screen, and the page stays live under it
 *           — it scrolls, and ▶ on another card switches the panel.
 *           Closes on ×, Escape, or a tap anywhere on the page outside
 *           it. A tap inside never closes it.
 *
 * Portalled into `document.body` so it clears the diary's own stacking
 * context (`.diary-root` isolates), which is also why it carries
 * `.diary-palette`: the tokens would otherwise stay behind on the page.
 */
export default function DiarySheet({
  title,
  subtitle,
  live = false,
  onClose,
  children,
}: {
  title: string;
  /** The line under the title — the player's origin line. */
  subtitle?: string;
  /** The page-stays-live form. */
  live?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Latest onClose without re-running the mount effect, which would
  // re-lock scroll and pull focus back to the panel on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    if (live) {
      // A TAP INSIDE NEVER CLOSES IT, even when the row under the finger
      // redraws. The event's path is fixed when it is dispatched, so a
      // chip that is replaced mid-tap still counts as inside.
      //
      // A CARD'S ▶ IS NOT "OUTSIDE". It switches the panel to its card,
      // so it is left to do that.
      const onTap = (e: MouseEvent) => {
        const panel = panelRef.current;
        if (panel === null || e.composedPath().includes(panel)) return;
        if (e.target instanceof Element && e.target.closest('[data-diary-hear]') !== null) return;
        onCloseRef.current();
      };
      document.addEventListener('click', onTap);
      return () => {
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('click', onTap);
      };
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [live]);

  const close = (
    <button
      type="button"
      onClick={onClose}
      aria-label="close"
      className="shrink-0 text-2xl leading-none -mt-0.5"
      style={{ color: 'var(--diary-text-muted)' }}
    >
      ×
    </button>
  );

  if (live) {
    return createPortal(
      <div className="diary-palette fixed inset-x-0 bottom-0 z-[100] flex justify-center pointer-events-none">
        <div
          ref={panelRef}
          role="dialog"
          aria-label={title}
          data-testid="diary-sheet-live"
          className="pointer-events-auto w-full max-w-3xl max-h-[60vh] min-w-0 flex flex-col rounded-t-2xl overflow-hidden"
          style={{
            background: '#FFFFFF',
            color: '#1A1D21',
            borderTop: '1px solid #D5DBDF',
            boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.18)',
          }}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-full" style={{ background: '#D5DBDF' }} />
          <header className="shrink-0 px-4 sm:px-6 pt-2 pb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="diary-serif text-xl font-medium leading-tight" data-testid="diary-sheet-title">
                {title}
              </h2>
              {subtitle !== undefined && subtitle !== '' && (
                <p
                  className="text-[10px] uppercase tracking-wider mt-1"
                  style={{ color: '#5E6B72' }}
                  data-testid="diary-sheet-subtitle"
                >
                  {subtitle}
                </p>
              )}
            </div>
            {close}
          </header>
          <div
            className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-4 sm:px-6"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {children}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

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
          {close}
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
