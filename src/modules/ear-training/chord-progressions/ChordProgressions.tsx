import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import ModuleIntro from '../../../components/ModuleIntro';
import DailyGoalBar from '../../../components/DailyGoalBar';
import { getPref, setPref } from '../../../lib/userPrefs';
import ChordProgressionsQuiz from './ChordProgressionsQuiz';
import KeyDetectionTab from './KeyDetectionTab';
import ChordMotionTab from './ChordMotionTab';
import ProgressionFluencyTracker from './ProgressionFluencyTracker';

const MODULE_ID = 'chord-progressions';
const PREF_ACTIVE_TAB = 'chordProgressionsActiveTab';

type TabId = 'key-detection' | 'chord-motion' | 'full-progression';

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  {
    id: 'key-detection',
    label: 'key detection',
    hint: 'find the tonal centre by ear',
  },
  {
    id: 'chord-motion',
    label: 'chord motion',
    hint: 'degree-to-degree fluency with scaffolding',
  },
  {
    id: 'full-progression',
    label: 'full progression',
    hint: 'the full tier-based progression catalogue',
  },
];

const DEFAULT_TAB: TabId = 'full-progression';

export default function ChordProgressions() {
  const [tab, setTab] = useState<TabId>(DEFAULT_TAB);
  const [tabHydrated, setTabHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getPref<TabId>(PREF_ACTIVE_TAB, DEFAULT_TAB);
      if (stored === 'key-detection' || stored === 'chord-motion' || stored === 'full-progression') {
        setTab(stored);
      }
      setTabHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!tabHydrated) return;
    setPref(PREF_ACTIVE_TAB, tab);
  }, [tab, tabHydrated]);

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

      {/* Tab navigation — all three surfaces share the module daily goal
          above and the fluency tracker below. Tabs themselves own their
          scope controls and per-drill state. */}
      <nav
        className="flex items-center gap-1 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur flex-wrap"
        aria-label="chord progressions mode"
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            aria-pressed={tab === t.id}
            className={`flex-1 min-w-[150px] px-3 py-2 rounded-md text-sm transition text-center ${
              tab === t.id
                ? 'bg-fluent text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <div className="font-medium">{t.label}</div>
            <div className={`text-[10px] mt-0.5 ${tab === t.id ? 'text-white/80' : 'text-neutral-500'}`}>
              {t.hint}
            </div>
          </button>
        ))}
      </nav>

      {tab === 'key-detection' && <KeyDetectionTab attempts={attempts} />}
      {tab === 'chord-motion' && <ChordMotionTab attempts={attempts} />}
      {tab === 'full-progression' && <ChordProgressionsQuiz attempts={attempts} />}

      <ProgressionFluencyTracker attempts={attempts} />
    </div>
  );
}
