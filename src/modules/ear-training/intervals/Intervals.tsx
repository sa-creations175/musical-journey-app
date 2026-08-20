import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { seedIntervals } from './seed';
import IntervalsQuiz from './IntervalsQuiz';
import FluencyTracker from './FluencyTracker';
import ModuleIntro from '../../../components/ModuleIntro';
import DailyGoalBar from '../../../components/DailyGoalBar';

const MODULE_ID = 'intervals';

export default function Intervals() {
  const [params] = useSearchParams();
  /** `?focus=M3|asc,m7|desc` — a dashboard row tap. Opens the quiz
   *  already in focus mode over exactly those intervals. */
  const focusKeys = useMemo(() => {
    const raw = params.get('focus');
    if (!raw) return undefined;
    const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
    return keys.length > 0 ? keys : undefined;
  }, [params]);

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/ear-training" className="text-xs text-neutral-500 hover:text-fluent">
          ← ear training
        </Link>
        <Link
          to="/ear-training/intervals/calendar"
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          view calendar →
        </Link>
      </div>

      <DailyGoalBar moduleId={MODULE_ID} />

      {!intervals || intervals.length === 0 ? (
        <div className="text-sm text-neutral-500">loading intervals…</div>
      ) : (
        <>
          <IntervalsQuiz
            intervals={intervals}
            attempts={attempts}
            {...(focusKeys ? { initialFocusKeys: focusKeys } : {})}
          />
          <FluencyTracker intervals={intervals} attempts={attempts} />
        </>
      )}

      {/* Learn-more card — secondary, below the practice surface. */}
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
    </div>
  );
}
