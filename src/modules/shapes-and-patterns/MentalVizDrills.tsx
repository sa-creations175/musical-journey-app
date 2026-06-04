import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { MENTAL_VIZ_ITEMS, MENTAL_VIZ_MODULE_REF } from './mentalVizLibrary';
import MentalVizChordDrill from './MentalVizChordDrill';

/**
 * Mental-visualisation activity area — the chord-library drill. Away-
 * from-keyboard recall of triads, sevenths, and extended-dominant
 * voicings, walked via SM-2 (spacingState moduleRef 'mental-viz'). One
 * "start" launches the drill; spaced repetition surfaces what needs
 * work. (Replaced the old per-variant random-generation flashcards.)
 */
export default function MentalVizDrills() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Level-3 auto-launch: GO on the mental-viz session block routes here
  // with ?session=1 — open the drill straight away. Lazy-init (not an
  // effect) so `open` is independent of the param afterward: a re-render
  // can't reopen it, and the stale param is cleared on close.
  const [open, setOpen] = useState(() => searchParams.get('session') === '1');

  const closeDrill = () => {
    setOpen(false);
    if (searchParams.get('session') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('session');
      setSearchParams(next, { replace: true });
    }
  };

  const seenCount = useLiveQuery<number>(
    () => db.spacingState.where('moduleRef').equals(MENTAL_VIZ_MODULE_REF).count(),
    [],
  ) ?? 0;
  const total = MENTAL_VIZ_ITEMS.length;

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          mental visualisation drills
        </h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          away-from-keyboard recall of the chord library — triads, sevenths, and
          extended-dominant voicings. Name the chord, picture the shape, reveal
          the keyboard, rate yourself. Practise at a desk, on a walk, or in bed.
        </p>
      </div>

      <div className="text-[11px] text-neutral-500">
        <span className="font-mono tabular-nums">{seenCount}</span>
        <span className="text-neutral-400"> / </span>
        <span className="font-mono tabular-nums">{total}</span> voicings started
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
      >
        Start drill
      </button>

      {open && <MentalVizChordDrill onClose={closeDrill} />}
    </section>
  );
}
