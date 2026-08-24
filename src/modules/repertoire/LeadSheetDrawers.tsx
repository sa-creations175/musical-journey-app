import { useEffect, useRef, useState, type ReactNode } from 'react';
import { measureSafeArea } from './leadSheetOverlay';

/** Breathing room between the stack and whatever it docks above, so
 *  the inset edges read as floating rather than as a seam. */
const DRAWER_GAP = 8;

/** Gap between the collapsed stack and the last thing the page
 *  scrolls to, so a grid row does not stop flush against a drawer. */
const CONTENT_GAP = 12;

/**
 * CSS custom property the page reads to reserve room beneath itself.
 * Set on the document element rather than passed down as a prop
 * because the thing that needs the number — the page's outermost
 * element — is an ancestor of the thing that knows it.
 */
export const RESERVE_VAR = '--lead-sheet-drawers-reserve';

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

  /* -----------------------------------------------------------------
     THE PAGE HAS TO KNOW HOW MUCH OF ITSELF IS COVERED.

     This box is `fixed`, so it is out of flow and the page beneath it
     ends wherever its own content ends — underneath these drawers. On
     the song page that meant the last rows of the matrix could not be
     scrolled clear of them. `pb-24 md:pb-10` on the app shell was
     never enough on desktop and was a guess on mobile.

     WHAT IS RESERVED IS THE COLLAPSED HEIGHT, NOT THE CURRENT ONE. An
     open drawer is up to 50vh, and padding the page by half a screen
     because a panel happens to be open is worse than the problem. The
     headers are what is permanently in the way, so the headers are
     what gets measured — found by `[aria-expanded]`, which every
     drawer header carries because it is a disclosure button. A drawer
     that arrived without one would contribute nothing and the
     reservation would be short, which is why the test asserts the
     count as well as the number.
     ----------------------------------------------------------------- */
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const apply = () => {
      const headers = el.querySelectorAll<HTMLElement>('[aria-expanded]');
      if (headers.length === 0) return;
      // MEASURED BY ROW, not by drawer count. The stack is one column
      // on a phone and one row from `sm` up, and the reservation is
      // about height: two drawers in a row cost ONE header, two
      // stacked cost two. Read off geometry rather than off the
      // breakpoint, so the JS never has to agree with a class list
      // about where the layout changes — which is the kind of pair
      // that goes out of step the moment either is edited.
      const tallestPerRow = new Map<number, number>();
      for (const h of headers) {
        const top = Math.round(h.getBoundingClientRect().top);
        tallestPerRow.set(top, Math.max(tallestPerRow.get(top) ?? 0, h.offsetHeight));
      }
      let total = 0;
      for (const height of tallestPerRow.values()) total += height;
      // The flex `gap-2` between ROWS, once per gap.
      total += (tallestPerRow.size - 1) * DRAWER_GAP;
      const reserve = total + dockOffset + DRAWER_GAP + CONTENT_GAP;
      document.documentElement.style.setProperty(RESERVE_VAR, `${reserve}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(apply)
      : null;
    ro?.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      // Every other page in the app mounts no drawers. Leaving the
      // property behind would pad them for chrome that is not there.
      document.documentElement.style.removeProperty(RESERVE_VAR);
    };
  }, [dockOffset]);

  return (
    <div
      ref={boxRef}
      /* Bottom chrome, so the cell-anchored overlays inset past the
         whole stack rather than past whichever drawer happens to be
         tallest. */
      data-app-chrome="bottom"
      data-lead-sheet-drawers=""
      style={{ bottom: dockOffset + DRAWER_GAP }}
      /* z-40: above the grid, below the cell-anchored overlays at
         180/190, so an open drawer never covers the placement prompt. */
      className={[
        'fixed inset-x-3 z-40 flex flex-col gap-2',
        /* -------------------------------------------------------------
           SIDE BY SIDE, BOTTOM RIGHT, FROM `sm` UP.

           Two full-width bars spanning every page was more room than
           two occasional drawers earn. Stacking them narrow fixed the
           width and kept the cost: two bars of vertical space is what
           was eating the bottom of the matrix, and vertical is the
           axis that matters — the reservation below is a function of
           HEIGHT. One row halves it.

           Right rather than left because the desktop sidebar is on the
           left, so a bottom-left stack reads as part of the nav; and
           because the matrix scrolls horizontally with its key names
           in the first column, so keeping that side clear means you
           can still tell which key a row is while a drawer is open.

           Below `sm` they stay stacked and full width. A 320px bar on
           a 375px phone is nearly full width anyway, so capping buys
           nothing and only risks cramping the header text.
           ------------------------------------------------------------- */
        'sm:left-auto sm:right-3 sm:w-auto sm:flex-row sm:items-end sm:justify-end',
        /* Collapsed each drawer is a tab; open it is a panel. `:has`
           lets the container own BOTH the layout and the sizing, which
           is the arrangement this file exists to protect — the
           two-drawer bug was two components holding beliefs about each
           other. Neither drawer knows it has a neighbour.

           512px rather than the 672px proposed for a stack: in a row
           the open panel shares the width with its collapsed sibling,
           and 672 + 320 + the gap runs past a laptop column. The
           viewport cap is the backstop for a narrow window. */
        'sm:[&>*]:w-80 sm:[&>*]:max-w-[calc(100vw-1.5rem)]',
        'sm:[&>*:has([aria-expanded="true"])]:w-[32rem]',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
