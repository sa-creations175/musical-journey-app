import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import ModuleIntro from '../../../components/ModuleIntro';
import DailyGoalBar from '../../../components/DailyGoalBar';
import ChordProgressionsQuiz from './ChordProgressionsQuiz';
import ProgressionFluencyTracker from './ProgressionFluencyTracker';

const MODULE_ID = 'chord-progressions';

export default function ChordProgressions() {
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
          <h1 className="text-2xl font-medium tracking-tight mt-2">chord progressions</h1>
          <p className="text-neutral-500 text-sm">
            hear the bass, the chord quality, and the full progression shape — in any key.
          </p>
        </div>
        <Link
          to="/ear-training/chord-progressions/calendar"
          className="text-xs text-neutral-500 hover:text-fluent mt-2"
        >
          view calendar →
        </Link>
      </div>

      <ModuleIntro
        accent="amber"
        headline="The bass and the progression tell you where you are in a song."
        description="This module trains your ear to hear both bass movement and harmonic patterns — the skills that unlock playing by ear."
        bullets={[
          'Hear the **bass root**, the **chord quality**, and the **full progression shape**',
          'Start with **foundational patterns**, grow into **genre-specific** vocabulary',
          'Recognize **named progressions** (like `1-5-6-4`) across thousands of real songs',
          '**Chromatic and borrowed chords** are where gospel, jazz, and soul get their signature color',
        ]}
      />

      <DailyGoalBar moduleId={MODULE_ID} />

      <ChordProgressionsQuiz attempts={attempts} />
      <ProgressionFluencyTracker attempts={attempts} />
    </div>
  );
}
