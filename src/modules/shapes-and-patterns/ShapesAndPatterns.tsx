import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ModuleIntro from '../../components/ModuleIntro';
import { getPref, setPref } from '../../lib/userPrefs';
import { useUrlTabSync } from '../../lib/useUrlTabSync';
import TodayAndAttention from './TodayAndAttention';
import ChordShapeDrills from './ChordShapeDrills';
import ScaleDrills from './ScaleDrills';
import VoiceLeadingDrills from './VoiceLeadingDrills';
import MentalVizDrills from './MentalVizDrills';
import { cleanupGhostKeyboardIfNeeded } from './cleanup';
import type { QualityKind } from './catalog';

type TabId = 'chord-shapes' | 'scales' | 'voice-leading' | 'mental-viz';

function isTabId(v: string): v is TabId {
  return v === 'chord-shapes' || v === 'scales' || v === 'voice-leading' || v === 'mental-viz';
}

const PREF_ACTIVE_TAB = 'shapesAndPatternsActiveTab';
const PREF_CHORD_SCOPE = 'shapesAndPatternsChordScope';

// Scales first: they're the parent structure from which chords are
// derived, so leading with scales frames the rest of the module
// pedagogically. Mental viz stays last as the away-from-keyboard
// capstone.
const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: 'scales',        label: 'scales',             hint: 'major + natural minor across 12 keys' },
  { id: 'chord-shapes',  label: 'chord shapes',       hint: 'triads, sevenths, extensions — 12 keys' },
  { id: 'voice-leading', label: 'voice-leading',      hint: 'named patterns across 12 keys' },
  { id: 'mental-viz',    label: 'mental visualisation', hint: 'away-from-keyboard cognitive drills' },
];

const DEFAULT_TAB: TabId = 'scales';

export default function ShapesAndPatterns() {
  const [tab, setTab] = useState<TabId>(DEFAULT_TAB);
  const [chordScope, setChordScope] = useState<QualityKind | 'all'>('all');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getPref<TabId>(PREF_ACTIVE_TAB, DEFAULT_TAB);
      if (isTabId(t)) {
        setTab(t);
      }
      const s = await getPref<QualityKind | 'all'>(PREF_CHORD_SCOPE, 'all');
      if (s === 'all' || s === 'triad' || s === 'seventh' || s === 'extension' || s === 'special') {
        setChordScope(s);
      }
      setPrefsLoaded(true);
      // Retire any ghost-keyboard orphan drill rows from legacy data.
      await cleanupGhostKeyboardIfNeeded();
    })();
  }, []);

  // Sidebar sub-items land here as /shapes-and-patterns?tab=<id>.
  useUrlTabSync<TabId>('tab', isTabId, setTab);

  useEffect(() => { if (prefsLoaded) void setPref(PREF_ACTIVE_TAB, tab); }, [tab, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) void setPref(PREF_CHORD_SCOPE, chordScope); }, [chordScope, prefsLoaded]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">shapes &amp; patterns</h1>
          <p className="text-neutral-500 text-sm">
            the physical and mental command layer — where the hands catch up with what the rest of the app teaches.
          </p>
        </div>
        <Link
          to="/shapes-and-patterns/calendar"
          className="text-xs text-neutral-500 hover:text-fluent mt-2"
        >
          view calendar →
        </Link>
      </div>

      <ModuleIntro
        accent="green"
        headline="Drill reps compound. Show up across 12 keys."
        description="Chord shapes, scales, voice-leading patterns, and mental visualisation — every rep lands on a cell and the heat grid shows your landscape at a glance."
        bullets={[
          '**Heat grid** shows time invested × freshness across 12 keys',
          'Every drill is **editable** and **renameable**; add your own anytime',
          'Global **metronome** (top-right) auto-starts with every drill timer',
          'No daily goal — just honest accumulation',
        ]}
      />

      <TodayAndAttention />

      <nav
        className="flex items-center gap-1 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur flex-wrap"
        aria-label="shapes & patterns tab"
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            title={t.hint}
            className={`flex-1 min-w-[140px] px-3 py-2 rounded-md text-sm transition text-center ${
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

      {tab === 'chord-shapes' && (
        <ChordShapeDrills scope={chordScope} onScopeChange={setChordScope} />
      )}
      {tab === 'scales' && <ScaleDrills />}
      {tab === 'voice-leading' && <VoiceLeadingDrills />}
      {tab === 'mental-viz' && <MentalVizDrills />}
    </div>
  );
}
