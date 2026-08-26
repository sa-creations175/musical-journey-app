/**
 * End a drill when the reader asks for the module home.
 *
 * =====================================================================
 * WHY A MODULE NAME IN THE NAV DID NOTHING MID-DRILL.
 *
 * Ear training's drills are routes, so pressing "ear training" leaves
 * whichever one is open by unmounting it. Harmonic fluency's and
 * reading's are COMPONENT STATE on the module home, so pressing the
 * module name navigated to the URL already on screen and the running
 * drill sat there through it. The reader pressed the way out and
 * stayed where they were.
 *
 * A route change cannot be the signal here, because there is no route
 * change to observe — react-router even turns a link to the current URL
 * into a replace. So the nav says what it means: a module link carries
 * `state.moduleHome`, and a module home that is showing something else
 * stops showing it.
 *
 * THE MARKER MATTERS MORE THAN IT LOOKS. A page's own navigations —
 * stripping a consumed `?session=1`, say — change the location too, and
 * a hook that fired on any change would end the drill it had just
 * started. Only the nav sets this flag, so only the nav ends a run.
 * =====================================================================
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** What a nav module link puts in `location.state`. */
export const MODULE_HOME_STATE = { moduleHome: true } as const;

export function useEndOnModuleHome(end: () => void): void {
  const location = useLocation();
  const endRef = useRef(end);
  endRef.current = end;

  const asked = (location.state as { moduleHome?: boolean } | null)?.moduleHome === true;

  useEffect(() => {
    if (!asked) return;
    endRef.current();
    // Keyed on the location as well as the flag: pressing the same nav
    // item twice is two arrivals, and the second one has to land too.
  }, [asked, location.key]);
}
