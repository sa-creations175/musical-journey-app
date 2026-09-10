/**
 * One titled, collapsible section of the Settings page.
 *
 * =====================================================================
 * EIGHT SECTIONS, ALL CLOSED, AND THE TITLE IS THE BIGGEST THING IN IT.
 *
 * The page was a single scroll of fourteen unlabelled `h4` blocks in
 * lowercase, each the same size as the words inside it, in the order
 * they happened to be built. Finding the export button meant reading
 * everything above it. Silas's walked prototype of 10 Sep 2026 gives it
 * eight named sections in a ruled order, every one closed on arrival.
 *
 * A SMALL KICKER OVER A LARGE TITLE. The number tells you where you are
 * in the eight; the title tells you what it is. The kicker is
 * deliberately the smaller of the two — a reader looking for their data
 * is looking for the word "Data", not for "Section 7".
 *
 * =====================================================================
 * WHICH SECTION IS OPEN IS A FOLD, NOT A PREFERENCE ABOUT MUSIC.
 *
 * So it lives in `localStorage` and is per device, exactly like the
 * shared player's settings fold — see `readSettingsOpen` there, whose
 * docblock draws this line. A browser that refuses to store it simply
 * opens the page closed every time, which is the default anyway.
 *
 * ONE OPEN AT A TIME. The prototype's chip row jumps to a section and
 * opens it; a page that accumulated open sections as you browsed would
 * be the scroll this replaced.
 * =====================================================================
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { SettingsSectionId } from './settingsSections';

interface Props {
  id: SettingsSectionId;
  /** 1-based, from `SETTINGS_SECTIONS`. */
  number: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function SettingsSection({
  id, number, title, open, onToggle, children,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  // A CHIP SCROLLS THE SECTION IT OPENED INTO VIEW. Opening a section
  // eight down the page without moving to it is a tap that appears to
  // do nothing. Skipped on the first paint so a remembered section does
  // not yank a freshly-opened panel.
  const painted = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (!painted.current) { painted.current = true; return; }
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [open]);

  return (
    <section
      ref={ref}
      id={`settings-${id}`}
      data-testid={`settings-section-${id}`}
      data-open={open}
      className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3"
    >
      <h3 className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`settings-body-${id}`}
          data-testid={`settings-toggle-${id}`}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">
              Section {number}
            </span>
            <span className="block text-lg font-bold tracking-tight">
              {title}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-neutral-500">
            {open ? '▾' : '▸'}
          </span>
        </button>
      </h3>
      {open && (
        <div id={`settings-body-${id}`} className="pt-3 space-y-5">
          {children}
        </div>
      )}
    </section>
  );
}
