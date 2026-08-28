/**
 * ONE DRILL MACHINE, wherever a harmonic-fluency drill is started.
 *
 * =====================================================================
 * WHY IT IS A COMPONENT AND NOT A BLOCK ON THE MODULE HOME.
 *
 * A drill can now be started from three places — the module home, a
 * category page, and a Level-3 practice session — and every one of them
 * has to build the queue the same way, force the same session defaults
 * on an auto-start, apply the same focus protection and show the same
 * practice-ahead notice. Written once per page that offers a start
 * button, those five rules drift, and the drift is silent: a second
 * launcher that forgot focus protection would report fluency nobody
 * demonstrated, and nothing on screen would say so.
 *
 * So the pool is the only thing a caller decides. Everything about how
 * a run behaves lives here.
 * =====================================================================
 *
 * BUILDS ON MOUNT, ONCE. The queue is a snapshot of what was due when
 * the reader asked, so it must not be rebuilt when a live query behind
 * the page resolves. Mounting this component IS the request; the caller
 * unmounts it to end the run.
 *
 * THE EMPTY DEPENDENCY ARRAY IS WHAT MAKES THAT TRUE, and it is the
 * only thing that needs to. An effect with no dependencies does not
 * re-run when a live query resolves, because nothing it depends on
 * changed. A ref guarding against a second run was guarding against
 * something that could not happen — and it broke the one case that
 * can. See the effect.
 */
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import DailyGoalBar from '../../components/DailyGoalBar';
import HarmonicFluencySession, { type SessionStats } from './HarmonicFluencySession';
import { buildSession, practiceAheadNotice } from './sessionQueue';
import { useFluencyPrefs } from './useFluencyPrefs';
import { CATEGORY_ORDER, type FlashcardCategory } from './catalog';

export const MODULE_ID = 'harmonic-fluency';
export const SESSION_TARGET = 20;

/**
 * A queue this small in a pool the reader narrowed themselves means the
 * next card is guessable from the last one, so correct answers must not
 * push SM-2 intervals out. The whole deck can never be this small.
 */
const FOCUS_PROTECT_BELOW = 4;

export default function FluencyDrill({
  categories,
  flaggedOnly = false,
  autoStarted = false,
  onExit,
  onCaughtUp,
}: {
  /** The pool. EMPTY MEANS THE WHOLE DECK — the same reading
   *  `buildSession` gives it, so no caller has to translate. */
  categories: FlashcardCategory[];
  flaggedOnly?: boolean;
  /** A Level-3 practice session started this. Forces session defaults
   *  (timer off, no focus protection) for this run only, leaving the
   *  reader's saved prefs alone. */
  autoStarted?: boolean;
  onExit: (stats: SessionStats) => void;
  /** Nothing at all to serve for this pool. The caller decides what to
   *  say; this component stops rendering a drill. */
  onCaughtUp: () => void;
}) {
  const totalAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).count(),
    [],
  ) ?? 0;
  const prefs = useFluencyPrefs(totalAttempts);

  const [queue, setQueue] = useState<Awaited<ReturnType<typeof buildSession>> | null>(null);
  // Latest callbacks, so building once does not mean calling a stale
  // `onCaughtUp` from the render that started the build.
  const caughtUpRef = useRef(onCaughtUp);
  caughtUpRef.current = onCaughtUp;

  // THE CLEANUP FLAG IS THE WHOLE GUARD, which is the shape React
  // documents for fetching in an effect: start the work, and let the
  // cleanup mark the result unwanted.
  //
  // IT USED TO CARRY A SECOND GUARD AND THE PAIR DEADLOCKED. A
  // `built` ref returned early on any run after the first, so under
  // StrictMode — which mounts, cleans up and mounts again on the same
  // fiber, refs surviving — the first pass started the build, the
  // cleanup set `live = false`, the second pass returned at the ref
  // and started nothing, and the first pass's result was then thrown
  // away for being stale. `queue` stayed null forever and the
  // component rendered nothing: no drill, no notice, no goal bar, no
  // error to find. Either guard alone is correct; together they
  // cancelled the only build there was.
  //
  // The ref is gone rather than the flag because the flag is the one
  // doing real work — a run whose result arrives after unmount must
  // not call setState — and because StrictMode's double invoke is
  // meant to prove that cleanup works, not to be defeated by a ref.
  useEffect(() => {
    let live = true;
    void (async () => {
      const session = await buildSession({
        categories,
        target: SESSION_TARGET,
        flaggedOnly,
      });
      if (!live) return;
      if (session.allCaughtUp) {
        caughtUpRef.current();
        return;
      }
      setQueue(session);
    })();
    return () => { live = false; };
    // Deliberately empty: see BUILDS ON MOUNT, ONCE above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (queue === null) return null;

  const narrowed = categories.length > 0
    && categories.length < CATEGORY_ORDER.length;

  return (
    <>
      {/* WHERE YOU ARE, said once, at the top of the run it applies
          to. Not a toast: the fact holds for the whole session, and
          a message that expires after four seconds is how the old
          caught-up notice managed to be invisible to the person who
          had just tapped a card.

          THE SAME TREATMENT `FluencyProtectionNotice` USES, down to
          the ⓘ. Both are the app explaining why a drill just behaved
          in a way the reader did not ask for, which is the one thing
          a muted grey aside cannot do — it read as decoration and
          got skipped. `developing` is the token already behind the
          DEVELOPING badge and the wrong-answer segment of every
          progress bar; no new colour enters here. */}
      {queue.practiceAhead && (
        <div
          data-testid="hf-practice-ahead"
          className="rounded-lg border border-developing/40 bg-developing/5 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200"
        >
          <span aria-hidden className="mr-1.5">ⓘ</span>
          {practiceAheadNotice(queue.dueElsewhere ?? 0)}
        </div>
      )}
      <DailyGoalBar moduleId={MODULE_ID} />
      <HarmonicFluencySession
        queue={queue.cards}
        displayMode={prefs.displayMode}
        // Auto-started sessions force timer off (session default)
        // without overwriting the reader's saved timer pref.
        timerMode={autoStarted ? 'off' : prefs.timerMode}
        onExit={onExit}
        onDisplayModeChange={prefs.setDisplayMode}
        focusProtected={
          // The pool this run was BUILT from, never a filter the page
          // is holding — and NARROWED measured against the whole deck
          // rather than against zero. A module home lights every
          // category rather than passing an empty list, so "the reader
          // picked some" cannot be `length > 0` any more. Auto-started
          // runs take the whole deck and never focus-protect.
          !autoStarted
          && (flaggedOnly || narrowed)
          && queue.cards.length < FOCUS_PROTECT_BELOW
        }
      />
    </>
  );
}
