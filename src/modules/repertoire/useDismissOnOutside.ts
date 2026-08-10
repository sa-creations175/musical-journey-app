import { useEffect } from 'react';

/**
 * Dismiss when the user taps outside, or presses Escape.
 *
 * Extracted so the lead sheet has ONE dismiss mechanism rather than a
 * copy per dismissible thing. Two already want it — the arming state
 * and the lyric drawer — and the details are exactly the kind that go
 * subtly wrong in a second copy:
 *
 * · **Capture phase.** The listener runs before the tap reaches its
 *   target, so a control inside the dismissible region is not raced.
 * · **`pointerdown`, not `click`.** Dismissing on click would fire
 *   after a button inside had already run.
 * · **The keep selector is checked with `closest`,** so anything
 *   nested inside a kept region counts as inside it. This is what
 *   stopped the placement prompt's own cancel button being swallowed
 *   by the arming listener — pointerdown precedes click, so without
 *   the marker the listener dismissed on the way to the button and
 *   the button never ran.
 */
export function useDismissOnOutside(
  active: boolean,
  {
    keep,
    onDismiss,
  }: {
    /** CSS selector for the region that counts as INSIDE. A tap on it,
     *  or on anything within it, does not dismiss. */
    keep: string;
    onDismiss: () => void;
  },
): void {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest(keep)) return;
      onDismiss();
    };
    // Escape is the keyboard route to the same thing — and the only
    // route that doesn't require finding somewhere safe to tap.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, keep, onDismiss]);
}
