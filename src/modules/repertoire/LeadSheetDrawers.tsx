import { useEffect, useState, type ReactNode } from 'react';
import { measureSafeArea } from './leadSheetOverlay';

/** Breathing room between the stack and whatever it docks above, so
 *  the inset edges read as floating rather than as a seam. */
const DRAWER_GAP = 8;

/**
 * The lead sheet's bottom drawers, stacked.
 *
 * WHY A CONTAINER RATHER THAN TWO SELF-POSITIONING DRAWERS. Each
 * drawer used to dock itself, measuring the page's bottom chrome and
 * subtracting what it should ignore. With one drawer that worked. With
 * two it did not, and the failure was total rather than subtle: both
 * excluded BOTH drawers from their own measurement, so neither could
 * see the other, both resolved the same offset, and they landed on the
 * same rectangle — the later one in the DOM painting the earlier one
 * out of existence.
 *
 * The exclusion looked reasonable because the drawers are mutually
 * exclusive. But that governs which one is OPEN; both are always
 * MOUNTED, because either has to be tappable at any moment. Two
 * always-present pieces of bottom chrome have to stack.
 *
 * So the arrangement where two components must hold consistent beliefs
 * about each other is gone. There is ONE fixed box, it measures the
 * chrome below it once, and normal flow stacks its children. A third
 * drawer would need no measurement logic at all.
 *
 * ORDER IS BOTTOM-ANCHORED. Children render top to bottom; the last
 * one sits against the docking edge. Lyrics is last so it keeps the
 * exact position it has always had. A consequence worth naming: this
 * box grows upward, so opening the BOTTOM drawer pushes the one above
 * it up by the open panel's height, while opening the top drawer
 * leaves the bottom one where it is. Both headers stay adjacent
 * whenever both are collapsed, which is the common case.
 */
export default function LeadSheetDrawers({
  children,
}: {
  children: ReactNode;
}) {
  const [dockOffset, setDockOffset] = useState(0);
  useEffect(() => {
    const measure = () =>
      setDockOffset(
        // Excludes ONLY itself. There is nothing else to exclude now —
        // the drawers inside are not bottom chrome in their own right,
        // this box is.
        measureSafeArea({ exclude: '[data-lead-sheet-drawers]' }).bottom,
      );
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  return (
    <div
      /* Bottom chrome, so the cell-anchored overlays inset past the
         whole stack rather than past whichever drawer happens to be
         tallest. */
      data-app-chrome="bottom"
      data-lead-sheet-drawers=""
      style={{ bottom: dockOffset + DRAWER_GAP }}
      /* z-40: above the grid, below the cell-anchored overlays at
         180/190, so an open drawer never covers the placement prompt. */
      className="fixed inset-x-3 z-40 flex flex-col gap-2"
    >
      {children}
    </div>
  );
}
