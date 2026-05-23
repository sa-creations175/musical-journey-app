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
  // Level-3 auto-launch: GO on the quiz session block routes here with
  // ?session=1 — open the drill straight away. Lazy-init (not an effect)
  // so `open` is independent of the param afterward; the stale param is
  // cleared on close.
  const [open, setOpen] = useState(() => searchParams.get('session') === '1');

  const closeDrill = () => {
    setOpen(false);
    if (searchParams.get('session') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('session');
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
      <header>
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          chord progression quiz
        </h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          away-from-keyboard recall of the progressions you’ve charted. Name a
          section’s progression, reveal the numbers, chord letters, and bar
          grid, then rate yourself. Spaced repetition surfaces the songs and
          sections that need work.
        </p>
      </header>

      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-neutral-500">
            <span className="font-mono tabular-nums">{seenCount}</span> section
            {seenCount === 1 ? '' : 's'} reviewed
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            start quiz
          </button>
        </div>
      </section>

      {open && <ChordProgressionQuizDrill onClose={closeDrill} />}
    </div>
  );
}
