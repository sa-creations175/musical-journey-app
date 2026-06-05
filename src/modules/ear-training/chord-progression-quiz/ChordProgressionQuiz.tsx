// Chord Progression Quiz — module home. A non-keyboard recall drill over
// the user's repertoire: name each section's progression, reveal numbers
// + letters + the bar grid, self-rate. One "start" launches the drill;
// SM-2 (moduleRef 'chord-progression-quiz') surfaces what needs work.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { CHORD_PROGRESSION_QUIZ_MODULE_REF } from './progressionQuiz';
import ChordProgressionQuizDrill from './ChordProgressionQuizDrill';

export default function ChordProgressionQuiz() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Level-3 auto-launch: GO on a session block routes here with
  // ?session=1 (and ?songId=X from a chord-quiz warm-up, scoping the
  // drill to that song). Lazy-init (not an effect) so `open` / `songId`
  // are captured once and independent of the params afterward; the stale
  // params are cleared on close.
  const [open, setOpen] = useState(() => searchParams.get('session') === '1');
  const [songId] = useState(() => searchParams.get('songId') ?? undefined);

  const closeDrill = () => {
    setOpen(false);
    if (searchParams.get('session') === '1' || searchParams.get('songId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('session');
      next.delete('songId');
      setSearchParams(next, { replace: true });
    }
  };

  const seenCount =
    useLiveQuery<number>(
      () =>
        db.spacingState
          .where('moduleRef')
          .equals(CHORD_PROGRESSION_QUIZ_MODULE_REF)
          .count(),
      [],
    ) ?? 0;

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-4">

      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
        <div className="space-y-3">
          <div className="text-[11px] text-neutral-500">
            <span className="font-mono tabular-nums">{seenCount}</span> section
            {seenCount === 1 ? '' : 's'} reviewed
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            Start drill
          </button>
        </div>
      </section>

      {open && <ChordProgressionQuizDrill onClose={closeDrill} songId={songId} />}
    </div>
  );
}
