import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { seedIntervals } from './seed';
import IntervalsQuiz from './IntervalsQuiz';
import FluencyTracker from './FluencyTracker';
import ModuleIntro from '../../../components/ModuleIntro';
import DailyGoalBar from '../../../components/DailyGoalBar';

const MODULE_ID = 'intervals';

export default function Intervals() {
  useEffect(() => {
    seedIntervals();
  }, []);

  const intervals = useLiveQuery(() => db.intervals.toArray(), []);
  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/ear-training" className="text-xs text-neutral-500 hover:text-fluent">
            ← ear training
          </Link>
          <h1 className="text-2xl font-medium tracking-tight mt-2">intervals</h1>
          <p className="text-neutral-500 text-sm">
            hear it, name it, log it.
          </p>
        </div>
        <Link
          to="/ear-training/intervals/calendar"
          className="text-xs text-neutral-500 hover:text-fluent mt-2"
        >
          view calendar →
        </Link>
      </div>

      <ModuleIntro
        accent="green"
        headline="Intervals are the building blocks of melody."
        description="This module trains your ear to instantly recognize the distance between notes."
        bullets={[
          'Every **melody** you love is built from intervals',
          'Fluency here unlocks **transcribing**, **finding songs by ear**, and **composing with intention**',
          'Use the **direction filter** to isolate ascending or descending',
          'Replace default anchor songs with references that click for you — **personal anchors stick faster**',
        ]}
      />

      <DailyGoalBar moduleId={MODULE_ID} />

      {!intervals || intervals.length === 0 ? (
        <div className="text-sm text-neutral-500">loading intervals…</div>
      ) : (
        <>
          <IntervalsQuiz intervals={intervals} attempts={attempts} />
          <FluencyTracker intervals={intervals} attempts={attempts} />
        </>
      )}
    </div>
  );
}
