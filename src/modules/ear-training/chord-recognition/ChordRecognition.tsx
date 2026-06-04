import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { seedChordQualities } from './seed';
import { migrateChordRecognitionInversionItemIds } from './inversionMigration';
import ChordRecognitionQuiz from './ChordRecognitionQuiz';
import ChordFluencyTracker from './ChordFluencyTracker';
import ModuleIntro from '../../../components/ModuleIntro';
import DailyGoalBar from '../../../components/DailyGoalBar';

const MODULE_ID = 'chord-recognition';

export default function ChordRecognition() {
  useEffect(() => {
    seedChordQualities();
    // One-shot: rewrite legacy chord-recognition attempt itemIds
    // ('maj') to canonical inversion-aware shape ('maj:0'). Idempotent.
    void migrateChordRecognitionInversionItemIds();
  }, []);

  const chords = useLiveQuery(() => db.chordQualities.toArray(), []);
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
          to="/ear-training/chord-recognition/calendar"
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          view calendar →
        </Link>
      </div>

      <DailyGoalBar moduleId={MODULE_ID} />

      {!chords || chords.length === 0 ? (
        <div className="text-sm text-neutral-500">loading chords…</div>
      ) : (
        <>
          <ChordRecognitionQuiz chords={chords} attempts={attempts} />
          <ChordFluencyTracker chords={chords} attempts={attempts} />
        </>
      )}

      {/* Learn-more card — secondary, below the practice surface. */}
      <ModuleIntro
        accent="blue"
        headline="Every chord has an emotional fingerprint."
        description="This module trains your ear to recognize chord qualities by sound alone."
        bullets={[
          '**Major** feels bright, **minor** feels inward, **dominant** feels hungry, **diminished** feels tense',
          'Tiers progress from **foundational triads** to sophisticated **extensions and colors**',
          '**Tier view** for learning progression; **Family view** to hear variations of a single chord type back to back',
          'Family view is where real sophistication develops — essential for the **neo-soul, gospel, and jazz** vocabulary',
        ]}
      />
    </div>
  );
}
