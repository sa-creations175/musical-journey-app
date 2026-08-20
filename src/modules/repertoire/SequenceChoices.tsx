/**
 * The choices row that opens when a gap or a token in a progression
 * strip is tapped in edit mode.
 *
 * EXTRACTED so the per-section strip and the Progressions drawer share
 * one implementation. They write to the same stored `sequenceView`, so
 * offering "new row" in one and not the other — or wording the hide
 * differently — would make one set of data look like two features.
 *
 * Purely presentational: every action is a callback, and it holds no
 * state of its own.
 *
 * SIZES TO ITS CONTENT and positions nothing. It used to carry
 * `basis-full`, which reads as "own line, full width" only inside a
 * wrapping ROW — and both callers rendered it inside a `flex-col`,
 * where flex-basis is the vertical axis and the class meant nothing.
 * Placement is the anchor's job now; a class whose meaning depends on
 * a parent this component cannot see is how it ended up appended at
 * the foot of the section, a scroll away from the break it described.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SequenceTarget {
  kind: 'gap' | 'token';
  placementId: string;
}

/** What already sits at this gap, so the row can offer a CONVERSION
 *  rather than restating both kinds as if nothing were there. */
export type ExistingBreakKind = 'separator' | 'row' | null;

export default function SequenceChoices({
  target,
  label,
  hasBreak,
  existingKind = null,
  hidden,
  onSetBreak,
  onRemoveBreak,
  onToggleHidden,
  onClose,
}: {
  target: SequenceTarget;
  label: string;
  hasBreak: boolean;
  /** The kind already at this gap, when there is one. */
  existingKind?: ExistingBreakKind;
  hidden: boolean;
  onSetBreak: (afterPlacementId: string, kind: 'separator' | 'row') => void;
  onRemoveBreak: (afterPlacementId: string) => void;
  onToggleHidden: (placementId: string) => void;
  onClose: () => void;
}) {
  const chip =
    'px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10';
  const current =
    'px-2 py-0.5 rounded-full border border-fluent bg-fluent/10 text-fluent';
  const plain =
    'px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent';
  return (
    <div className="w-max max-w-[min(90vw,26rem)] flex flex-wrap items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 text-[11px] shadow-lg">
      <span className="text-neutral-500">
        {target.kind === 'gap' ? `after ${label}` : label}
      </span>
      {target.kind === 'gap' ? (
        <>
          {/* CONVERSION IS THE COMMON CASE once a break exists — most
              often "this shouldn't have been a line break" — so the
              chip names the change rather than restating both kinds as
              though the gap were empty. The kind already in place is
              shown as current instead of being offered again, which
              would be a no-op wearing an action's clothes.

              Converting keeps the note: setBreak overrides `kind` on
              the existing break and nothing else. */}
          {existingKind === 'separator' ? (
            <span className={current}>separator</span>
          ) : (
            <button
              type="button"
              className={chip}
              onClick={() => onSetBreak(target.placementId, 'separator')}
              title={
                existingKind === 'row'
                  ? 'keeps the phrase on one line; the note stays'
                  : 'divides the phrase without starting a new line'
              }
            >
              {existingKind === 'row' ? 'make it a separator' : 'separator'}
            </button>
          )}
          {existingKind === 'row' ? (
            <span className={current}>new row</span>
          ) : (
            <button
              type="button"
              className={chip}
              onClick={() => onSetBreak(target.placementId, 'row')}
              title={
                existingKind === 'separator'
                  ? 'starts a new line here; the note stays'
                  : 'starts a new line here'
              }
            >
              {existingKind === 'separator' ? 'make it a new row' : 'new row'}
            </button>
          )}
          {hasBreak && (
            <button
              type="button"
              className={plain}
              onClick={() => onRemoveBreak(target.placementId)}
              title="the two phrases merge and their notes combine"
            >
              remove break
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          className={plain}
          onClick={() => onToggleHidden(target.placementId)}
          title="hides it from the progression view only — the chord stays in the grid"
        >
          {hidden ? 'show in progression' : 'hide from progression'}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        aria-label="close"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Renders a trigger with its choices row attached DIRECTLY TO IT.
 *
 * The row used to be a single per-section element after the phrase
 * list, so tapping a break in the first line opened a menu at the foot
 * of the section — measured, painted, correct, and below the fold. It
 * has to appear where the finger already is.
 *
 * ABSOLUTE, not an inline row. An inline full-width row would be
 * adjacent, but inserting one mid-list reflows every chord below it on
 * open — the same layout-shove that `basis-full` on the note field
 * exists to avoid. Overlaying costs nothing beneath it.
 *
 * `scrollIntoView({ block: 'nearest' })` on open because both surfaces
 * live inside an `overflow-y-auto` box: a popover opening near the
 * bottom edge would otherwise be clipped, which is the bug again in
 * miniature. `nearest` scrolls only when it actually has to, so a
 * menu already fully visible does not move the view under the user.
 *
 * The horizontal nudge exists for the same reason in the other axis.
 * Left-aligning to the trigger clips the row whenever the trigger sits
 * near the right edge — and the drawer is `overflow-hidden`, so the
 * clipped half is simply gone rather than reachable by scrolling.
 * Neither axis can be fixed in CSS alone, because both depend on where
 * the trigger happens to have landed.
 */
export function ChoicesAnchor({
  open,
  children,
  ...choices
}: {
  open: boolean;
  children: ReactNode;
} & Parameters<typeof SequenceChoices>[0]) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shiftX, setShiftX] = useState(0);

  useEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }
    const el = ref.current;
    if (!el) return;
    // jsdom implements neither scrollIntoView nor layout. Guarded so
    // the placement tests can run against the real component rather
    // than a stub of it.
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }

    // Measure UNSHIFTED, then correct — so re-opening at a different
    // trigger cannot inherit the previous one's offset.
    const rect = el.getBoundingClientRect();
    // jsdom has no layout: every rect is zero, and a zero-width row
    // would "overflow" any bound. Skip rather than invent a shift.
    if (rect.width === 0) return;
    const bounds = clipBounds(el);
    const overflowRight = rect.right - (bounds.right - EDGE_GAP);
    const overflowLeft = bounds.left + EDGE_GAP - rect.left;
    if (overflowRight > 0) setShiftX(-Math.min(overflowRight, rect.left - bounds.left - EDGE_GAP));
    else if (overflowLeft > 0) setShiftX(overflowLeft);
  }, [open]);

  return (
    <span className="relative inline-flex">
      {children}
      {open && (
        <span
          ref={ref}
          data-sequence-choices=""
          style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
          /* z-50 stacks inside the drawer's own context, above the
             chords, without competing with the cell-anchored overlays
             at 180/190. */
          className="absolute left-0 top-full z-50 mt-1"
        >
          <SequenceChoices {...choices} />
        </span>
      )}
    </span>
  );
}

const EDGE_GAP = 8;

/**
 * The box that would clip this popover: the nearest ancestor that hides
 * its overflow, or the viewport when nothing does.
 *
 * Walked rather than assumed because the two callers sit in different
 * containers — the drawer clips at its own rounded border, the
 * per-section strip at the page.
 */
function clipBounds(el: Element): { left: number; right: number } {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowX } = getComputedStyle(p);
    if (overflowX !== 'visible') {
      const r = p.getBoundingClientRect();
      if (r.width > 0) return { left: r.left, right: r.right };
    }
  }
  return { left: 0, right: window.innerWidth };
}
